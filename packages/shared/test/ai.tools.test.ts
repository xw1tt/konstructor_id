// План 19, задача 1: инструменты помощника, предложения, применение и отмена, маска ФИО, ход разговора.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { BUILTIN_SBD } from "@idk/shared/forms/template";
import { BUILTIN_CATALOG } from "@idk/shared/catalog/builtin";
import { mergeCatalog } from "@idk/shared/catalog/merge";
import { execBookTool, BOOK_TOOLS, type ToolContext } from "@idk/shared/ai/tools";
import { applyChanges, undoChanges, validateChange } from "@idk/shared/ai/changes";
import { NameMask } from "@idk/shared/ai/mask";
import { runTurn } from "@idk/shared/ai/agent";
import { systemPrompt } from "@idk/shared/ai/prompt";
import type { ChatMessage, ChatReply } from "@idk/shared/ai/model";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

const ctxFor = async (wb: MemoryWorkbook, mask = false): Promise<ToolContext> => {
  const book = await readBook(wb);
  return { book, important: defaultImportant(), catalog: mergeCatalog(BUILTIN_CATALOG, { docs: [], sections: [], hidden: [] }).catalog, template: BUILTIN_SBD, mask: new NameMask(book, mask), proposals: [] };
};
const call = (ctx: ToolContext, name: string, args: Record<string, unknown> = {}) => JSON.parse(execBookTool(ctx, { id: "1", name, arguments: args })!);

test("чтение: таблицы, строки с номерами и датами ДД.ММ.ГГГГ, отбор, проверка акта", async () => {
  const ctx = await ctxFor(new MemoryWorkbook(aov1Records() as any));
  const tables = call(ctx, "list_tables");
  const acts = tables.find((t: any) => t.table === "Акты");
  assert.equal(acts.sheet, "База актов");
  assert.ok(acts.columns.some((c: string) => c.startsWith("Номер акта (text, обязательный, ключ)")));
  const r = call(ctx, "read_rows", { table: "Акты" });
  assert.equal(r.total, 1);
  assert.equal(r.rows[0].row, 1);
  assert.equal(r.rows[0].values["Номер акта"], AOV1);
  assert.equal(r.rows[0].values["Дата акта"], "28.07.2026");
  assert.equal(call(ctx, "read_rows", { table: "Материалы", limit: 2 }).rows.length, 2);
  assert.match(call(ctx, "read_rows", { table: "Нет" }).error, /Нет таблицы/);
  const chk = call(ctx, "check_act", { act: AOV1 });
  assert.deepEqual(chk.printIssues, []);
  assert.ok(Array.isArray(chk.documents));
  assert.ok(call(ctx, "check_act", { act: "X" }).printIssues[0].includes("не найден"));
  assert.equal(call(ctx, "read_rows", { table: "Материалы", column: "Наименование", contains: "КАБЕЛЬ" }).rows.every((x: any) => /кабель/i.test(x.values["Наименование"])), true);
  assert.ok(call(ctx, "get_catalog", { query: "кабел" }).sections.length > 0);
  assert.equal(call(ctx, "get_template").name, "СБД");
  assert.ok(BOOK_TOOLS.every((t) => t.parameters.type === "object"));
});

test("предложения: проверка столбцов, типов, списков, строк; описание «было → стало»", async () => {
  const ctx = await ctxFor(new MemoryWorkbook(aov1Records() as any));
  assert.match(call(ctx, "propose_add_rows", { table: "Акты", rows: [{ "Номер": "1" }] }).error, /нет столбца «Номер»/);
  assert.match(call(ctx, "propose_add_rows", { table: "Акты", rows: [{ "Номер акта": "2", "Дата акта": "32.13.2026" }] }).error, /ДД\.ММ\.ГГГГ/);
  assert.match(call(ctx, "propose_add_rows", { table: "Схемы", rows: [{ "Вид": "Чертёж" }] }).error, /значение из списка/);
  assert.match(call(ctx, "propose_add_rows", { table: "МатериалыАктов", rows: [{ "Сумма ВОР": 1 }] }).error, /вычисляется/);
  assert.match(call(ctx, "propose_update", { table: "Акты", row: 5, values: { "Листы": "1" } }).error, /нет строки 5/);
  assert.match(call(ctx, "propose_delete", { table: "Акты", rows: [0] }).error, /номера существующих строк/);
  assert.equal(ctx.proposals.length, 0);
  const ok = call(ctx, "propose_update", { table: "Акты", row: 1, values: { "Начало работ": "01.06.2026", "Экз.": "3" } });
  assert.equal(ok.proposal, 1);
  assert.deepEqual(ctx.proposals[0].lines, [
    `«База актов» (Акты), строка 1 (${AOV1}): Начало работ: «05.06.2026» → «01.06.2026»`,
    `«База актов» (Акты), строка 1 (${AOV1}): Экз.: «4» → «3»`,
  ]);
  call(ctx, "propose_add_rows", { table: "Материалы", rows: [{ "Наименование": "Труба", "Ед. изм.": "м." }] });
  assert.equal(ctx.proposals[1].lines[0], "Добавить на лист «Материалы» (Материалы): Наименование: Труба; Ед. изм.: м.");
});

test("применение и отмена возвращают книгу в исходное состояние", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  await wb.write("Схемы", 0, { "Скан": "схема.pdf" }, { "Скан": "https://localhost:3443/api/files/5" });
  const before = await readBook(wb);
  const v = (kind: any, args: any) => { const r = validateChange(before, kind, args); assert.ok(r.ok, JSON.stringify(r)); return (r as any).change; };
  const changes = [
    v("update", { table: "Акты", row: 1, values: { "Работы (п.1)": "Новые работы", "Дата акта": "30.07.2026" } }),
    v("delete", { table: "Схемы", rows: [1, 3] }),
    v("add", { table: "Материалы", rows: [{ "Наименование": "Труба", "Ед. изм.": "м." }, { "Наименование": "Лоток", "Ед. изм.": "м." }] }),
  ];
  const undo = await applyChanges(wb, changes);
  const mid = await readBook(wb);
  assert.equal(mid.tables["Акты"]![0].v.works, "Новые работы");
  assert.equal(mid.tables["Схемы"]!.length, before.tables["Схемы"]!.length - 2);
  assert.deepEqual(mid.tables["Материалы"]!.slice(-2).map((r) => r.v.name), ["Труба", "Лоток"]);
  await undoChanges(wb, undo);
  assert.deepEqual(await readBook(wb), before);
});

test("маска ФИО: в ответах — [ФИО-N], в предложениях — обратно", async () => {
  const ctx = await ctxFor(new MemoryWorkbook(aov1Records() as any), true);
  const text = execBookTool(ctx, { id: "1", name: "read_rows", arguments: { table: "Представители" } })!;
  assert.ok(!text.includes("Королев Д.М."));
  const token = /\[ФИО-\d+\]/.exec(text)![0];
  const r = JSON.parse(text).rows.find((x: any) => x.values["ФИО"] === token);
  call(ctx, "propose_update", { table: "Представители", row: r.row, values: { "Должность": `Инженер (${token})` } });
  assert.ok(!ctx.proposals[0].lines[0].includes("[ФИО-"), ctx.proposals[0].lines[0]);
  assert.ok(execBookTool({ ...ctx, mask: new NameMask(ctx.book, false) }, { id: "1", name: "read_rows", arguments: { table: "Представители" } })!.includes("Королев Д.М."));
});

test("ход разговора: вызовы инструментов, результат в истории, предел шагов", async () => {
  const replies: ChatReply[] = [
    { message: { role: "assistant", content: "", toolCalls: [{ id: "a", name: "list_tables", arguments: {} }] }, usage: { prompt: 10, completion: 1 }, provider: "p" },
    { message: { role: "assistant", content: "Готово", toolCalls: [] }, usage: { prompt: 20, completion: 2 }, provider: "p" },
  ];
  const sent: ChatMessage[][] = [];
  const r = await runTurn([{ role: "user", content: "?" }], [], {
    send: async (m) => { sent.push(m); return replies.shift()!; },
    exec: async (c) => `результат ${c.name}`,
  });
  assert.equal(r.text, "Готово");
  assert.deepEqual(r.usage, { prompt: 30, completion: 3 });
  assert.deepEqual(sent[1].at(-1), { role: "tool", toolCallId: "a", name: "list_tables", content: "результат list_tables" });
  const loop = await runTurn([{ role: "user", content: "?" }], [], {
    send: async () => ({ message: { role: "assistant", content: "", toolCalls: [{ id: "x", name: "y", arguments: {} }] }, usage: { prompt: 0, completion: 0 }, provider: "p" }),
    exec: async () => { throw new Error("сбой"); },
  }, 3);
  assert.equal(loop.stopped, true);
  assert.match(loop.text, /не уложился в 3 шагов/);
  assert.equal((loop.added[1] as any).content, '{"error":"сбой"}');
  assert.match(systemPrompt({ today: "25.10.2026", sheet: "База актов", table: "Акты", row: 0, act: AOV1, template: "СБД", masked: true }), /строка 1.*Акт под курсором/s);
});
