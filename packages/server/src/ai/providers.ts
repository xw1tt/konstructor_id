// План 18: запрос чата к подключению — OpenAI-совместимый формат (YandexGPT, локальная, любая) и GigaChat (functions).
import { randomUUID } from "node:crypto";
import { resolveProvider, type AssistantMessage, type ChatMessage, type ChatRequest, type Provider, type ToolCall, type Usage } from "@idk/shared/ai/model";
import { HttpError } from "../http/router.ts";
import { NetError, post as defaultPost, type PostOpts, type PostResult } from "./http.ts";

export type Post = (url: string, body: unknown, opts?: PostOpts) => Promise<PostResult>;
export interface ChatOut { message: AssistantMessage; usage: Usage }

/** Подсказка к частым ошибкам Yandex Cloud: в «ID каталога» — не тот идентификатор, у сервисного аккаунта нет роли. */
export function yandexHint(p: Provider, msg: string): string {
  if (p.kind !== "yandex") return "";
  const m = /does not match with service account folder ID '([^']+)'/.exec(msg);
  if (m) return `. В поле «ID каталога» указан «${p.folderId}», а сервисный аккаунт ключа — из каталога ${m[1]}: впишите ${m[1]}` +
    " (ID каталога начинается с «b1g»; «aje…» — это ID сервисного аккаунта или ключа)";
  if (/permission denied/i.test(msg)) return ". Выдайте сервисному аккаунту роль ai.languageModels.user в этом каталоге";
  return "";
}

const fail = (p: Provider, r: PostResult): never => {
  const raw = r.json?.error?.message ?? r.json?.message ?? r.json?.error ?? r.text.slice(0, 300);
  const msg = raw ? (typeof raw === "string" ? raw : JSON.stringify(raw)) : "";
  throw new HttpError(502, `${p.name}: ошибка ${r.status}${msg ? ` — ${msg}` : ""}${yandexHint(p, msg)}`);
};

async function send(p: Provider, url: string, body: unknown, opts: PostOpts, post: Post): Promise<PostResult> {
  try {
    return await post(url, body, { caFile: p.caFile || undefined, ...opts });
  } catch (e) {
    if (e instanceof NetError) {
      const hint = e.cert && p.kind === "gigachat" ? ". Укажите в подключении файл корневого сертификата Минцифры" : "";
      throw new HttpError(502, `${p.name}: ${e.message}${hint}`);
    }
    throw e;
  }
}

const parseArgs = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === "object") return v as Record<string, unknown>;
  try { const o = JSON.parse(String(v ?? "{}")); return o && typeof o === "object" ? o : {}; } catch { return {}; }
};

// ---------- OpenAI-совместимые ----------

function toOpenAI(m: ChatMessage): unknown {
  switch (m.role) {
    case "assistant":
      return m.toolCalls.length
        ? { role: "assistant", content: m.content || null, tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) }
        : { role: "assistant", content: m.content };
    case "tool": return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    case "user":
      return m.images?.length
        ? { role: "user", content: [{ type: "text", text: m.content }, ...m.images.map((url) => ({ type: "image_url", image_url: { url } }))] }
        : { role: "user", content: m.content };
    default: return { role: m.role, content: m.content };
  }
}

const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return ""; } };

async function chatOpenAI(p0: Provider, req: ChatRequest, post: Post): Promise<ChatOut> {
  const p = resolveProvider(p0);
  const headers: Record<string, string> = {};
  if (p.key) headers.authorization = `Bearer ${p.key}`;
  if (p.kind === "yandex" && p.folderId) headers["openai-project"] = p.folderId;
  // Claude (OpenAI-совместимый слой Anthropic): у новых моделей температура ниже 1 — ошибка 400, поэтому не передаётся.
  const claude = /(^|\.)anthropic\.com$/i.test(hostOf(p.baseUrl)) || /^claude-/i.test(p.model);
  const body: Record<string, unknown> = { model: p.model, messages: req.messages.map(toOpenAI), ...(claude ? {} : { temperature: 0.2 }) };
  if (req.tools.length) {
    body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    body.tool_choice = "auto";
  }
  const r = await send(p, `${p.baseUrl}/chat/completions`, body, { headers }, post);
  if (r.status >= 400 || !r.json?.choices?.[0]) fail(p, r);
  const msg = r.json.choices[0].message ?? {};
  const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((c: any) => ({ id: String(c.id ?? randomUUID()), name: String(c.function?.name ?? ""), arguments: parseArgs(c.function?.arguments) }));
  return {
    message: { role: "assistant", content: String(msg.content ?? ""), toolCalls },
    usage: { prompt: Number(r.json.usage?.prompt_tokens) || 0, completion: Number(r.json.usage?.completion_tokens) || 0 },
  };
}

// ---------- GigaChat ----------

const tokens = new Map<string, { token: string; until: number }>();
/** Для тестов: сброс кеша токенов. */
export const resetGigaTokens = () => tokens.clear();

async function gigaToken(p: Provider, post: Post, now: () => number, fresh = false): Promise<string> {
  const k = `${p.id}\n${p.key}\n${p.scope}`;
  const c = tokens.get(k);
  if (!fresh && c && c.until > now()) return c.token;
  const r = await send(p, p.authUrl, `scope=${encodeURIComponent(p.scope)}`, { form: true, headers: { authorization: `Basic ${p.key}`, rquid: randomUUID() } }, post);
  if (r.status >= 400 || !r.json?.access_token) fail(p, r);
  const exp = Number(r.json.expires_at) || now() + 30 * 60_000;
  tokens.set(k, { token: r.json.access_token, until: exp - 60_000 });
  return r.json.access_token;
}

/** Результат функции GigaChat — строка JSON. */
const asJson = (s: string) => { try { JSON.parse(s); return s; } catch { return JSON.stringify({ result: s }); } };

function toGiga(m: ChatMessage): unknown {
  switch (m.role) {
    case "assistant":
      return m.toolCalls.length
        ? { role: "assistant", content: m.content ?? "", function_call: { name: m.toolCalls[0].name, arguments: m.toolCalls[0].arguments } }
        : { role: "assistant", content: m.content };
    case "tool": return { role: "function", name: m.name, content: asJson(m.content) };
    default: return { role: m.role, content: m.content };
  }
}

async function chatGiga(p0: Provider, req: ChatRequest, post: Post, now: () => number): Promise<ChatOut> {
  const p = resolveProvider(p0);
  const body: Record<string, unknown> = { model: p.model, messages: req.messages.map(toGiga), temperature: 0.2 };
  if (req.tools.length) {
    body.functions = req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
    body.function_call = "auto";
  }
  const call = async (fresh: boolean) =>
    send(p, `${p.baseUrl}/chat/completions`, body, { headers: { authorization: `Bearer ${await gigaToken(p, post, now, fresh)}` } }, post);
  let r = await call(false);
  if (r.status === 401) r = await call(true);
  if (r.status >= 400 || !r.json?.choices?.[0]) fail(p, r);
  const msg = r.json.choices[0].message ?? {};
  const fc = msg.function_call;
  const toolCalls: ToolCall[] = fc?.name ? [{ id: String(msg.functions_state_id ?? randomUUID()), name: String(fc.name), arguments: parseArgs(fc.arguments) }] : [];
  return {
    message: { role: "assistant", content: String(msg.content ?? ""), toolCalls },
    usage: { prompt: Number(r.json.usage?.prompt_tokens) || 0, completion: Number(r.json.usage?.completion_tokens) || 0 },
  };
}

export async function chat(p: Provider, req: ChatRequest, deps: { post?: Post; now?: () => number } = {}): Promise<ChatOut> {
  const post = deps.post ?? defaultPost;
  return p.kind === "gigachat" ? chatGiga(p, req, post, deps.now ?? Date.now) : chatOpenAI(p, req, post);
}
