// План 19: сессия помощника — история разговора, предложения последнего ответа, применение и отмена.
import type { ChatMessage, ChatReply, ToolCall, ToolDef } from "@idk/shared/ai/model";
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

export interface ChatItem { kind: "user" | "assistant" | "tool" | "note" | "error"; text: string }

/** Дополнительный набор инструментов (план 20: справочник, формы). exec → null, если вызов не его. */
export interface ToolKit {
  tools: ToolDef[];
  exec(call: ToolCall, ctx: ToolContext): Promise<string | null>;
  /** Применение предложения не из книги (справочник, форма); возвращает отмену. */
  apply?(p: Proposal): Promise<(() => Promise<void>) | null>;
}

export interface AskContext {
  book: Book; important: ImportantMap; catalog: Catalog | null; template: UserTemplate; masked: boolean;
  prompt: Omit<PromptContext, "masked" | "template">;
}

export interface SessionDeps {
  chat(messages: ChatMessage[], tools: ToolDef[]): Promise<ChatReply>;
  store: TableStore;
  kits?: ToolKit[];
}

export class AssistantSession {
  history: ChatMessage[] = [];
  items: ChatItem[] = [];
  pending: Proposal[] = [];
  applied: { ids: number[]; undo: Undo; extra: (() => Promise<void>)[] } | null = null;
  constructor(private deps: SessionDeps) {}

  reset() { this.history = []; this.items = []; this.pending = []; this.applied = null; }

  private note(text: string) { this.history.push({ role: "user", content: `[${text}]` }); }

  async ask(text: string, c: AskContext, onUpdate: () => void = () => {}): Promise<void> {
    if (this.pending.length) { this.note("Пользователь не стал применять прежние предложения"); this.pending = []; }
    const system: ChatMessage = { role: "system", content: systemPrompt({ ...c.prompt, template: c.template.name, masked: c.masked, schema: bookSchema(c.book) }) };
    if (this.history[0]?.role === "system") this.history[0] = system; else this.history.unshift(system);
    this.history.push({ role: "user", content: text });
    this.items.push({ kind: "user", text });
    onUpdate();
    const ctx: ToolContext = { book: c.book, important: c.important, catalog: c.catalog, template: c.template, mask: new NameMask(c.book, c.masked), proposals: [] };
    const kits = this.deps.kits ?? [];
    const tools = [...BOOK_TOOLS, ...kits.flatMap((k) => k.tools)];
    try {
      const r = await runTurn(this.history, tools, {
        send: (m, t) => this.deps.chat(m, t),
        exec: async (call) => {
          const own = execBookTool(ctx, call);
          if (own !== null) return own;
          for (const k of kits) { const out = await k.exec(call, ctx); if (out !== null) return out; }
          return JSON.stringify({ error: `Нет инструмента ${call.name}` });
        },
        onTool: (call) => { this.items.push({ kind: "tool", text: toolLabel(call) }); onUpdate(); },
      });
      this.history.push(...r.added);
      this.items.push({ kind: r.stopped ? "error" : "assistant", text: r.text || (ctx.proposals.length ? "Предлагаю изменения ниже." : "…") });
      this.pending = ctx.proposals;
    } catch (e) {
      // Вопрос остаётся в истории без ответа — следующая попытка его повторит.
      this.history.pop();
      this.items.push({ kind: "error", text: (e as Error).message });
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
      for (const k of this.deps.kits ?? []) { const u = await k.apply?.(p); if (u) { extra.push(u); break; } }
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
