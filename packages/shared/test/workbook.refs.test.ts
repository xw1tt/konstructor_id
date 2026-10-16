import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { findReferences, renameKey } from "@idk/shared/workbook/refs";

const make = () => new MemoryWorkbook({
  "Организации": [{ "Краткое наименование": 'ООО "СБД"' }],
  "Объект": [{ "Поле": "Застройщик (технический заказчик)", "Значение": 'ООО "СБД"' }],
  "Представители": [{ "ФИО": "Иванов", "Организация": 'ООО "СБД"' }],
  "Материалы": [{ "Наименование": "Кабель" }, { "Наименование": "Труба" }],
  "ДокументыКачества": [{ "Материалы": "Кабель; Труба", "Номер": "1" }, { "Материалы": "Труба", "Номер": "2" }],
  "МатериалыАктов": [{ "Акт": "1", "Материал": "Кабель " }],
  "ВОР": [{ "Акт": "1", "Материал": "Кабель", "Объём": 5 }, { "Акт": "1", "Материал": "Труба", "Объём": 1 }],
});

test("findReferences находит ссылки на всех листах, пробелы по краям не мешают", async () => {
  const hits = findReferences(await readBook(make()), "Материалы", "Кабель");
  assert.deepEqual(hits.map((h) => h.table).sort(), ["ВОР", "ДокументыКачества", "МатериалыАктов"]);
  assert.deepEqual(hits.find((h) => h.table === "ВОР"), { table: "ВОР", row: 0, column: "Материал" });
});

test("renameKey обновляет ссылки и элемент списка", async () => {
  const wb = make();
  const r = await renameKey(wb, await readBook(wb), "Материалы", "Кабель", "Кабель RS-485");
  assert.deepEqual(r, { ok: true, updated: 3 });
  assert.equal((await wb.read("ДокументыКачества"))!.rows[0][0], "Кабель RS-485; Труба");
  assert.equal((await wb.read("ДокументыКачества"))!.rows[1][0], "Труба");
  assert.equal((await wb.read("МатериалыАктов"))!.rows[0][1], "Кабель RS-485");
});

test("renameKey отказывает, если новое имя уже есть", async () => {
  const wb = make();
  assert.deepEqual(await renameKey(wb, await readBook(wb), "Материалы", "Кабель", " Труба"),
    { ok: false, message: "Такое значение уже есть" });
  assert.equal((await wb.read("ВОР"))!.rows[0][2], "Кабель");
});

test("организация в таблице Объект тоже считается ссылкой и переименовывается", async () => {
  const wb = make();
  const book = await readBook(wb);
  const hits = findReferences(book, "Организации", 'ООО "СБД"');
  assert.deepEqual(hits.map((h) => h.table).sort(), ["Объект", "Представители"]);
  assert.deepEqual(await renameKey(wb, book, "Организации", 'ООО "СБД"', 'ООО "СБД-2"'), { ok: true, updated: 2 });
  assert.equal((await wb.read("Объект"))!.rows[0][1], 'ООО "СБД-2"');
});

test("renameKey после того, как ключ уже изменён в ячейке (книга перечитана)", async () => {
  const wb = make();
  await wb.write("Материалы", 0, { "Наименование": "Кабель RS-485" });
  const r = await renameKey(wb, await readBook(wb), "Материалы", "Кабель", "Кабель RS-485");
  assert.deepEqual(r, { ok: true, updated: 3 });
});

test("renameKey отказывает, если новое имя теперь у двух строк", async () => {
  const wb = make();
  await wb.write("Материалы", 0, { "Наименование": "Труба" });
  assert.deepEqual(await renameKey(wb, await readBook(wb), "Материалы", "Кабель", "Труба"), { ok: false, message: "Такое значение уже есть" });
});
