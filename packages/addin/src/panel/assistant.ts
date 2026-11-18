// План 19: сессия помощника — история разговора, предложения последнего ответа, применение и отмена.
import { StreamStopped, type ChatMessage, type ChatReply, type StreamHooks, type ToolCall, type ToolDef } from "@idk/shared/ai/model";
import { runTurn, toolLabel } from "@idk/shared/ai/agent";
import { BOOK_TOOLS, execBookTool, type Proposal, type ToolContext } from "@idk/shared/ai/tools";
import { applyChanges, undoChanges, type BookChange, type Undo } from "@idk/shared/ai/changes";
import { NameMask } from "@idk/shared/ai/mask";
import { bookSchema, systemPrompt, type PromptContext } from "@idk/shared/ai/prompt";
import type { Book } from "@idk/shared/workbook/records";
import type { ImportantMap } from "@idk/shared/workbook/important";
import type { TableStore } from "@idk/shared/workbook/store";
import type { Catalog } from "@idk/shared/catalog/model";
import type { UserTemplate } from "@idk/shared/forms/template";

export interface ChatItem {
  kind: "user" | "assistant" | "tool" | "note" | "error";
  text: string;
  /** 0.31: ответ ещё приходит потоком. */
  live?: boolean;
  /** 0.31: ответ остановлен пользователем или прерван обрывом связи. */
  cut?: "stopped" | "interrupted";
}

/** Дополнительный набор инструментов (план 20: справочник, формы). exec → null, если вызов не его. */
export interface ToolKit {
  tools: ToolDef[];
  exec(call: ToolCall, ctx: ToolContext): Promise<string | null>;
  /** Применение предложения не из книги (справочник, форма); возвращает отмену. */
  apply?(p: Proposal): Promise<(() => Promise<void>) | null>;
}

export interface AskContext {
  book: Book;
  important: ImportantMap;
  catalog: Catalog | null;
  template: UserTemplate;
  masked: boolean;
  prompt: Omit<PromptContext, "masked" | "template">;
}

export interface SessionDeps {
  chat(messages: ChatMessage[], tools: ToolDef[]): Promise<ChatReply>;
  /** 0.31: потоковый ответ; нет — ответ целиком через chat. */
  chatStream?(messages: ChatMessage[], tools: ToolDef[], hooks: StreamHooks, signal?: AbortSignal): Promise<ChatReply>;
  store: TableStore;
  kits?: ToolKit[];
}

export class AssistantSession {
  history: ChatMessage[] = [];
  items: ChatItem[] = [];
  pending: Proposal[] = [];
  applied: { ids: number[]; undo: Undo; extra: (() => Promise<void>)[] } | null = null;
  /** 0.31: идёт генерация ответа — можно остановить. */
  private abort: AbortController | null = null;
  constructor(private deps: SessionDeps) {}

  get generating() {
    return this.abort !== null;
  }

  /** 0.31: «Остановить» — прерывает генерацию; полученная часть остаётся в чате и в истории. */
  stop() {
    this.abort?.abort();
  }

  reset() {
    this.history = [];
    this.items = [];
    this.pending = [];
    this.applied = null;
  }

  private note(text: string) {
    this.history.push({ role: "user", content: `[${text}]` });
  }

  async ask(text: string, c: AskContext, onUpdate: () => void = () => {}): Promise<void> {
    if (this.pending.length) {
      this.note("Пользователь не стал применять прежние предложения");
      this.pending = [];
    }
    const system: ChatMessage = {
      role: "system",
      content: systemPrompt({ ...c.prompt, template: c.template.name, masked: c.masked, schema: bookSchema(c.book) }),
    };
    if (this.history[0]?.role === "system") this.history[0] = system;
    else this.history.unshift(system);
    this.history.push({ role: "user", content: text });
    this.items.push({ kind: "user", text });
    onUpdate();
    const ctx: ToolContext = {
      book: c.book,
      important: c.important,
      catalog: c.catalog,
      template: c.template,
      mask: new NameMask(c.book, c.masked),
      proposals: [],
    };
    const kits = this.deps.kits ?? [];
    const tools = [...BOOK_TOOLS, ...kits.flatMap((k) => k.tools)];
    const abort = new AbortController();
    this.abort = abort;
    // Ответ текущего обращения к модели, который приходит потоком (на каждом шаге — свой).
    let live: ChatItem | null = null;
    const stream = this.deps.chatStream;
    const send = (m: ChatMessage[], t: ToolDef[]): Promise<ChatReply> => {
      live = null;
      if (!stream) return this.deps.chat(m, t);
      return stream(
        m,
        t,
        {
          onToken: (s) => {
            if (!live) {
              live = { kind: "assistant", text: "", live: true };
              this.items.push(live);
            }
            live.text += s;
            onUpdate();
          },
        },
        abort.signal,
      ).then((r) => {
        if (live) live.live = false;
        return r;
      });
    };
    try {
      const r = await runTurn(this.history, tools, {
        send,
        exec: async (call) => {
          const own = execBookTool(ctx, call);
          if (own !== null) return own;
          for (const k of kits) {
            const out = await k.exec(call, ctx);
            if (out !== null) return out;
          }
          return JSON.stringify({ error: `Нет инструмента ${call.name}` });
        },
        onTool: (call) => {
          this.items.push({ kind: "tool", text: toolLabel(call) });
          onUpdate();
        },
      });
      this.history.push(...r.added);
      const text = r.text || (ctx.proposals.length ? "Предлагаю изменения ниже." : "…");
      // Последний ответ уже в чате (пришёл потоком) — заменяется итоговым текстом, а не дублируется.
      const last = live as ChatItem | null;
      if (last && !r.stopped && this.items.at(-1) === last) last.text = text;
      else this.items.push({ kind: r.stopped ? "error" : "assistant", text });
      this.pending = ctx.proposals;
    } catch (e) {
      const last = live as ChatItem | null;
      if (e instanceof StreamStopped && e.partial) {
        // Полученная часть остаётся в чате и в истории разговора (модель на следующем вопросе её видит).
        const cut = e.byUser ? "stopped" : "interrupted";
        if (last) Object.assign(last, { text: e.partial, live: false, cut });
        else this.items.push({ kind: "assistant", text: e.partial, cut });
        this.history.push({ role: "assistant", content: e.partial, toolCalls: [] });
        if (!e.byUser) this.items.push({ kind: "note", text: e.message });
      } else {
        // Вопрос остаётся в истории без ответа — следующая попытка его повторит.
        this.history.pop();
        if (last) last.live = false;
        if (e instanceof StreamStopped && e.byUser) this.items.push({ kind: "note", text: "Ответ остановлен." });
        else this.items.push({ kind: "error", text: (e as Error).message });
      }
    } finally {
      this.abort = null;
    }
    onUpdate();
  }

  /** Применяет отмеченные предложения: правки книги — одним заходом с отменой, прочие — своими наборами. */
  async apply(ids: number[]): Promise<number> {
    const chosen = this.pending.filter((p) => ids.includes(p.id));
    const isBook = (p: Proposal) => p.change.kind === "add" || p.change.kind === "update" || p.change.kind === "delete" || p.change.kind === "batch";
    const book = chosen.filter(isBook);
    // Замена текста (план 21) — одно предложение из многих правок ячеек.
    const changes = book.flatMap((p) => (p.change.kind === "batch" ? p.change.changes : [p.change as BookChange]));
    const undo = await applyChanges(this.deps.store, changes);
    const extra: (() => Promise<void>)[] = [];
    for (const p of chosen.filter((x) => !book.includes(x))) {
      for (const k of this.deps.kits ?? []) {
        const u = await k.apply?.(p);
        if (u) {
          extra.push(u);
          break;
        }
      }
    }
    this.applied = { ids: chosen.map((p) => p.id), undo, extra };
    const skipped = this.pending.filter((p) => !ids.includes(p.id)).map((p) => p.id);
    this.note(`Пользователь применил предложения №${chosen.map((p) => p.id).join(", №")}${skipped.length ? `; не применил №${skipped.join(", №")}` : ""}`);
    this.items.push({ kind: "note", text: `Применено изменений: ${chosen.length}.` });
    this.pending = [];
    return chosen.length;
  }

  async revert(): Promise<void> {
    if (!this.applied) return;
    for (const u of [...this.applied.extra].reverse()) await u();
    await undoChanges(this.deps.store, this.applied.undo);
    this.note("Пользователь отменил применённые изменения");
    this.items.push({ kind: "note", text: "Изменения отменены." });
    this.applied = null;
  }

  reject() {
    if (!this.pending.length) return;
    this.note("Пользователь отклонил предложения");
    this.items.push({ kind: "note", text: "Предложения отклонены." });
    this.pending = [];
  }
}
