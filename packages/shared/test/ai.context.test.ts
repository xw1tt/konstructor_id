// План 21, задача 1: помощник понимает книгу — схема в подсказке, поиск, сверка ОЖР, замена текста одним предложением.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { BUILTIN_SBD } from "@idk/shared/forms/template";
import { fillOjr } from "@idk/shared/ojr";
import { bookSchema, systemPrompt } from "@idk/shared/ai/prompt";
import { execBookTool, type ToolContext } from "@idk/shared/ai/tools";
import { applyChanges, undoChanges, type BookChange } from "@idk/shared/ai/changes";
import { NameMask } from "@idk/shared/ai/mask";
import { aov1Records } from "./fixtures/aov1Book.ts";

const ctxOf = async (wb: MemoryWorkbook): Promise<ToolContext> => {
  const book = await readBook(wb);
  return { book, important: defaultImportant(), catalog: null, template: BUILTIN_SBD, mask: new NameMask(book, false), proposals: [] };
};
const call = (ctx: ToolContext, name: string, args: Record<string, unknown>) => JSON.parse(execBookTool(ctx, { id: "1", name, arguments: args })!);

test("схема книги и памятка — в системной подсказке", async () => {
  const book = await readBook(new MemoryWorkbook(aov1Records() as any));
  const schema = bookSchema(book);
  assert.match(schema, /«Представители» — Представители \(строк 6\): Роль; Должность; ФИО\*; Организация→Организации/);
  assert.match(schema, /«ОЖР Раздел 3» — ОЖР3/);
  assert.ok(!schema.includes("Сумма ВОР"), "формульные столбцы не нужны");
  const p = systemPrompt({ today: "25.10.2026", template: "СБД", masked: false, schema });
  assert.match(p, /Названия таблиц и столбцов у пользователя не спрашивай/);
  assert.match(p, /раздел 3 — таблица «ОЖР3»/);
  assert.match(p, /Подписи в актах берутся из таблицы «Представители»/);
  assert.ok(p.includes(schema));
});

test("поиск по книге: таблица, строка, столбец; без учёта регистра", async () => {
  const ctx = await ctxOf(new MemoryWorkbook(aov1Records() as any));
  const r = call(ctx, "search_book", { text: "востров" });
  const where = r.hits.map((h: any) => `${h.table}:${h.column}`);
  assert.ok(where.includes("Представители:ФИО"));
  assert.ok(where.includes("Акты:ВОР: от монтажников"));
  assert.equal(r.total, r.hits.length);
  assert.match(call(ctx, "search_book", { text: "x" }).error, /коротк/);
});

test("сверка ОЖР: после «Заполнить из актов» — расхождений нет; удалённая дата, лишняя дата и другие работы — видны", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  await fillOjr(wb, await readBook(wb));
  let r = call(await ctxOf(wb), "check_ojr", { section: 3 });
  assert.deepEqual([r.missingDates, r.extraDates, r.different], [[], [], []]);
  assert.ok(r.expectedRows > 0);
  const t = (await wb.read("ОЖР3"))!;
  const first = t.rows[0];
  await wb.remove("ОЖР3", [0]);
  await wb.write("ОЖР3", 0, { "Наименование выполненных работ": "Другие работы" });
  await wb.insert("ОЖР3", 0, [{ "Дата": 40000, "Наименование выполненных работ": "лишнее" }]);
  r = call(await ctxOf(wb), "check_ojr", { section: 3 });
  assert.equal(r.missingDates.length, 1);
  assert.match(r.missingDates[0], /акты К32/);
  assert.equal(r.extraDates.length, 1);
  assert.equal(r.different.length, 1);
  assert.match(r.different[0], /работы: в журнале «Другие работы»/);
  assert.ok(first);
  const r5 = call(await ctxOf(wb), "check_ojr", { section: 5 });
  assert.deepEqual([r5.missing, r5.extra, r5.different], [[], [], []]);
  assert.match(call(await ctxOf(wb), "check_ojr", { section: 4 }).error, /3 или 5/);
});

test("замена текста: одно предложение со всеми ячейками; применение и отмена; нет текста — ошибка", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const before = await readBook(wb);
  const ctx = await ctxOf(wb);
  const r = call(ctx, "propose_replace", { find: "востров в.п.", replace: "Антрохин И.В." });
  assert.equal(r.ok, true);
  assert.equal(ctx.proposals.length, 1);
  const p = ctx.proposals[0];
  assert.equal(p.change.kind, "batch");
  assert.match(p.lines[0], /Заменить «востров в\.п\.» на «Антрохин И\.В\.» — ячеек: 2/);
  const changes = (p.change as { kind: "batch"; changes: BookChange[] }).changes;
  const undo = await applyChanges(wb, changes);
  const b = await readBook(wb);
  assert.ok(b.tables["Представители"]!.some((x) => x.v.fullName === "Антрохин И.В."));
  assert.equal(b.tables["Акты"]![0].v.vorContractor, "Антрохин И.В.");
  await undoChanges(wb, undo);
  assert.deepEqual(await readBook(wb), before);
  assert.match(call(ctx, "propose_replace", { find: "Нет такого", replace: "x" }).error, /не найден/);
  assert.match(call(ctx, "propose_replace", { find: "Выполнивший работы", replace: "Кто-то", table: "Представители", column: "Роль" }).error, /значение из списка/);
});
