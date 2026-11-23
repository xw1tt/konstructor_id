import { z } from "zod";
import { shasOf, type HubClient } from "../hub/hub.ts";
import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "../db.ts";
import { Router, Reply, HttpError, notFound } from "../http/router.ts";
import { saveFile, getFile, tooBig } from "../files/store.ts";
import { fileBySha, folderFiles, locateScan, scanFolders } from "../files/locate.ts";
import { relative } from "node:path";

export function fileRoutes(r: Router, db: Db, dataDir: string, uploadLimit: number, hub?: HubClient) {
  /**
   * 0.46.9: «Привязать сканы» — книга с другого компьютера: для каждой ссылки «Скан» находит файл на этом компьютере
   * (по отпечатку, номеру с проверкой имени, имени в папках сканов с подпапками), найденный в папке — кладёт в хранилище.
   * Ответ на строку: новый файл (номер, отпечаток, имя) или почему не найден.
   */
  r.post("/api/files/relink", async (c) => {
    const body = await c.body(
      z.object({
        scanFolder: z.string().default(""),
        items: z.array(z.object({ link: z.string().nullable().default(null), name: z.string().default("") })).max(5000),
      }),
      8 * 1024 * 1024,
    );
    const folders = scanFolders(body.scanFolder);
    if (hub) await hub.ensure(shasOf(body.items.map((i) => i.link)));
    const out: ({ ok: true; id: number; sha256: string; name: string } | { ok: false; message: string })[] = [];
    for (const it of body.items) {
      const r = locateScan(db, dataDir, it, folders);
      if (!r.ok) {
        out.push(r);
        continue;
      }
      if (r.from === "store") {
        out.push({ ok: true, id: r.file.id, sha256: r.file.sha256, name: r.file.name });
        continue;
      }
      try {
        const size = statSync(r.path).size;
        const f = await saveFile(db, dataDir, createReadStream(r.path), { name: r.name, mime: r.mime }, Math.max(size + 1, uploadLimit));
        hub?.uploaded(f.sha256);
        out.push({ ok: true, id: f.id, sha256: f.sha256, name: r.name });
      } catch (e) {
        out.push({ ok: false, message: `${r.path}: ${(e as Error).message}` });
      }
    }
    return { items: out };
  });
  /** 0.49: файлы «Папки сканов» (с подпапками) — для помощника: что лежит в папке, по части имени. */
  r.post("/api/files/folder", async (c) => {
    const body = await c.body(
      z.object({ scanFolder: z.string().default(""), contains: z.string().default(""), limit: z.number().int().min(1).max(500).default(100) }),
    );
    const folders = scanFolders(body.scanFolder);
    if (!folders.length) return { folders: [], total: 0, files: [] };
    const q = body.contains.trim().toLowerCase();
    const all = folders.flatMap((f) => folderFiles(f, true).map((e) => ({ name: e.name, path: relative(f, e.path), size: e.size })));
    const hit = q ? all.filter((e) => e.path.toLowerCase().includes(q)) : all;
    return { folders, total: hit.length, files: hit.slice(0, body.limit) };
  });
  r.post("/api/files", async (c) => {
    const mime = (c.req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    let name = "file";
    try {
      name = decodeURIComponent(String(c.req.headers["x-file-name"] ?? "file"));
    } catch {
      /* оставить по умолчанию */
    }
    const len = Number(c.req.headers["content-length"] ?? 0);
    try {
      if (len > uploadLimit) throw tooBig(uploadLimit);
      const saved = await saveFile(db, dataDir, c.req, { name, mime }, uploadLimit);
      hub?.uploaded(saved.sha256);
      return new Reply(201, saved);
    } catch (e) {
      // Дочитать тело, чтобы клиент получил ответ, а не обрыв соединения.
      c.res.setHeader("connection", "close");
      c.req.resume();
      throw e;
    }
  });
  // 0.44: число страниц скана (посчитано при загрузке) — для «Так будет сшит PDF» до сборки.
  /** 0.46.9: файл ссылки «…/api/files/N?sha=…» — по отпечатку (номер на другом компьютере чужой). */
  const fileOf = (c: { id(): number; query: URLSearchParams }) => {
    const sha = c.query.get("sha");
    return (sha && /^[0-9a-f]{64}$/i.test(sha) ? fileBySha(db, sha.toLowerCase()) : undefined) ?? (sha ? undefined : getFile(db, c.id()));
  };
  // 0.52: скана нет на этом компьютере — сервер сканов (если настроен).
  const fileOrHub = async (c: { id(): number; query: URLSearchParams }) => {
    const f = fileOf(c);
    const sha = c.query.get("sha");
    if (f || !hub || !sha) return f;
    await hub.ensure([sha.toLowerCase()]);
    return fileOf(c);
  };
  r.get("/api/files/:id/pages", async (c) => {
    const f = await fileOrHub(c);
    if (!f) throw notFound("Файл");
    return { pages: f.pages && f.pages > 0 ? f.pages : 1 };
  });
  r.get("/api/files/:id", async (c) => {
    const f = await fileOrHub(c);
    if (!f) throw new HttpError(404, "Скан не найден на этом компьютере. Нажмите «Привязать сканы» — программа найдёт файлы в «Папке сканов»");
    const abs = join(dataDir, "files", f.path);
    try {
      statSync(abs);
    } catch {
      throw new HttpError(404, "Файл скана отсутствует на диске. Загрузите его заново или восстановите из резервной копии");
    }
    c.res.writeHead(200, {
      "content-type": f.mime,
      "content-length": f.size,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name).replace(/['()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase())}`,
    });
    createReadStream(abs)
      .on("error", () => c.res.destroy())
      .pipe(c.res);
  });
}
