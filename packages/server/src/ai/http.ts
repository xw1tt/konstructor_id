// План 18: POST к API нейросети — node:http/https с таймаутом и дополнительным корневым сертификатом (GigaChat: Минцифры).
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";

export interface PostOpts { headers?: Record<string, string>; timeoutMs?: number; caFile?: string; form?: boolean }
export interface PostResult { status: number; json: any; text: string }

/** Ошибка связи с API (нет сети, сертификат, таймаут) — не ответ провайдера. */
export class NetError extends Error {
  constructor(message: string, readonly cert = false) { super(message); }
}

const CERT_CODES = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/;

export function post(url: string, body: unknown, opts: PostOpts = {}): Promise<PostResult> {
  const u = new URL(url);
  const payload = opts.form ? String(body) : JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": opts.form ? "application/x-www-form-urlencoded" : "application/json",
    accept: "application/json",
    "content-length": String(Buffer.byteLength(payload)),
    ...opts.headers,
  };
  let ca: string[] | undefined;
  if (opts.caFile) {
    try { ca = [...rootCertificates, readFileSync(opts.caFile, "utf8")]; }
    catch { return Promise.reject(new NetError(`Не удалось прочитать файл сертификата: ${opts.caFile}`, true)); }
  }
  const req = u.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const r = req(u, { method: "POST", headers, ...(ca ? { ca } : {}) }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json: any = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
        resolve({ status: res.statusCode ?? 0, json, text });
      });
      res.on("error", (e) => reject(new NetError(e.message)));
    });
    r.setTimeout(opts.timeoutMs ?? 120_000, () => r.destroy(new NetError("Нейросеть не ответила вовремя")));
    r.on("error", (e: NodeJS.ErrnoException) => {
      if (e instanceof NetError) return reject(e);
      const code = String(e.code ?? "");
      reject(new NetError(CERT_CODES.test(code) || CERT_CODES.test(e.message) ? `сертификат сервера не принят (${code || e.message})` : `нет связи (${code || e.message})`, CERT_CODES.test(code)));
    });
    r.end(payload);
  });
}
