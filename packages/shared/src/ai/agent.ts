// План 19: ход разговора с помощником — модель отвечает текстом или вызывает инструменты; не больше maxSteps обращений.
import type { ChatMessage, ChatReply, ToolCall, ToolDef, Usage } from "./model.ts";

export interface AgentDeps {
  send(messages: ChatMessage[], tools: ToolDef[]): Promise<ChatReply>;
  exec(call: ToolCall): Promise<string>;
  /** Сообщение о вызове инструмента (для строки «Читаю таблицу…»). */
  onTool?(call: ToolCall): void;
}

export const MAX_STEPS = 8;

export async function runTurn(history: ChatMessage[], tools: ToolDef[], deps: AgentDeps, maxSteps = MAX_STEPS):
  Promise<{ added: ChatMessage[]; text: string; usage: Usage; stopped: boolean }> {
  const added: ChatMessage[] = [];
  const usage: Usage = { prompt: 0, completion: 0 };
  for (let step = 0; step < maxSteps; step++) {
    const reply = await deps.send([...history, ...added], tools);
    usage.prompt += reply.usage.prompt;
    usage.completion += reply.usage.completion;
    added.push(reply.message);
    if (!reply.message.toolCalls.length) return { added, text: reply.message.content, usage, stopped: false };
    for (const call of reply.message.toolCalls) {
      deps.onTool?.(call);
      let content: string;
      try { content = await deps.exec(call); } catch (e) { content = JSON.stringify({ error: (e as Error).message }); }
      added.push({ role: "tool", toolCallId: call.id, name: call.name, content });
    }
  }
  return { added, text: `Помощник не уложился в ${maxSteps} шагов. Уточните задачу или разбейте её на части.`, usage, stopped: true };
}

/** Короткая подпись вызова инструмента для чата. */
export function toolLabel(c: ToolCall): string {
  const a = c.arguments ?? {};
  switch (c.name) {
    case "list_tables": return "Смотрю таблицы книги";
    case "read_rows": return `Читаю «${String(a.table ?? "")}»${a.contains ? `: «${String(a.contains)}»` : ""}`;
    case "check_act": return `Проверяю акт ${String(a.act ?? "")}`;
    case "get_catalog": return "Смотрю справочник";
    case "get_template": return "Смотрю шаблон книги";
    case "propose_add_rows": return `Готовлю добавление строк в «${String(a.table ?? "")}»`;
    case "propose_update": return `Готовлю изменение «${String(a.table ?? "")}»`;
    case "propose_delete": return `Готовлю удаление из «${String(a.table ?? "")}»`;
    case "search_book": return `Ищу в книге «${String(a.text ?? "")}»`;
    case "check_ojr": return `Сверяю раздел ${String(a.section ?? "")} ОЖР с актами`;
    case "propose_replace": return `Готовлю замену «${String(a.find ?? "")}» → «${String(a.replace ?? "")}»`;
    case "propose_catalog": return "Готовлю дополнение справочника";
    case "read_form": return "Размечаю приложенную форму";
    case "propose_form": return "Готовлю метки формы";
    default: return c.name;
  }
}
