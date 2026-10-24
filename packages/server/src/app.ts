import type { IncomingMessage, ServerResponse } from "node:http";
import type { Db } from "./db.ts";
import { Router, sendJson } from "./http/router.ts";
import { serveStatic } from "./http/static.ts";
import { fileRoutes } from "./routes/files.ts";
import { printRoutes } from "./routes/print.ts";
import { normRoutes } from "./routes/norms.ts";
import { exportRoutes } from "./routes/export.ts";
import { kitRoutes } from "./routes/kit.ts";
import { ojrRoutes } from "./routes/ojr.ts";
import { rkcRoutes } from "./routes/rkc.ts";
import { templateRoutes } from "./routes/templates.ts";
import { TemplateStore } from "./forms/store.ts";

export const DEFAULT_UPLOAD_LIMIT = 200 * 1024 * 1024;

export interface AppOptions {
  db: Db;
  dataDir: string;
  addinDir?: string;
  uploadLimit?: number;
  /** Адреса, с которых разрешены изменяющие запросы (панель). */
  allowedOrigins?: string[];
  /** Для тестов: подмена доступа к порталу protect.gost.ru и пауз при обновлении справочника. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export const defaultOrigins = (port = 3443) => [`https://localhost:${port}`, `https://127.0.0.1:${port}`];

export function createApp(opts: AppOptions) {
  const api = new Router(opts.allowedOrigins ?? defaultOrigins());
  printRoutes(api);
  exportRoutes(api, opts.db);
  normRoutes(api, opts.db, { fetchImpl: opts.fetchImpl, sleep: opts.sleep });
  fileRoutes(api, opts.db, opts.dataDir, opts.uploadLimit ?? DEFAULT_UPLOAD_LIMIT);
  kitRoutes(api, opts.db, opts.dataDir);
  ojrRoutes(api);
  rkcRoutes(api);
  templateRoutes(api, new TemplateStore(opts.dataDir));
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
