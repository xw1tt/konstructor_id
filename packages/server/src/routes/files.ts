import { z } from "zod";
import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "../db.ts";
import { Router, Reply, HttpError, notFound } from "../http/router.ts";
import { saveFile, getFile, tooBig } from "../files/store.ts";
import { fileBySha, locateScan, scanFolders } from "../files/locate.ts";

export function fileRoutes(r: Router, db: Db, dataDir: string, uploadLimit: number) {
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
        out.push({ ok: true, id: f.id, sha256: f.sha256, name: r.name });
      } catch (e) {
        out.push({ ok: false, message: `${r.path}: ${(e as Error).message}` });
      }
    }
    return { items: out };
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
      return new Reply(201, await saveFile(db, dataDir, c.req, { name, mime }, uploadLimit));
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
  r.get("/api/files/:id/pages", (c) => {
    const f = fileOf(c);
    if (!f) throw notFound("Файл");
    return { pages: f.pages && f.pages > 0 ? f.pages : 1 };
  });
  r.get("/api/files/:id", (c) => {
    const f = fileOf(c);
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
