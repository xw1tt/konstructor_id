// Подставной API нейросети для тестов (план 18): записывает запросы, отвечает по очереди заготовленными ответами.
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttps } from "node:https";
import { after } from "node:test";

export interface Seen { path: string; headers: IncomingMessage["headers"]; body: any; raw: string }
export type Reply = { status?: number; json: unknown; delayMs?: number } | ((s: Seen) => { status?: number; json: unknown });

export async function fakeAi(routes: Record<string, Reply[]>, tls?: { key: string; cert: string }) {
  const seen: Seen[] = [];
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: any = raw;
      try { body = JSON.parse(raw); } catch { /* форма */ }
      const s: Seen = { path: req.url ?? "", headers: req.headers, body, raw };
      seen.push(s);
      const q = routes[s.path] ?? [];
      const r0 = q.length > 1 ? q.shift()! : q[0];
      if (!r0) { res.writeHead(404); res.end("{}"); return; }
      const r = typeof r0 === "function" ? r0(s) : r0;
      if ("delayMs" in r && r.delayMs) await new Promise((x) => setTimeout(x, r.delayMs));
      res.writeHead(r.status ?? 200, { "content-type": "application/json" });
      res.end(JSON.stringify(r.json));
    });
  };
  const server = tls ? createHttps(tls, handler) : createHttp(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  after(() => server.close());
  const addr = server.address() as { port: number };
  return { url: `${tls ? "https" : "http"}://127.0.0.1:${addr.port}`, seen };
}
