import type { IncomingMessage, ServerResponse } from "node:http";
import type { Db } from "./db.ts";
import { Router, sendJson } from "./http/router.ts";
import { objectRoutes } from "./routes/object.ts";
import { materialRoutes } from "./routes/materials.ts";
import { fileRoutes } from "./routes/files.ts";

export const DEFAULT_UPLOAD_LIMIT = 200 * 1024 * 1024;

export interface AppOptions {
  db: Db;
  dataDir: string;
  addinDir?: string;
  uploadLimit?: number;
}

export function createApp(opts: AppOptions) {
  const api = new Router();
  objectRoutes(api, opts.db);
  materialRoutes(api, opts.db);
  fileRoutes(api, opts.db, opts.dataDir, opts.uploadLimit ?? DEFAULT_UPLOAD_LIMIT);
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (await api.handle(req, res)) return;
    sendJson(res, 404, { error: "Не найдено: " + (req.url ?? "") });
  };
}
