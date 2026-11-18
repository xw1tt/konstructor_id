// План 19: обращения панели к нейросетям через сервер.
import { StreamStopped, type ChatMessage, type ChatReply, type ProviderInput, type ProviderPublic, type StreamHooks, type ToolDef } from "@idk/shared/ai/model";
import { ServerUnavailableError } from "../api.ts";
import { apiGet, apiSend } from "../api.ts";

export interface UsageTotal {
  provider: string;
  name: string;
  requests: number;
  prompt: number;
  completion: number;
}

export const aiApi = {
  providers: () => apiGet<{ active: string | null; providers: ProviderPublic[] }>("/api/ai/providers"),
  save: (id: string, p: Partial<ProviderInput>) => apiSend<ProviderPublic>("PUT", `/api/ai/providers/${encodeURIComponent(id)}`, p),
  remove: (id: string) => apiSend<void>("DELETE", `/api/ai/providers/${encodeURIComponent(id)}`),
  setActive: (id: string | null) => apiSend<{ active: string | null; providers: ProviderPublic[] }>("PUT", "/api/ai/active", { id }),
  test: (id: string) => apiSend<{ ok: boolean; text: string; ms: number }>("POST", `/api/ai/providers/${encodeURIComponent(id)}/test`),
  usage: () => apiGet<{ month: string; totals: UsageTotal[] }>("/api/ai/usage"),
  chat: (messages: ChatMessage[], tools: ToolDef[]) => apiSend<ChatReply>("POST", "/api/ai/chat", { messages, tools }),
  chatStream,
};

/** Разбор Server-Sent Events: строки «data: …». */
function sseLines(onData: (data: string) => void) {
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

/**
 * 0.31: ответ помощника потоком (POST /api/ai/chat/stream). Текст — в hooks.onToken по мере генерации; в конце —
 * полный ответ. Остановка (signal) или обрыв — StreamStopped с полученной частью.
 */
export async function chatStream(messages: ChatMessage[], tools: ToolDef[], hooks: StreamHooks, signal?: AbortSignal): Promise<ChatReply> {
  let res: Response;
  try {
    res = await fetch("/api/ai/chat/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, tools }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw new StreamStopped("", true, "Ответ остановлен");
    void e;
    throw new ServerUnavailableError();
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Ошибка сервера (${res.status})`);
  }
  let text = "";
  let done: ChatReply | null = null;
  let failed: { code: string; message: string; partial?: string } | null = null;
  const feed = sseLines((d) => {
    let e: any;
    try {
      e = JSON.parse(d);
    } catch {
      return;
    }
    if (e.type === "token") {
      text += e.text;
      hooks.onToken(e.text);
    } else if (e.type === "tool") hooks.onTool?.(e.name);
    else if (e.type === "done") done = { message: e.message, usage: e.usage, provider: e.provider };
    else if (e.type === "error") failed = e;
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      feed(dec.decode(value, { stream: true }));
    }
  } catch {
    if (signal?.aborted) throw new StreamStopped(text, true, "Ответ остановлен");
    throw new StreamStopped(text, false, "Ответ прерван: связь с сервером оборвалась");
  }
  if (done) return done;
  const f = failed as { code: string; message: string; partial?: string } | null;
  if (f && (f.code === "aborted" || f.code === "interrupted")) throw new StreamStopped(f.partial ?? text, f.code === "aborted", f.message);
  if (f) throw new Error(f.message);
  throw new StreamStopped(text, Boolean(signal?.aborted), signal?.aborted ? "Ответ остановлен" : "Ответ прерван: сервер не завершил ответ");
}
