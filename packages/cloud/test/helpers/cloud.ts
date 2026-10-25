// Облачный сервер для тестов: PGlite в памяти, миграции, настоящий HTTP.
import { createServer } from "node:http";
import { after } from "node:test";
import { migrate, pgliteDb, type Db } from "@idk/cloud/db";
import { createCloudApp, type CloudOptions } from "@idk/cloud/app";
import { extendCloud } from "@idk/cloud/extend";

export const PANEL = "https://localhost:3443";

export interface TestCloud {
  db: Db; url: string;
  req(method: string, path: string, body?: unknown, opts?: { token?: string; origin?: string }): Promise<{ status: number; json: any; headers: Headers }>;
  clock: { now: Date };
}

export async function startCloud(o: Partial<CloudOptions> = {}): Promise<TestCloud> {
  const db = await pgliteDb();
  await migrate(db);
  const clock = { now: new Date("2026-10-25T09:00:00Z") };
  const { handler } = createCloudApp({ db, allowedOrigins: [PANEL], now: () => clock.now, extend: extendCloud("https://id.example.ru", () => clock.now), ...o });
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  after(async () => { server.close(); await db.close(); });
  const addr = server.address();
  const url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const req: TestCloud["req"] = async (method, path, body, opts = {}) => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.origin) headers.origin = opts.origin;
    const res = await fetch(url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return { db, url, req, clock };
}
