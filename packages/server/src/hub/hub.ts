// 0.52: «Сервер сканов» — сканы одни на всех компьютерах пользователя без ручного копирования. Сервер — та же программа
// на арендованном VPS с ключом доступа (IDK_HUB_TOKEN); хранит файлы по отпечатку SHA-256.
// 0.52.1: вместо сервера — общая папка (сетевая папка офиса \\server\…, доступная и через VPN): файлы лежат в ней по
// отпечатку (<папка>\Конструктор ИД — сканы\ab\<sha>.pdf + .json с именем), программа на сервере не нужна. Компьютер с программой:
// загруженные сканы отправляет на сервер, сканы книги, которых у него нет, скачивает (в фоне при открытии книги и сразу,
// когда скан понадобился: предпросмотр, сборка комплекта).
import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream, copyFileSync, renameSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, isAbsolute, win32 } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { timingSafeEqual } from "node:crypto";
import type { Db } from "../db.ts";
import { fileBySha } from "../files/locate.ts";
import { saveFile } from "../files/store.ts";
import { logError } from "../diag/log.ts";

export interface HubConfig {
  /** https://… — сервер сканов; иначе — путь к общей папке. */
  url: string;
  token: string;
}

/** Подпапка общей папки, где программа хранит сканы. */
export const SHARE_DIR = "Конструктор ИД — сканы";
const isUrl = (u: string) => /^https:\/\//i.test(u);
const isPath = (u: string) => isAbsolute(u) || win32.isAbsolute(u) || u.startsWith("\\\\");
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

export interface HubStatus {
  configured: boolean;
  url: string;
  running: boolean;
  /** Скачано / отправлено за последнюю сверку. */
  pulled: number;
  pushed: number;
  /** Сканов книги нет ни здесь, ни на сервере. */
  missing: number;
  errors: string[];
  at: string | null;
  /** Последняя проверка связи. */
  online: boolean | null;
}

const SHA = /^[0-9a-f]{64}$/;
const HUB_LIMIT = 300 * 1024 * 1024;

export const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export class HubClient {
  private file: string;
  private cfg: HubConfig | null;
  private queue = new Set<string>();
  private pushAll = false;
  private loop: Promise<void> | null = null;
  status: HubStatus;

  constructor(
    private db: Db,
    private dataDir: string,
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.file = join(dataDir, "hub.json");
    this.cfg = this.load();
    this.status = { configured: !!this.cfg, url: this.cfg?.url ?? "", running: false, pulled: 0, pushed: 0, missing: 0, errors: [], at: null, online: null };
  }

  private load(): HubConfig | null {
    try {
      if (!existsSync(this.file)) return null;
      const c = JSON.parse(readFileSync(this.file, "utf8")) as HubConfig;
      return c.url && c.token ? c : null;
    } catch {
      return null;
    }
  }

  config(): { url: string; hasToken: boolean; kind: "server" | "folder" | "" } {
    return { url: this.cfg?.url ?? "", hasToken: !!this.cfg?.token, kind: !this.cfg ? "" : isUrl(this.cfg.url) ? "server" : "folder" };
  }

  // --- общая папка
  private get share() {
    return this.cfg && !isUrl(this.cfg.url) ? join(this.cfg.url, SHARE_DIR) : null;
  }
  private shareFile(sha: string) {
    return join(this.share!, sha.slice(0, 2), sha);
  }
  private shareMeta(sha: string): { name: string; mime: string } | null {
    try {
      return JSON.parse(readFileSync(`${this.shareFile(sha)}.json`, "utf8"));
    } catch {
      return null;
    }
  }

  /** url пустой — сервер сканов выключен. token не передан — прежний. */
  setConfig(url: string, token?: string) {
    const u = url.trim().replace(/\/+$/, "");
    if (!u) {
      this.cfg = null;
      writeFileSync(this.file, "{}");
    } else {
      if (isUrl(u)) {
        const t = token?.trim() || (this.cfg && isUrl(this.cfg.url) ? this.cfg.token : "");
        if (!t) throw new Error("Укажите ключ доступа к серверу сканов");
        if (!/^[\x21-\x7e]+$/.test(t)) throw new Error("Ключ доступа — латинские буквы, цифры и знаки, без пробелов");
        this.cfg = { url: u, token: t };
      } else if (isPath(url.trim())) {
        const dir = url.trim().replace(/[\\/]+$/, "");
        try {
          mkdirSync(join(dir, SHARE_DIR), { recursive: true });
          const probe = join(dir, SHARE_DIR, `.probe-${randomUUID()}`);
          writeFileSync(probe, "");
          rmSync(probe, { force: true });
        } catch (e) {
          throw new Error(`Общая папка недоступна для записи: ${dir} (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`, { cause: e });
        }
        this.cfg = { url: dir, token: "" };
      } else throw new Error("Укажите адрес сервера (https://…) или полный путь к общей папке (\\\\сервер\\папка или Z:\\папка)");
      mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.cfg, null, 2));
    }
    this.status = { ...this.status, configured: !!this.cfg, url: this.cfg?.url ?? "", online: null, errors: [] };
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const c = this.cfg!;
    const res = await this.fetchImpl(`${c.url}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${c.token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (res.status === 401 || res.status === 403) throw new Error("Сервер сканов не принял ключ доступа");
    return res;
  }

  async test(): Promise<{ ok: boolean; message: string; files?: number }> {
    if (!this.cfg) return { ok: false, message: "Сервер сканов не настроен" };
    if (this.share)
      try {
        let n = 0;
        for (const d of readdirSync(this.share)) if (/^[0-9a-f]{2}$/.test(d)) n += readdirSync(join(this.share, d)).filter((f) => f.endsWith(".json")).length;
        this.status.online = true;
        return { ok: true, message: `Общая папка доступна, сканов в ней: ${n}`, files: n };
      } catch (e) {
        this.status.online = false;
        return { ok: false, message: `Общая папка недоступна (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}) — проверьте сеть или VPN` };
      }
    try {
      const r = await this.call("/api/hub/ping");
      if (!r.ok) throw new Error(`Сервер ответил ${r.status}`);
      const j = (await r.json()) as { files: number };
      this.status.online = true;
      return { ok: true, message: `Связь есть, на сервере файлов: ${j.files}`, files: j.files };
    } catch (e) {
      this.status.online = false;
      return { ok: false, message: (e as Error).message.includes("fetch failed") ? "Нет связи с сервером сканов" : (e as Error).message };
    }
  }

  private async have(shas: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    if (this.share) {
      statSync(this.share); // нет папки (VPN выключен) — ошибка сверки, а не «ничего нет»
      for (const s of shas) if (existsSync(`${this.shareFile(s)}.json`)) out.add(s);
      return out;
    }
    for (let i = 0; i < shas.length; i += 1000) {
      const r = await this.call("/api/hub/have", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shas: shas.slice(i, i + 1000) }),
      });
      if (!r.ok) throw new Error(`Сервер сканов: ${r.status}`);
      for (const s of ((await r.json()) as { have: string[] }).have) out.add(s);
    }
    return out;
  }

  /** Скан с сервера → хранилище этого компьютера. false — на сервере его нет. */
  async pull(sha: string): Promise<boolean> {
    if (!this.cfg || !SHA.test(sha)) return false;
    if (fileBySha(this.db, sha)) return true;
    if (this.share) {
      const m = this.shareMeta(sha);
      if (!m) return false;
      const f = await saveFile(this.db, this.dataDir, createReadStream(`${this.shareFile(sha)}.${EXT[m.mime] ?? "pdf"}`), m, HUB_LIMIT);
      if (f.sha256 !== sha) throw new Error(`Скан «${m.name}» в общей папке повреждён (отпечаток не совпал)`);
      return true;
    }
    const r = await this.call(`/api/hub/file/${sha}`);
    if (r.status === 404) return false;
    if (!r.ok || !r.body) throw new Error(`Сервер сканов: ${r.status}`);
    const name = decodeURIComponent(r.headers.get("x-file-name") ?? `${sha}.pdf`);
    const mime = (r.headers.get("content-type") ?? "application/pdf").split(";")[0];
    const f = await saveFile(this.db, this.dataDir, Readable.fromWeb(r.body as never), { name, mime }, HUB_LIMIT);
    if (f.sha256 !== sha) throw new Error(`Скан «${name}» с сервера повреждён (отпечаток не совпал)`);
    return true;
  }

  private async push(sha: string): Promise<void> {
    const f = fileBySha(this.db, sha);
    if (!f) return;
    if (this.share) {
      // Файл — во временное имя и переименование; .json с именем — последним: он признак «файл есть».
      const base = this.shareFile(sha);
      mkdirSync(join(this.share, sha.slice(0, 2)), { recursive: true });
      const tmp = `${base}.${randomUUID()}.tmp`;
      copyFileSync(join(this.dataDir, "files", f.path), tmp);
      renameSync(tmp, `${base}.${EXT[f.mime] ?? "pdf"}`);
      writeFileSync(`${base}.json`, JSON.stringify({ name: f.name, mime: f.mime, size: f.size }));
      return;
    }
    const r = await this.call(`/api/hub/file/${sha}`, {
      method: "PUT",
      headers: { "content-type": f.mime, "x-file-name": encodeURIComponent(f.name), "content-length": String(f.size) },
      body: Readable.toWeb(createReadStream(join(this.dataDir, "files", f.path))) as never,
      duplex: "half",
    } as RequestInit);
    if (!r.ok) throw new Error(`Сервер сканов не принял «${f.name}»: ${r.status}`);
  }

  /** Скан нужен сейчас (предпросмотр, сборка): скачать, если его здесь нет. Ошибки связи — не ошибка запроса. */
  async ensure(shas: string[]): Promise<void> {
    if (!this.cfg) return;
    for (const s of new Set(shas.filter((x) => SHA.test(x) && !fileBySha(this.db, x))))
      try {
        if (await this.pull(s)) this.status.pulled++;
      } catch (e) {
        this.note(e);
      }
  }

  /** Сверка в фоне: сканы книги, которых здесь нет, — скачать; файлы этого компьютера, которых нет на сервере, — отправить. */
  sync(shas: string[], pushAll = true) {
    if (!this.cfg) return this.status;
    for (const s of shas) if (SHA.test(s)) this.queue.add(s);
    this.pushAll ||= pushAll;
    if (!this.loop)
      this.loop = this.run().finally(() => {
        this.loop = null;
      });
    return this.status;
  }

  /** После загрузки нового скана — отправить на сервер (в фоне). */
  uploaded(sha: string) {
    if (!this.cfg) return;
    this.sync([], true);
    void sha;
  }

  private note(e: unknown) {
    const code = (e as NodeJS.ErrnoException).code ?? "";
    const offline =
      (e as Error).message.includes("fetch failed") ||
      ["ENOENT", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "EACCES", "EPERM", "UNKNOWN", "EBUSY"].includes(code);
    const m = offline ? (this.share ? "Общая папка недоступна — проверьте сеть или VPN" : "Нет связи с сервером сканов") : (e as Error).message;
    if (!this.status.errors.includes(m)) this.status.errors = [...this.status.errors, m].slice(-5);
    if (offline) this.status.online = false;
  }

  private async run() {
    this.status = { ...this.status, running: true, pulled: 0, pushed: 0, missing: 0, errors: [] };
    try {
      while (this.queue.size || this.pushAll) {
        const want = [...this.queue].filter((s) => !fileBySha(this.db, s));
        this.queue.clear();
        const doPush = this.pushAll;
        this.pushAll = false;
        const local = doPush ? (this.db.prepare("SELECT sha256 FROM files").all() as { sha256: string }[]).map((r) => r.sha256) : [];
        const there = await this.have([...new Set([...want, ...local])]);
        this.status.online = true;
        for (const s of want) {
          if (!there.has(s)) {
            this.status.missing++;
            continue;
          }
          try {
            if (await this.pull(s)) this.status.pulled++;
          } catch (e) {
            this.note(e);
          }
        }
        for (const s of local) {
          if (there.has(s)) continue;
          try {
            await this.push(s);
            this.status.pushed++;
          } catch (e) {
            this.note(e);
          }
        }
      }
    } catch (e) {
      this.note(e);
      logError("hub sync", e);
    } finally {
      this.status = { ...this.status, running: false, at: new Date().toISOString() };
    }
  }
}

/** Отпечатки сканов в ссылках ячеек (…/api/files/N?sha=…). */
export const shasOf = (links: (string | null | undefined)[]) => [
  ...new Set(links.flatMap((l) => (l ? [...l.matchAll(/[?&]sha=([0-9a-f]{64})/gi)].map((m) => m[1].toLowerCase()) : []))),
];

export { HUB_LIMIT };
