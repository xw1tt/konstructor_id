// План 19: обращения панели к нейросетям через сервер.
import type { ChatMessage, ChatReply, ProviderInput, ProviderPublic, ToolDef } from "@idk/shared/ai/model";
import { apiGet, apiSend } from "../api.ts";

export interface UsageTotal { provider: string; name: string; requests: number; prompt: number; completion: number }

export const aiApi = {
  providers: () => apiGet<{ active: string | null; providers: ProviderPublic[] }>("/api/ai/providers"),
  save: (id: string, p: Partial<ProviderInput>) => apiSend<ProviderPublic>("PUT", `/api/ai/providers/${encodeURIComponent(id)}`, p),
  remove: (id: string) => apiSend<void>("DELETE", `/api/ai/providers/${encodeURIComponent(id)}`),
  setActive: (id: string | null) => apiSend<{ active: string | null; providers: ProviderPublic[] }>("PUT", "/api/ai/active", { id }),
  test: (id: string) => apiSend<{ ok: boolean; text: string; ms: number }>("POST", `/api/ai/providers/${encodeURIComponent(id)}/test`),
  usage: () => apiGet<{ month: string; totals: UsageTotal[] }>("/api/ai/usage"),
  chat: (messages: ChatMessage[], tools: ToolDef[]) => apiSend<ChatReply>("POST", "/api/ai/chat", { messages, tools }),
};
