// План 16: библиотека компании в папке (локальной или сетевой). Запись — отдельный файл <вид>/<id>.json, id — от ключа
// записи, поэтому одна и та же запись с разных ПК попадает в один файл; запись — во временный файл и rename.
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { join } from "node:path";
import { LIB_KINDS, LibRecord, libColumns, libKey, libKeyFilled, type LibKind, type LibScan } from "@idk/shared/library/model";
import type { CellValue } from "@idk/shared/workbook/values";
import { HttpError } from "../http/router.ts";

const who = () => { try { return `${userInfo().username}@${hostname()}`; } catch { return hostname(); } };

const writeAtomic = (file: string, text: string) => {
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
};

export class LibraryStore {
  private settingsFile: string;
  constructor(private dataDir: string, private now: () => Date = () => new Date()) {
    this.settingsFile = join(dataDir, "settings.json");
  }

  private readSettings(): Record<string, unknown> {
    try { return JSON.parse(readFileSync(this.settingsFile, "utf8")); } catch { return {}; }
  }

  defaultDir(): string { return join(this.dataDir, "library"); }

  settings(): { dir: string; isDefault: boolean } {
    const d = this.readSettings().libraryDir;
    return typeof d === "string" && d.trim() ? { dir: d, isDefault: false } : { dir: this.defaultDir(), isDefault: true };
  }

  /** Новая папка библиотеки (null — по умолчанию): создаётся и проверяется запись. */
  setDir(dir: string | null): { dir: string; isDefault: boolean } {
    const target = dir?.trim() || null;
    this.check(target ?? this.defaultDir());
    const s = this.readSettings();
    if (target) s.libraryDir = target; else delete s.libraryDir;
    mkdirSync(this.dataDir, { recursive: true });
    writeAtomic(this.settingsFile, JSON.stringify(s, null, 2));
    return this.settings();
  }

  private check(dir: string) {
    try {
      mkdirSync(dir, { recursive: true });
      const probe = join(dir, `.probe-${randomUUID()}`);
      writeFileSync(probe, "");
      rmSync(probe, { force: true });
    } catch {
      throw new HttpError(400, `Папка библиотеки недоступна: ${dir}`);
    }
  }

  /** Папка библиотеки, готовая к работе; недоступна — ошибка с путём. */
  private root(): string {
    const { dir } = this.settings();
    try {
      for (const k of LIB_KINDS) mkdirSync(join(dir, k), { recursive: true });
      mkdirSync(join(dir, "files"), { recursive: true });
    } catch {
      throw new HttpError(400, `Папка библиотеки недоступна: ${dir}`);
    }
    return dir;
  }

  static idOf(kind: LibKind, key: string): string {
    return createHash("sha256").update(`${kind}\n${key}`).digest("hex").slice(0, 32);
  }

  list(kind: LibKind, q = ""): LibRecord[] {
    const dir = join(this.root(), kind);
    const out: LibRecord[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try { out.push(LibRecord.parse(JSON.parse(readFileSync(join(dir, f), "utf8")))); } catch { /* битый или недописанный файл — пропуск */ }
    }
    const needle = q.trim().toLowerCase();
    const text = (r: LibRecord) => Object.values(r.values).map((v) => (v === null ? "" : String(v))).join(" ").toLowerCase();
    const first = (r: LibRecord) => String(Object.values(r.values)[0] ?? "");
    return out.filter((r) => !needle || text(r).includes(needle)).sort((a, b) => first(a).localeCompare(first(b), "ru"));
  }

  get(kind: LibKind, id: string): LibRecord | null {
    if (!/^[0-9a-f]{32}$/.test(id)) return null;
    try { return LibRecord.parse(JSON.parse(readFileSync(join(this.root(), kind, `${id}.json`), "utf8"))); } catch { return null; }
  }

  /** Добавить или обновить по ключу. Скан не передан — остаётся прежний. */
  upsert(kind: LibKind, values: Record<string, CellValue>, scan: LibScan | null = null): { record: LibRecord; created: boolean } {
    const clean = Object.fromEntries(libColumns(kind).map((c) => [c.key, values[c.key] ?? null])) as Record<string, CellValue>;
    if (!libKeyFilled(kind, clean)) throw new HttpError(400, "Не заполнены ключевые поля записи");
    const root = this.root();
    const id = LibraryStore.idOf(kind, libKey(kind, clean));
    const prev = this.get(kind, id);
    const record: LibRecord = { id, kind, values: clean, scan: scan ?? prev?.scan ?? null, updatedAt: this.now().toISOString(), updatedBy: who() };
    writeAtomic(join(root, kind, `${id}.json`), JSON.stringify(record, null, 2));
    // Организация получила ИНН — прежняя запись по наименованию больше не нужна.
    if (kind === "org" && libKey(kind, clean).startsWith("inn:")) {
      const byName = LibraryStore.idOf(kind, libKey(kind, { shortName: clean.shortName }));
      if (byName !== id) rmSync(join(root, kind, `${byName}.json`), { force: true });
    }
    return { record, created: !prev };
  }

  remove(kind: LibKind, id: string): boolean {
    if (!this.get(kind, id)) return false;
    rmSync(join(this.root(), kind, `${id}.json`), { force: true });
    return true;
  }

  /** Скан из локального хранилища — в папку библиотеки (одно содержимое — один файл). */
  putScan(src: string, scan: LibScan): LibScan {
    const dst = this.scanPath(scan.sha256);
    if (!existsSync(dst)) {
      const tmp = `${dst}.${randomUUID()}.tmp`;
      copyFileSync(src, tmp);
      renameSync(tmp, dst);
    }
    return scan;
  }

  scanPath(sha256: string): string {
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new HttpError(400, "Неверный скан");
    return join(this.root(), "files", sha256);
  }
}
