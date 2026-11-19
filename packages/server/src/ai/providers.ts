// План 18: запрос чата к подключению — OpenAI-совместимый формат (YandexGPT, локальная, любая) и GigaChat (functions).
import { randomUUID } from "node:crypto";
import { resolveProvider, type AssistantMessage, type ChatMessage, type ChatRequest, type Provider, type ToolCall, type Usage } from "@idk/shared/ai/model";
import { HttpError } from "../http/router.ts";
import { AbortedError, NetError, post as defaultPost, type PostOpts, type PostResult } from "./http.ts";
import { postWithRetry, type Post, type RetryDeps } from "./retry.ts";

export type { Post };
export interface ChatOut {
  message: AssistantMessage;
  usage: Usage;
}

/** Подсказка к частым ошибкам Yandex Cloud: в «ID каталога» — не тот идентификатор, у сервисного аккаунта нет роли. */
export function yandexHint(p: Provider, msg: string): string {
  if (p.kind !== "yandex") return "";
  const m = /does not match with service account folder ID '([^']+)'/.exec(msg);
  if (m)
    return (
      `. В поле «ID каталога» указан «${p.folderId}», а сервисный аккаунт ключа — из каталога ${m[1]}: впишите ${m[1]}` +
      " (ID каталога начинается с «b1g»; «aje…» — это ID сервисного аккаунта или ключа)"
    );
  if (/permission denied/i.test(msg)) return ". Выдайте сервисному аккаунту роль ai.languageModels.user в этом каталоге";
  return "";
}

const fail = (p: Provider, r: PostResult): never => {
  const raw = r.json?.error?.message ?? r.json?.message ?? r.json?.error ?? r.text.slice(0, 300);
  const msg = raw ? (typeof raw === "string" ? raw : JSON.stringify(raw)) : "";
  const tries = r.attempts ? ` (попыток: ${r.attempts})` : "";
  throw new HttpError(502, `${p.name}: ошибка ${r.status}${msg ? ` — ${msg}` : ""}${yandexHint(p, msg)}${tries}`);
};

/** Транспорт запросов к провайдеру: post + параметры повторов (0.31). */
export interface Transport {
  post: Post;
  retry?: RetryDeps;
  /** 0.31: отмена (поток помощника). */
  signal?: AbortSignal;
}

async function send(p: Provider, url: string, body: unknown, opts: PostOpts, t: Transport): Promise<PostResult> {
  try {
    return await postWithRetry(t.post, url, body, { caFile: p.caFile || undefined, ...(t.signal ? { signal: t.signal } : {}), ...opts }, t.retry);
  } catch (e) {
    if (e instanceof AbortedError) throw e;
    if (e instanceof NetError) {
      const hint = e.cert && p.kind === "gigachat" ? ". Укажите в подключении файл корневого сертификата Минцифры" : "";
      throw new HttpError(502, `${p.name}: ${e.message}${hint}`);
    }
    throw e;
  }
}

const parseArgs = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === "object") return v as Record<string, unknown>;
  try {
    const o = JSON.parse(String(v ?? "{}"));
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
};

// ---------- OpenAI-совместимые ----------

function toOpenAI(m: ChatMessage): unknown {
  switch (m.role) {
    case "assistant":
      return m.toolCalls.length
        ? {
            role: "assistant",
            content: m.content || null,
            tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments) } })),
          }
        : { role: "assistant", content: m.content };
    case "tool":
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    case "user":
      return m.images?.length
        ? { role: "user", content: [{ type: "text", text: m.content }, ...m.images.map((url) => ({ type: "image_url", image_url: { url } }))] }
        : { role: "user", content: m.content };
    default:
      return { role: m.role, content: m.content };
  }
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};

/** 0.34.1: 400 похоже на отказ из-за temperature: сервис назвал её или отказал без причины («provider rejected the request»). */
const tempRejected = (r: PostResult) =>
  r.status === 400 && /temperature|rejected the request|unsupported (value|parameter)/i.test(r.text || JSON.stringify(r.json ?? ""));

function openAIRequest(p0: Provider, req: ChatRequest) {
  const p = resolveProvider(p0);
  const headers: Record<string, string> = {};
  if (p.key) headers.authorization = `Bearer ${p.key}`;
  if (p.kind === "yandex" && p.folderId) headers["openai-project"] = p.folderId;
  // Claude (OpenAI-совместимый слой Anthropic): у новых моделей температура ниже 1 — ошибка 400, поэтому не передаётся.
  // 0.34.1: и через посредников — «anthropic/claude-opus-5.5», «claude-opus-5.5» (OpenRouter, mozg.world и т.п.).
  const claude = /(^|\.)anthropic\.com$/i.test(hostOf(p.baseUrl)) || /(^|[/:])claude[-_.]|^anthropic\//i.test(p.model);
  const body: Record<string, unknown> = { model: p.model, messages: req.messages.map(toOpenAI), ...(claude ? {} : { temperature: 0.2 }) };
  if (req.tools.length) {
    body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    body.tool_choice = "auto";
  }
  return { p, headers, body };
}

async function chatOpenAI(p0: Provider, req: ChatRequest, t: Transport): Promise<ChatOut> {
  const { p, headers, body } = openAIRequest(p0, req);
  let r = await send(p, `${p.baseUrl}/chat/completions`, body, { headers }, t);
  // 0.34.1: модель не принимает temperature (часть моделей через посредников) — один повтор без неё.
  if (tempRejected(r) && "temperature" in body) {
    delete body.temperature;
    r = await send(p, `${p.baseUrl}/chat/completions`, body, { headers }, t);
  }
  if (r.status >= 400 || !r.json?.choices?.[0]) fail(p, r);
  const msg = r.json.choices[0].message ?? {};
  const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((c: any) => ({
    id: String(c.id ?? randomUUID()),
    name: String(c.function?.name ?? ""),
    arguments: parseArgs(c.function?.arguments),
  }));
  return {
    message: { role: "assistant", content: String(msg.content ?? ""), toolCalls },
    usage: { prompt: Number(r.json.usage?.prompt_tokens) || 0, completion: Number(r.json.usage?.completion_tokens) || 0 },
  };
}

// ---------- GigaChat ----------

const tokens = new Map<string, { token: string; until: number }>();
/** Для тестов: сброс кеша токенов. */
export const resetGigaTokens = () => tokens.clear();

async function gigaToken(p: Provider, t: Transport, now: () => number, fresh = false): Promise<string> {
  const k = `${p.id}\n${p.key}\n${p.scope}`;
  const c = tokens.get(k);
  if (!fresh && c && c.until > now()) return c.token;
  const r = await send(
    p,
    p.authUrl,
    `scope=${encodeURIComponent(p.scope)}`,
    { form: true, headers: { authorization: `Basic ${p.key}`, rquid: randomUUID() } },
    t,
  );
  if (r.status >= 400 || !r.json?.access_token) fail(p, r);
  const exp = Number(r.json.expires_at) || now() + 30 * 60_000;
  tokens.set(k, { token: r.json.access_token, until: exp - 60_000 });
  return r.json.access_token;
}

/** Результат функции GigaChat — строка JSON. */
const asJson = (s: string) => {
  try {
    JSON.parse(s);
    return s;
  } catch {
    return JSON.stringify({ result: s });
  }
};

function toGiga(m: ChatMessage): unknown {
  switch (m.role) {
    case "assistant":
      return m.toolCalls.length
        ? { role: "assistant", content: m.content ?? "", function_call: { name: m.toolCalls[0].name, arguments: m.toolCalls[0].arguments } }
        : { role: "assistant", content: m.content };
    case "tool":
      return { role: "function", name: m.name, content: asJson(m.content) };
    default:
      return { role: m.role, content: m.content };
  }
}

async function chatGiga(p0: Provider, req: ChatRequest, t: Transport, now: () => number): Promise<ChatOut> {
  const p = resolveProvider(p0);
  const body: Record<string, unknown> = { model: p.model, messages: req.messages.map(toGiga), temperature: 0.2 };
  if (req.tools.length) {
    body.functions = req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
    body.function_call = "auto";
  }
  const call = async (fresh: boolean) =>
    send(p, `${p.baseUrl}/chat/completions`, body, { headers: { authorization: `Bearer ${await gigaToken(p, t, now, fresh)}` } }, t);
  let r = await call(false);
  if (r.status === 401) r = await call(true);
  if (r.status >= 400 || !r.json?.choices?.[0]) fail(p, r);
  const msg = r.json.choices[0].message ?? {};
  const fc = msg.function_call;
  const toolCalls: ToolCall[] = fc?.name
    ? [{ id: String(msg.functions_state_id ?? randomUUID()), name: String(fc.name), arguments: parseArgs(fc.arguments) }]
    : [];
  return {
    message: { role: "assistant", content: String(msg.content ?? ""), toolCalls },
    usage: { prompt: Number(r.json.usage?.prompt_tokens) || 0, completion: Number(r.json.usage?.completion_tokens) || 0 },
  };
}

export interface ChatDeps {
  post?: Post;
  now?: () => number;
  /** 0.31: параметры повторов (в тестах — без реальных пауз). */
  retry?: RetryDeps;
}

export async function chat(p: Provider, req: ChatRequest, deps: ChatDeps = {}): Promise<ChatOut> {
  const t: Transport = { post: deps.post ?? defaultPost, retry: deps.retry };
  return p.kind === "gigachat" ? chatGiga(p, req, t, deps.now ?? Date.now) : chatOpenAI(p, req, t);
}

// ---------- Потоковый ответ (0.31) ----------

export interface StreamHooks {
  /** Очередной кусок текста ответа. */
  onToken(text: string): void;
  /** Модель вызывает инструмент (имя известно до аргументов). */
  onTool?(name: string): void;
  signal?: AbortSignal;
}

/** Прерванный поток: что успело прийти и оценка расхода. */
export class StreamAborted extends Error {
  constructor(
    readonly partial: ChatOut,
    readonly byUser: boolean,
    message: string,
  ) {
    super(message);
  }
}

/** Грубая оценка токенов, если провайдер не прислал расход (≈3 символа на токен для русского текста). */
export const estimateTokens = (s: string) => Math.ceil(s.length / 3);

/** Разбор Server-Sent Events провайдера: строки «data: …», пустая строка — конец события. */
export function sseLines(onData: (data: string) => void) {
  let buf = "";
  return (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) onData(line.slice(5).trimStart());
    }
  };
}

async function streamOpenAI(p0: Provider, req: ChatRequest, t: Transport, hooks: StreamHooks): Promise<ChatOut> {
  const { p, headers, body } = openAIRequest(p0, req);
  let text = "";
  let usage: Usage | null = null;
  const calls: { id: string; name: string; args: string }[] = [];
  const onData = sseLines((data) => {
    if (data === "[DONE]") return;
    let j: any;
    try {
      j = JSON.parse(data);
    } catch {
      return;
    }
    if (j.usage) usage = { prompt: Number(j.usage.prompt_tokens) || 0, completion: Number(j.usage.completion_tokens) || 0 };
    const d = j.choices?.[0]?.delta ?? j.choices?.[0]?.message;
    if (!d) return;
    if (typeof d.content === "string" && d.content) {
      text += d.content;
      hooks.onToken(d.content);
    }
    for (const tc of d.tool_calls ?? []) {
      const k = Number(tc.index ?? calls.length);
      const c = (calls[k] ??= { id: "", name: "", args: "" });
      if (tc.id) c.id = String(tc.id);
      if (tc.function?.name) {
        c.name += String(tc.function.name);
        hooks.onTool?.(c.name);
      }
      if (tc.function?.arguments) c.args += String(tc.function.arguments);
    }
  });
  const out = (): ChatOut => ({
    message: {
      role: "assistant",
      content: text,
      toolCalls: calls.filter(Boolean).map((c) => ({ id: c.id || randomUUID(), name: c.name, arguments: parseArgs(c.args) })),
    },
    usage: usage ?? { prompt: estimateTokens(JSON.stringify(body.messages)), completion: estimateTokens(text + calls.map((c) => c.args).join("")) },
  });
  let r: PostResult;
  const go = () =>
    send(
      p,
      `${p.baseUrl}/chat/completions`,
      { ...body, stream: true, stream_options: { include_usage: true } },
      { headers, onChunk: onData, signal: hooks.signal },
      t,
    );
  try {
    r = await go();
    // 0.34.1: как в chatOpenAI — без temperature, если модель её не принимает (ответ ещё не начался).
    if (tempRejected(r) && "temperature" in body && !text && !calls.length) {
      delete body.temperature;
      r = await go();
    }
  } catch (e) {
    if (e instanceof AbortedError) throw new StreamAborted(out(), true, "ответ остановлен");
    // Поток оборвался посреди ответа — полученное сохраняется.
    if (text || calls.length) throw new StreamAborted(out(), false, `${p.name}: ${(e as Error).message}`);
    throw e;
  }
  if (r.status >= 400) fail(p, r);
  return out();
}

/**
 * Ответ потоком: OpenAI-совместимые — по кускам; GigaChat — буферизованно (один кусок с полным текстом), интерфейс
 * для панели тот же.
 */
export async function chatStream(p: Provider, req: ChatRequest, hooks: StreamHooks, deps: ChatDeps = {}): Promise<ChatOut> {
  const t: Transport = { post: deps.post ?? defaultPost, retry: deps.retry, signal: hooks.signal };
  if (p.kind === "gigachat") {
    let out: ChatOut;
    try {
      out = await chatGiga(p, req, t, deps.now ?? Date.now);
    } catch (e) {
      if (e instanceof AbortedError)
        throw new StreamAborted(
          { message: { role: "assistant", content: "", toolCalls: [] }, usage: { prompt: estimateTokens(JSON.stringify(req.messages)), completion: 0 } },
          true,
          "ответ остановлен",
        );
      throw e;
    }
    for (const c of out.message.toolCalls) hooks.onTool?.(c.name);
    if (out.message.content) hooks.onToken(out.message.content);
    return out;
  }
  return streamOpenAI(p, req, t, hooks);
}
