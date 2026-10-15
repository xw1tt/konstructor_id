import type { IncomingMessage, ServerResponse } from "node:http";
import type { Db } from "./db.ts";
import { Router, sendJson } from "./http/router.ts";
import { objectRoutes } from "./routes/object.ts";

export interface AppOptions {
  db: Db;
  dataDir: string;
  addinDir?: string;
  uploadLimit?: number;
}

export function createApp(opts: AppOptions) {
  const api = new Router();
  objectRoutes(api, opts.db);
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (await api.handle(req, res)) return;
    sendJson(res, 404, { error: "Не найдено: " + (req.url ?? "") });
  };
}
