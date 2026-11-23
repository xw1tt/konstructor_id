// 0.52: «Сервер сканов». На VPS (IDK_HUB_TOKEN задан) — хранилище по отпечатку для компьютеров пользователя:
// /api/hub/ping, /api/hub/have, /api/hub/file/:sha (только с ключом). На компьютере — настройка и сверка:
// /api/hub/config, /api/hub/test, /api/hub/sync, /api/hub/status.
import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { HttpError, Reply, type Router, type Ctx } from "../http/router.ts";
import type { Db } from "../db.ts";
import { fileBySha } from "../files/locate.ts";
import { saveFile, ALLOWED_MIME } from "../files/store.ts";
import { HubClient, HUB_LIMIT, sameToken } from "../hub/hub.ts";

export function hubRoutes(r: Router, db: Db, dataDir: string, client: HubClient, hubToken?: string) {
  // --- сервер сканов (VPS)
  const auth = (c: Ctx) => {
    if (!hubToken) throw new HttpError(404, "Сервер сканов не включён");
    const h = String(c.req.headers.authorization ?? "");
    if (!h.startsWith("Bearer ") || !sameToken(h.slice(7), hubToken)) throw new HttpError(401, "Неверный ключ доступа");
  };
  const sha = (c: Ctx) => {
    const s = c.params.sha.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(s)) throw new HttpError(400, "Неверный отпечаток файла");
    return s;
  };
  r.get("/api/hub/ping", (c) => {
    auth(c);
    return { ok: true, files: (db.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number }).n };
  });
  r.post("/api/hub/have", async (c) => {
    auth(c);
    const { shas } = await c.body(z.object({ shas: z.array(z.string()).max(5000) }), 1024 * 1024);
    return { have: shas.filter((s) => /^[0-9a-f]{64}$/.test(s) && fileBySha(db, s)) };
  });
  r.get("/api/hub/file/:sha", (c) => {
    auth(c);
    const f = fileBySha(db, sha(c));
    if (!f) throw new HttpError(404, "Нет файла");
    const abs = join(dataDir, "files", f.path);
    statSync(abs);
    c.res.writeHead(200, { "content-type": f.mime, "content-length": f.size, "x-file-name": encodeURIComponent(f.name) });
    createReadStream(abs)
      .on("error", () => c.res.destroy())
      .pipe(c.res);
  });
  r.put("/api/hub/file/:sha", async (c) => {
    auth(c);
    const want = sha(c);
    const mime = String(c.req.headers["content-type"] ?? "").split(";")[0];
    if (!ALLOWED_MIME[mime]) throw new HttpError(415, "Поддерживаются только PDF, JPEG и PNG");
    let name = want;
    try {
      name = decodeURIComponent(String(c.req.headers["x-file-name"] ?? want));
    } catch {
      /* имя как есть */
    }
    const f = await saveFile(db, dataDir, c.req, { name, mime }, HUB_LIMIT);
    if (f.sha256 !== want) throw new HttpError(400, "Файл повреждён при передаче (отпечаток не совпал)");
    return new Reply(201, { ok: true });
  });

  // --- компьютер пользователя
  r.get("/api/hub/config", () => client.config());
  r.put("/api/hub/config", async (c) => {
    const q = await c.body(z.object({ url: z.string(), token: z.string().optional() }));
    try {
      client.setConfig(q.url, q.token);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    return client.config();
  });
  r.post("/api/hub/test", () => client.test());
  r.post("/api/hub/sync", async (c) => {
    const q = await c.body(z.object({ shas: z.array(z.string()).max(20000).default([]) }), 4 * 1024 * 1024);
    return client.sync(q.shas.map((s) => s.toLowerCase()));
  });
  r.get("/api/hub/status", () => client.status);
}
