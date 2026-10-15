import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".xml": "application/xml; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".map": "application/json",
};

/** Раздаёт файлы из dir по префиксу URL. true — запрос обработан. */
export function serveStatic(prefix: string, dir: string, req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method !== "GET" || !url.pathname.startsWith(prefix)) return false;
  let rel: string;
  try {
    rel = decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html";
  } catch {
    return false;
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = normalize(join(dir, rel));
  if (!file.startsWith(normalize(dir) + sep)) return false;
  try {
    if (!statSync(file).isFile()) return false;
  } catch {
    return false;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  createReadStream(file).on("error", () => res.destroy()).pipe(res);
  return true;
}
