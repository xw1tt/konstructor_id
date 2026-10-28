// План 18: подключения нейросетей и нейтральный формат обмена с моделью (сообщения, инструменты, ответ).
import { z } from "zod";

export const AI_KINDS = ["yandex", "gigachat", "local", "openai"] as const;
export type AiKind = (typeof AI_KINDS)[number];
export const AI_KIND_LABELS: Record<AiKind, string> = {
  yandex: "YandexGPT", gigachat: "GigaChat", local: "Локальная модель", openai: "OpenAI-совместимая",
};

export const AI_DEFAULTS: Record<AiKind, { baseUrl: string; model: string }> = {
  yandex: { baseUrl: "https://llm.api.cloud.yandex.net/v1", model: "" },
  gigachat: { baseUrl: "https://gigachat.devices.sberbank.ru/api/v1", model: "GigaChat-2-Pro" },
  local: { baseUrl: "http://localhost:11434/v1", model: "" },
  openai: { baseUrl: "", model: "" },
};
export const GIGACHAT_AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
export const GIGACHAT_SCOPES = ["GIGACHAT_API_PERS", "GIGACHAT_API_B2B", "GIGACHAT_API_CORP"] as const;

export const ProviderInput = z.object({
  name: z.string().trim().min(1, "Укажите название"),
  kind: z.enum(AI_KINDS),
  baseUrl: z.string().trim().default(""),
  model: z.string().trim().default(""),
  /** Пусто при сохранении — оставить прежний ключ. */
  key: z.string().trim().default(""),
  folderId: z.string().trim().default(""),
  scope: z.string().trim().default(""),
  authUrl: z.string().trim().default(""),
  caFile: z.string().trim().default(""),
  /** null — по умолчанию для вида и адреса. */
  maskNames: z.boolean().nullable().default(null),
});
export type ProviderInput = z.infer<typeof ProviderInput>;
export const Provider = ProviderInput.extend({ id: z.string().min(1) });
export type Provider = z.infer<typeof Provider>;

/** Подключение для панели: без ключа. */
export type ProviderPublic = Omit<Provider, "key"> & { hasKey: boolean };

const isLocalUrl = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(u);

/** Значения по умолчанию: адрес, модель (yandex — по каталогу), scope и адрес токена GigaChat, маска ФИО. */
export function resolveProvider(p: Provider): Provider & { maskNames: boolean } {
  const d = AI_DEFAULTS[p.kind];
  const baseUrl = (p.baseUrl || d.baseUrl).replace(/\/+$/, "");
  const model = p.model || (p.kind === "yandex" && p.folderId ? `gpt://${p.folderId}/yandexgpt/latest` : d.model);
  return {
    ...p, baseUrl, model,
    scope: p.kind === "gigachat" ? p.scope || GIGACHAT_SCOPES[0] : p.scope,
    authUrl: p.kind === "gigachat" ? p.authUrl || GIGACHAT_AUTH_URL : p.authUrl,
    maskNames: p.maskNames ?? (p.kind === "openai" && !isLocalUrl(baseUrl)),
  };
}

/** Чего не хватает подключению для работы. */
export function providerProblems(p: Provider): string[] {
  const r = resolveProvider(p);
  const out: string[] = [];
  if (!r.baseUrl) out.push("Укажите адрес API");
  else if (!/^https?:\/\//i.test(r.baseUrl)) out.push("Адрес API начинается с http:// или https://");
  if (!r.model) out.push(p.kind === "yandex" ? "Укажите ID каталога или модель" : "Укажите модель");
  if (p.kind !== "local" && !p.key) out.push(p.kind === "gigachat" ? "Укажите ключ авторизации" : "Укажите ключ API");
  if (p.key && !/^[\x21-\x7e]+$/.test(p.key)) out.push("Ключ содержит недопустимые символы — скопируйте его заново, без пробелов и переносов");
  return out;
}

export const publicProvider = ({ key, ...p }: Provider): ProviderPublic => ({ ...p, hasKey: !!key });

// ---------- Обмен с моделью ----------

export const ToolCall = z.object({ id: z.string(), name: z.string(), arguments: z.record(z.unknown()) });
export type ToolCall = z.infer<typeof ToolCall>;

export const ChatMessage = z.discriminatedUnion("role", [
  z.object({ role: z.literal("system"), content: z.string() }),
  /** images — страницы скана (data:image/png;base64,…) для моделей, которые видят изображения (0.29). */
  z.object({ role: z.literal("user"), content: z.string(), images: z.array(z.string()).optional() }),
  z.object({ role: z.literal("assistant"), content: z.string().default(""), toolCalls: z.array(ToolCall).default([]) }),
  z.object({ role: z.literal("tool"), toolCallId: z.string(), name: z.string(), content: z.string() }),
]);
export type ChatMessage = z.infer<typeof ChatMessage>;
export type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;

export const ToolDef = z.object({ name: z.string(), description: z.string(), parameters: z.record(z.unknown()) });
export type ToolDef = z.infer<typeof ToolDef>;

export const ChatRequest = z.object({ messages: z.array(ChatMessage).min(1), tools: z.array(ToolDef).default([]) });
export type ChatRequest = z.infer<typeof ChatRequest>;

export interface Usage { prompt: number; completion: number }
export interface ChatReply { message: AssistantMessage; usage: Usage; provider: string }
