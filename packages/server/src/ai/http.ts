// План 18: POST к API нейросети — node:http/https с таймаутом и дополнительным корневым сертификатом (GigaChat: Минцифры).
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";

export interface PostOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  caFile?: string;
  form?: boolean;
  /** 0.31: потоковый ответ — успешный (2xx) ответ отдаётся кусками сюда, а не собирается в text/json. */
  onChunk?: (text: string) => void;
  /** 0.31: отмена запроса (пользователь нажал «Остановить» или закрыл соединение). */
  signal?: AbortSignal;
}

/** 0.31: запрос отменён пользователем — не сетевая ошибка, не повторяется. */
export class AbortedError extends Error {
  constructor() {
    super("запрос отменён");
    this.name = "AbortError";
  }
}
export interface PostResult {
  status: number;
  json: any;
  text: string;
  /** 0.31: заголовки ответа (Retry-After при 429). */
  headers?: Record<string, string | string[] | undefined>;
  /** 0.31: сколько попыток понадобилось (postWithRetry; 1 — не пишется). */
  attempts?: number;
}

/** Ошибка связи с API (нет сети, сертификат, таймаут) — не ответ провайдера. */
export class NetError extends Error {
  constructor(
    message: string,
    readonly cert = false,
    /** 0.31: ответ провайдера уже начал приходить — повтор мог бы удвоить расход токенов. */
    readonly started = false,
    /** Код ошибки сети (ECONNRESET, ETIMEDOUT…) или "TIMEOUT". */
    readonly code = "",
  ) {
    super(message);
  }
}

const CERT_CODES = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/;

export function post(url: string, body: unknown, opts: PostOpts = {}): Promise<PostResult> {
  const u = new URL(url);
  const payload = opts.form ? String(body) : JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": opts.form ? "application/x-www-form-urlencoded" : "application/json",
    accept: opts.onChunk ? "text/event-stream" : "application/json",
    "content-length": String(Buffer.byteLength(payload)),
    ...opts.headers,
  };
  let ca: string[] | undefined;
  if (opts.caFile) {
    try {
      ca = [...rootCertificates, readFileSync(opts.caFile, "utf8")];
    } catch {
      return Promise.reject(new NetError(`Не удалось прочитать файл сертификата: ${opts.caFile}`, true));
    }
  }
  const req = u.protocol === "https:" ? httpsRequest : httpRequest;
  if (opts.signal?.aborted) return Promise.reject(new AbortedError());
  return new Promise((resolve, reject) => {
    let started = false;
    const r = req(u, { method: "POST", headers, ...(ca ? { ca } : {}) }, (res) => {
      started = true;
      const status = res.statusCode ?? 0;
      if (opts.onChunk && status >= 200 && status < 300) {
        // Поток: куски — сразу наружу (декодер не режет многобайтные буквы на границе кусков).
        res.setEncoding("utf8");
        let ended = false;
        res.on("data", (c: string) => opts.onChunk!(c));
        res.on("end", () => {
          ended = true;
          resolve({ status, json: null, text: "", headers: res.headers });
        });
        res.on("error", () => {});
        res.on("close", () => {
          if (ended) return;
          reject(opts.signal?.aborted ? new AbortedError() : new NetError("связь прервалась посреди ответа", false, true, "ECONNRESET"));
        });
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          /* не JSON */
        }
        resolve({ status: res.statusCode ?? 0, json, text, headers: res.headers });
      });
      res.on("error", (e: NodeJS.ErrnoException) => reject(new NetError(`связь прервалась (${e.code ?? e.message})`, false, true, String(e.code ?? ""))));
    });
    r.setTimeout(opts.timeoutMs ?? 120_000, () => r.destroy(new NetError("нейросеть не ответила вовремя", false, started, "TIMEOUT")));
    opts.signal?.addEventListener("abort", () => r.destroy(new AbortedError()), { once: true });
    r.on("error", (e: NodeJS.ErrnoException) => {
      if (e instanceof NetError || e instanceof AbortedError) return reject(e);
      const code = String(e.code ?? "");
      const cert = CERT_CODES.test(code) || CERT_CODES.test(e.message);
      reject(new NetError(cert ? `сертификат сервера не принят (${code || e.message})` : `нет связи (${code || e.message})`, cert, started, code));
    });
    r.end(payload);
  });
}
