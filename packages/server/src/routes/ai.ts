// План 18: подключения нейросетей, проверка, чат через активное подключение, расход.
import { z } from "zod";
import { ChatRequest, ProviderInput, providerProblems, publicProvider } from "@idk/shared/ai/model";
import { HttpError } from "../http/router.ts";
import { Router } from "../http/router.ts";
import type { AiStore } from "../ai/store.ts";
import { chat, type Post } from "../ai/providers.ts";

export function aiRoutes(r: Router, store: AiStore, deps: { post?: Post } = {}) {
  r.get("/api/ai/providers", () => store.list());
  r.put("/api/ai/providers/:id", async (c) => store.save(c.params.id, await c.body(ProviderInput)));
  r.delete("/api/ai/providers/:id", (c) => { store.remove(c.params.id); });
  r.put("/api/ai/active", async (c) => { store.setActive((await c.body(z.object({ id: z.string().nullable() }))).id); return store.list(); });
  r.post("/api/ai/providers/:id/test", async (c) => {
    const p = store.get(c.params.id);
    const problems = providerProblems(p);
    if (problems.length) throw new HttpError(400, `${p.name}: ${problems[0]}`);
    const started = Date.now();
    const out = await chat(p, { messages: [{ role: "user", content: "Ответь одним словом: ОК" }], tools: [] }, deps);
    store.logUsage(p, out.usage);
    return { ok: true, text: out.message.content.trim().slice(0, 200), ms: Date.now() - started };
  });
  r.get("/api/ai/usage", () => store.usage());
  r.post("/api/ai/chat", async (c) => {
    const req = await c.body(ChatRequest, 8 * 1024 * 1024);
    const p = store.active();
    const out = await chat(p, req, deps);
    store.logUsage(p, out.usage);
    return { ...out, provider: publicProvider(p).name };
  });
}
