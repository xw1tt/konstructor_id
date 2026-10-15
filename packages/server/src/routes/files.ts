import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { Db } from "../db.ts";
import { Router, Reply, notFound } from "../http/router.ts";
import { saveFile, getFile, tooBig } from "../files/store.ts";

export function fileRoutes(r: Router, db: Db, dataDir: string, uploadLimit: number) {
  r.post("/api/files", async (c) => {
    const mime = (c.req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    let name = "file";
    try { name = decodeURIComponent(String(c.req.headers["x-file-name"] ?? "file")); } catch { /* оставить по умолчанию */ }
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
  r.get("/api/files/:id", (c) => {
    const f = getFile(db, c.id());
    if (!f) throw notFound("Файл");
    c.res.writeHead(200, {
      "content-type": f.mime,
      "content-length": f.size,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    });
    createReadStream(join(dataDir, "files", f.path)).pipe(c.res);
  });
}
