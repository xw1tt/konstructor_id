// Этап 1: облачный сервер — маршруты API, CORS для панели и консоли.
import type { IncomingMessage, ServerResponse } from "node:http";
import { Router, sendJson } from "@idk/server/http/router";
import type { Db } from "./db.ts";
import { Auth } from "./auth.ts";
import { authRoutes, type MeExtra } from "./routes/auth.ts";

export interface CloudOptions {
  db: Db;
  /** Адреса, с которых панель и консоль ходят в API (панель — https://localhost:3443). */
  allowedOrigins: string[];
  now?: () => Date;
  /** Подключение дополнительных маршрутов (баланс, владелец, консоль — планы 23–24). */
  extend?: (r: Router, ctx: { auth: Auth; db: Db }) => { meExtra?: MeExtra; static?: (req: IncomingMessage, res: ServerResponse) => boolean };
}

export function createCloudApp(o: CloudOptions) {
  const auth = new Auth(o.db, o.now);
  const api = new Router(o.allowedOrigins);
  const ext = o.extend?.(api, { auth, db: o.db }) ?? {};
  authRoutes(api, auth, o.db, ext.meExtra);
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    let origin = String(req.headers.origin ?? "");
    // Запрос со страницы самого сервера (консоль) — свой адрес, не «чужой сайт».
    try { if (origin && new URL(origin).host === req.headers.host) { delete req.headers.origin; origin = ""; } } catch { /* неверный Origin — проверит роутер */ }
    if (origin && o.allowedOrigins.includes(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "Origin");
      res.setHeader("access-control-allow-headers", "authorization, content-type");
      res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("access-control-max-age", "600");
    }
    if (req.method === "OPTIONS") { res.writeHead(origin && o.allowedOrigins.includes(origin) ? 204 : 403).end(); return; }
    try {
      if (await api.handle(req, res)) return;
      if (ext.static?.(req, res)) return;
      sendJson(res, 404, { error: "Не найдено: " + (req.url ?? "") });
    } catch (e) {
      console.error(e);
      if (!res.headersSent) sendJson(res, 500, { error: "Внутренняя ошибка сервера" });
      else res.destroy();
    }
  };
  return { handler, auth };
}
