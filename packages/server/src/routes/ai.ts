// План 18: подключения нейросетей, проверка, чат через активное подключение, расход.
import { z } from "zod";
import { ChatRequest, ProviderInput, providerProblems, publicProvider } from "@idk/shared/ai/model";
import { HttpError } from "../http/router.ts";
import { Router } from "../http/router.ts";
import type { AiStore } from "../ai/store.ts";
import { chat, chatStream, StreamAborted, type ChatDeps } from "../ai/providers.ts";
import { logError } from "../diag/log.ts";
import { pdfText } from "../scan/read.ts";
import { formType } from "../forms/store.ts";
import { markupText } from "../forms/markup.ts";

/** Сколько страниц РД читается из PDF. */
const RD_PAGES = 40;

export function aiRoutes(r: Router, store: AiStore, deps: ChatDeps = {}) {
  r.get("/api/ai/providers", () => store.list());
  r.put("/api/ai/providers/:id", async (c) => store.save(c.params.id, await c.body(ProviderInput)));
  r.delete("/api/ai/providers/:id", (c) => {
    store.remove(c.params.id);
  });
  r.put("/api/ai/active", async (c) => {
    store.setActive((await c.body(z.object({ id: z.string().nullable() }))).id);
    return store.list();
  });
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
  // 0.34: текст рабочей документации для роли «Черновики актов из РД» — PDF (текстовый слой), Word, Excel.
  r.post("/api/ai/extract", async (c) => {
    const q = await c.body(z.object({ file: z.string(), name: z.string().default("РД") }), 60 * 1024 * 1024);
    const buf = Buffer.from(q.file, "base64");
    if (buf.subarray(0, 5).toString("latin1") === "%PDF-") {
      let r: { text: string; pages: number };
      try {
        r = await pdfText(buf, RD_PAGES);
      } catch {
        throw new HttpError(422, "Не удалось прочитать PDF — возможно, файл повреждён или защищён паролем");
      }
      if (!r.text.replace(/\s+/g, "").length)
        throw new HttpError(422, "В PDF нет текстового слоя (скан) — помощник не прочитает его. Нужен PDF, сохранённый из САПР или Word, или файл Word/Excel");
      return { name: q.name, text: r.text, pages: r.pages, cut: r.pages > RD_PAGES };
    }
    const type = formType(buf);
    if (!type) throw new HttpError(422, "Нужен файл PDF, Word (.docx) или Excel (.xlsx)");
    return { name: q.name, text: markupText(buf, type, 200000), pages: null, cut: false };
  });
  r.post("/api/ai/chat", async (c) => {
    const req = await c.body(ChatRequest, 8 * 1024 * 1024);
    const p = store.active();
    const out = await chat(p, req, deps);
    store.logUsage(p, out.usage);
    return { ...out, provider: publicProvider(p).name };
  });

  // 0.31: ответ потоком (Server-Sent Events). События: token, tool, done (message, usage, provider), error.
  // Соединение закрыто клиентом («Остановить») — запрос к провайдеру отменяется, расход записывается один раз.
  r.post("/api/ai/chat/stream", async (c) => {
    const req = await c.body(ChatRequest, 8 * 1024 * 1024);
    const p = store.active();
    const res = c.res;
    const ac = new AbortController();
    let finished = false;
    res.on("close", () => {
      if (!finished) ac.abort();
    });
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "x-accel-buffering": "no" });
    res.flushHeaders?.();
    const event = (o: unknown) => {
      if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(o)}\n\n`);
    };
    const provider = publicProvider(p).name;
    try {
      const out = await chatStream(
        p,
        req,
        { onToken: (text) => event({ type: "token", text }), onTool: (name) => event({ type: "tool", name }), signal: ac.signal },
        deps,
      );
      store.logUsage(p, out.usage);
      event({ type: "done", message: out.message, usage: out.usage, provider });
    } catch (e) {
      if (e instanceof StreamAborted) {
        store.logUsage(p, e.partial.usage);
        event({ type: "error", code: e.byUser ? "aborted" : "interrupted", message: e.message, partial: e.partial.message.content, provider });
      } else {
        const status = (e as { status?: number }).status ?? 500;
        if (status >= 500 && !(e as { status?: number }).status) logError("ai/chat/stream", e);
        const m = /\(попыток: (\d+)\)/.exec((e as Error).message);
        event({ type: "error", code: status === 502 ? "provider" : "server", message: (e as Error).message, attempts: m ? Number(m[1]) : 1, provider });
      }
    } finally {
      finished = true;
      res.end();
    }
  });
}
