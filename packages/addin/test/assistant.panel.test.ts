// План 19, задача 2: сессия помощника — ответ с предложением, применение отмеченных, отмена, ошибка подключения.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { BUILTIN_SBD } from "@idk/shared/forms/template";
import type { ChatMessage, ChatReply } from "@idk/shared/ai/model";
import { AssistantSession, type AskContext } from "@idk/addin/panel/assistant";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

const reply = (content: string, calls: { name: string; arguments: Record<string, unknown> }[] = []): ChatReply =>
  ({ message: { role: "assistant", content, toolCalls: calls.map((c, i) => ({ id: `c${i}`, ...c })) }, usage: { prompt: 1, completion: 1 }, provider: "Тест" });

test("ход с предложениями → применить отмеченные → отменить; модель знает о применении", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const queue: ChatReply[] = [
    reply("", [{ name: "read_rows", arguments: { table: "Акты" } }]),
    reply("", [{ name: "propose_update", arguments: { table: "Акты", row: 1, values: { "Листы": "0210-0240" } } },
      { name: "propose_add_rows", arguments: { table: "Материалы", rows: [{ "Наименование": "Лоток", "Ед. изм.": "м." }] } }]),
    reply("Предлагаю поправить листы и добавить лоток."),
    reply("Понял."),
  ];
  const seen: ChatMessage[][] = [];
  const s = new AssistantSession({ store: wb, chat: async (m) => { seen.push(m); return queue.shift()!; } });
  const before = await readBook(wb);
  const ctx = async (): Promise<AskContext> => ({ book: await readBook(wb), important: defaultImportant(), catalog: null, template: BUILTIN_SBD, masked: false,
    prompt: { today: "25.10.2026", sheet: "База актов", table: "Акты", row: 0, act: AOV1 } });
  await s.ask("Поправь листы и добавь лоток", await ctx());
  assert.equal(seen[0][0].role, "system");
  assert.deepEqual(s.items.map((i) => i.kind), ["user", "tool", "tool", "tool", "assistant"]);
  assert.equal(s.pending.length, 2);
  assert.equal(await s.apply([1]), 1, "только отмеченное");
  let b = await readBook(wb);
  assert.equal(b.tables["Акты"]![0].v.sheets, "0210-0240");
  assert.equal(b.tables["Материалы"]!.length, before.tables["Материалы"]!.length);
  assert.match(String(s.history.at(-1)!.content), /применил предложения №1; не применил №2/);
  await s.revert();
  assert.deepEqual(await readBook(wb), before);
  await s.ask("Спасибо", await ctx());
  assert.match(String(seen.at(-1)!.at(-2)!.content), /отменил/);
});

test("ошибка подключения — сообщение в чате, вопрос не остаётся без ответа в истории", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const s = new AssistantSession({ store: wb, chat: async () => { throw new Error("Не выбрана нейросеть: «Настройки» → «Нейросети»"); } });
  await s.ask("Привет", { book: await readBook(wb), important: defaultImportant(), catalog: null, template: BUILTIN_SBD, masked: false, prompt: { today: "25.10.2026" } });
  assert.deepEqual(s.items.at(-1), { kind: "error", text: "Не выбрана нейросеть: «Настройки» → «Нейросети»" });
  assert.equal(s.history.filter((m) => m.role === "user").length, 0);
});
