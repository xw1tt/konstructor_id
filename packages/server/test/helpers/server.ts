import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { after } from "node:test";
import { openDb } from "@idk/server/db";
import { createApp, type AppOptions } from "@idk/server/app";
import { tmpDir } from "./tmp.ts";

export interface TestServer {
  url: string;
  req: (method: string, path: string, body?: unknown) => Promise<{ status: number; json: any }>;
  raw: (method: string, path: string, init?: RequestInit) => Promise<Response>;
}

export async function startTestServer(opts: Partial<AppOptions> = {}): Promise<TestServer> {
  const dataDir = tmpDir();
  const db = openDb(join(dataDir, "db.sqlite"));
  const server: Server = createServer(createApp({ db, dataDir, ...opts }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  after(() => { server.close(); db.close(); });
  const addr = server.address();
  const url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const raw = (method: string, path: string, init: RequestInit = {}) => fetch(url + path, { method, ...init });
  const req = async (method: string, path: string, body?: unknown) => {
    const res = await raw(method, path, body === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  return { url, req, raw };
}
