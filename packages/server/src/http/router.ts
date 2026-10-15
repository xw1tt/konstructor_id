import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  /** Тело JSON, проверенное схемой. */
  body<T>(schema: ZodType<T, any, any>): Promise<T>;
  /** Числовой параметр :id. */
  id(): number;
}

/** Ответ обработчика: значение → 200 JSON; Reply → указанный статус; undefined → ответ уже отправлен. */
export class Reply {
  constructor(public status: number, public json?: unknown) {}
}

type Handler = (ctx: Ctx) => unknown | Promise<unknown>;
interface Route { method: string; re: RegExp; keys: string[]; handler: Handler }

const JSON_LIMIT = 1024 * 1024;

export function sendJson(res: ServerResponse, status: number, data?: unknown) {
  if (data === undefined) {
    res.writeHead(status).end();
    return;
  }
  const s = JSON.stringify(data);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" }).end(s);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== undefined;
  if (hasBody && type !== "application/json") throw new HttpError(415, "Ожидается тело в формате JSON (application/json)");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > JSON_LIMIT) throw new HttpError(413, "Слишком большой запрос");
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Неверный JSON в запросе");
  }
}

function zodMessage(e: ZodError): string {
  return e.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}

export class Router {
  private routes: Route[] = [];

  /** Изменяющие запросы с заголовком Origin принимаются только с этих адресов (защита от CSRF). */
  constructor(private allowedOrigins: string[] = []) {}

  add(method: string, pattern: string, handler: Handler) {
    const keys: string[] = [];
    const re = new RegExp(
      "^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$",
    );
    this.routes.push({ method, re, keys, handler });
    return this;
  }
  get(p: string, h: Handler) { return this.add("GET", p, h); }
  post(p: string, h: Handler) { return this.add("POST", p, h); }
  put(p: string, h: Handler) { return this.add("PUT", p, h); }
  delete(p: string, h: Handler) { return this.add("DELETE", p, h); }

  /** true, если путь обработан роутером. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost");
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      sendJson(res, 400, { error: "Неверная кодировка адреса" });
      return true;
    }
    let matched: { route: Route; m: RegExpMatchArray } | undefined;
    for (const route of this.routes) {
      const m = path.match(route.re);
      if (m && route.method === req.method) { matched = { route, m }; break; }
    }
    if (!matched) return false;
    if (req.method !== "GET" && req.headers.origin && !this.allowedOrigins.includes(req.headers.origin)) {
      sendJson(res, 403, { error: "Запрос с чужого сайта отклонён" });
      return true;
    }
    const params: Record<string, string> = {};
    matched.route.keys.forEach((k, i) => (params[k] = matched!.m[i + 1]));
    const ctx: Ctx = {
      req, res, params, query: url.searchParams,
      async body(schema) {
        const raw = await readJson(req);
        const r = schema.safeParse(raw);
        if (!r.success) throw new HttpError(400, zodMessage(r.error));
        return r.data;
      },
      id() {
        const n = Number(params.id);
        if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Неверный идентификатор");
        return n;
      },
    };
    try {
      const out = await matched.route.handler(ctx);
      if (res.headersSent) return true;
      if (out instanceof Reply) sendJson(res, out.status, out.json);
      else if (out === undefined) sendJson(res, 204);
      else sendJson(res, 200, out);
    } catch (e) {
      if (res.headersSent) { res.destroy(); return true; }
      if (e instanceof HttpError) sendJson(res, e.status, { error: e.message });
      else {
        console.error(e);
        sendJson(res, 500, { error: "Внутренняя ошибка сервера: " + (e as Error).message });
      }
    }
    return true;
  }
}

export const notFound = (what = "Запись") => new HttpError(404, `${what} не найдена`);
