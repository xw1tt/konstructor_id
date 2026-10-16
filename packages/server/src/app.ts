import type { IncomingMessage, ServerResponse } from "node:http";
import type { Db } from "./db.ts";
import { Router, sendJson } from "./http/router.ts";
import { serveStatic } from "./http/static.ts";
import { fileRoutes } from "./routes/files.ts";
import { printRoutes } from "./routes/print.ts";
import { exportRoutes } from "./routes/export.ts";

export const DEFAULT_UPLOAD_LIMIT = 200 * 1024 * 1024;

export interface AppOptions {
  db: Db;
  dataDir: string;
  addinDir?: string;
  uploadLimit?: number;
  /** Адреса, с которых разрешены изменяющие запросы (панель). */
  allowedOrigins?: string[];
}

export const defaultOrigins = (port = 3443) => [`https://localhost:${port}`, `https://127.0.0.1:${port}`];

export function createApp(opts: AppOptions) {
  const api = new Router(opts.allowedOrigins ?? defaultOrigins());
  printRoutes(api);
  exportRoutes(api, opts.db);
  fileRoutes(api, opts.db, opts.dataDir, opts.uploadLimit ?? DEFAULT_UPLOAD_LIMIT);
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (await api.handle(req, res)) return;
      if (opts.addinDir && serveStatic("/addin/", opts.addinDir, req, res)) return;
      sendJson(res, 404, { error: "Не найдено: " + (req.url ?? "") });
    } catch (e) {
      // Последний рубеж: одна плохая заявка не должна останавливать сервер.
      console.error(e);
      if (!res.headersSent) sendJson(res, 500, { error: "Внутренняя ошибка сервера" });
      else res.destroy();
    }
  };
}
