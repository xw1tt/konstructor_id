// 0.31: повторы запросов к нейросети. Сбой сети, таймаут, ответ 5xx — до 2 повторов (через 1 и 3 с); 429 — один повтор
// после Retry-After (нет заголовка — 60 с, срок в прошлом — 1 с). Ответы 4xx (кроме 429) и ошибки сертификата не
// повторяются. Повтор — только пока ответ не начал приходить: иначе провайдер уже потратил токены.
import { randomUUID } from "node:crypto";
import { NetError, type PostOpts, type PostResult } from "./http.ts";
import { logLine } from "../diag/log.ts";

export type Post = (url: string, body: unknown, opts?: PostOpts) => Promise<PostResult>;

export interface RetryDeps {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (text: string) => void;
}

/** Задержки перед повторами после сбоя сети/5xx. */
export const NET_DELAYS_MS = [1000, 3000];
/** Пауза при 429 без заголовка Retry-After. */
export const RATE_LIMIT_DEFAULT_MS = 60_000;

/** Ошибка после всех попыток: текст + число попыток. */
export class RetryError extends NetError {
  constructor(
    message: string,
    readonly attempts: number,
    cause: NetError,
  ) {
    super(message, cause.cert, cause.started, cause.code);
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Пауза по заголовку Retry-After (секунды или дата). */
export function retryAfterMs(h: PostResult["headers"], now: number): number {
  const v = h?.["retry-after"];
  const raw = Array.isArray(v) ? v[0] : v;
  if (!raw) return RATE_LIMIT_DEFAULT_MS;
  const sec = Number(raw);
  if (Number.isFinite(sec)) return sec > 0 ? Math.min(sec * 1000, 10 * 60_000) : 1000;
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return RATE_LIMIT_DEFAULT_MS;
  return at > now ? Math.min(at - now, 10 * 60_000) : 1000;
}

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Запрос с повторами. Возвращает ответ провайдера (в том числе 4xx/5xx после исчерпания) или бросает RetryError. */
export async function postWithRetry(post: Post, url: string, body: unknown, opts: PostOpts = {}, deps: RetryDeps = {}): Promise<PostResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((t: string) => logLine("ai", t));
  const id = randomUUID().slice(0, 8);
  let netRetries = 0;
  let rateRetried = false;
  for (let attempt = 1; ; attempt++) {
    let r: PostResult;
    try {
      r = await post(url, body, opts);
    } catch (e) {
      if (!(e instanceof NetError)) throw e;
      log(`запрос ${id} попытка ${attempt} ${host(url)}: ${e.message}`);
      if (e.cert || e.started || netRetries >= NET_DELAYS_MS.length) {
        throw new RetryError(attempt > 1 ? `${e.message} (попыток: ${attempt})` : e.message, attempt, e);
      }
      await sleep(NET_DELAYS_MS[netRetries++]);
      continue;
    }
    log(`запрос ${id} попытка ${attempt} ${host(url)}: ответ ${r.status}`);
    if (r.status === 429 && !rateRetried) {
      rateRetried = true;
      await sleep(retryAfterMs(r.headers, now()));
      continue;
    }
    if (r.status >= 500 && netRetries < NET_DELAYS_MS.length) {
      await sleep(NET_DELAYS_MS[netRetries++]);
      continue;
    }
    return attempt > 1 ? { ...r, attempts: attempt } : r;
  }
}
