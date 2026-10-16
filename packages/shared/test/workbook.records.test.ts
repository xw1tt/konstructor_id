import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { loadImportant, saveImportant, defaultImportant } from "@idk/shared/workbook/important";
import { tableRows } from "@idk/shared/workbook/store";

test("readBook пропускает пустые строки и раскладывает по ключам", async () => {
  const wb = new MemoryWorkbook({ "Материалы": [
    { "Наименование": "Кабель", "Ед. изм.": "м." }, {}, { "Наименование": "Труба" }] });
  const b = await readBook(wb);
  assert.deepEqual(b.tables["Материалы"]!.map((r) => [r.row, r.v.name]), [[0, "Кабель"], [2, "Труба"]]);
  assert.equal(b.tables["Материалы"]![0].v.unit, "м.");
});

test("пустые строки с одними пробелами тоже пропускаются", async () => {
  const wb = new MemoryWorkbook({ "Материалы": [{ "Наименование": "  " }, { "Наименование": "Кабель" }] });
  assert.equal((await readBook(wb)).tables["Материалы"]!.length, 1);
});

test("Объект читается как поля", async () => {
  const wb = new MemoryWorkbook({ "Объект": [
    { "Поле": "Наименование объекта", "Значение": "Корпус В" }, { "Поле": "Город", "Значение": "Москва" }] });
  const b = await readBook(wb);
  assert.equal(b.object.name, "Корпус В");
  assert.equal(b.object.city, "Москва");
  assert.equal(b.object.developer, null);
});

test("нет таблицы — в missing", async () => {
  const wb = new MemoryWorkbook();
  wb.drop("ВОР");
  const b = await readBook(wb);
  assert.deepEqual(b.missing, ["ВОР"]);
  assert.equal(b.tables["ВОР"], undefined);
});

test("важные столбцы: по умолчанию и сохранённые", async () => {
  const wb = new MemoryWorkbook();
  assert.ok((await loadImportant(wb))["Акты"]!.includes("Номер акта"));
  assert.ok(!defaultImportant()["Акты"]!.includes("Экз."));
  await saveImportant(wb, { "Акты": ["Дата акта"] });
  assert.deepEqual((await loadImportant(wb))["Акты"], ["Дата акта"]);
});

test("write не трогает формульный столбец", async () => {
  const wb = new MemoryWorkbook({ "МатериалыАктов": [{ "Акт": "1", "Материал": "Кабель" }] });
  await wb.write("МатериалыАктов", 0, { "Сумма ВОР": 5, "Кол-во": 3 });
  const t = await wb.read("МатериалыАктов");
  assert.deepEqual(t!.rows[0], ["1", "Кабель", null, 3, null]);
});

test("ссылки на файлы хранятся отдельно от значений", async () => {
  const wb = new MemoryWorkbook({ "Схемы": [{ "Акт": "1" }] });
  await wb.write("Схемы", 0, { "Скан": "схема.pdf" }, { "Скан": "https://localhost:3443/api/files/7" });
  const b = await readBook(wb);
  assert.equal(b.tables["Схемы"]![0].v.file, "схема.pdf");
  assert.equal(b.tables["Схемы"]![0].link.file, "https://localhost:3443/api/files/7");
});

test("tableRows: чтение, вставка, удаление", async () => {
  const wb = new MemoryWorkbook({ "Материалы": [{ "Наименование": "А" }, { "Наименование": "Б" }] });
  const t = tableRows(wb, "Материалы");
  await t.insertBlank(1, 2);
  assert.equal(await t.count(), 4);
  await t.write(1, { values: ["В", null, null, null, null], links: [] });
  await t.remove([2]);
  assert.deepEqual((await wb.read("Материалы"))!.rows.map((r) => r[0]), ["А", "В", "Б"]);
});
