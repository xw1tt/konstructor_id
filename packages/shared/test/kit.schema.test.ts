// План 7: схема книги — комплекты, реестр ИД, сканы и логотипы.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TABLES, SHEETS, OBJECT_FIELDS, SCHEMA_VERSION, REGISTRY_KINDS, keyColumn, column } from "@idk/shared/workbook/schema";
import { exampleRows } from "@idk/shared/workbook/examples";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";

test("листы «Комплекты» и «Реестр ИД», версия схемы 5", () => {
  assert.ok(SCHEMA_VERSION >= 5);
  assert.deepEqual(SHEETS.slice(-4, -2), [
    { name: "Комплекты", tables: ["Комплекты", "АктыКомплектов"] },
    { name: "Реестр ИД", tables: ["РеестрИД"] },
  ]);
  assert.deepEqual(TABLES["Комплекты"].columns.map((c) => c.header), [
    "№ реестра", "Шифр", "Том", "Часть", "Корпус", "Перечень работ", "Город", "Год", "Титул", "Корешки", "Частей в томе",
  ]);
  assert.equal(keyColumn("Комплекты")!.header, "№ реестра");
  assert.deepEqual(TABLES["АктыКомплектов"].columns.map((c) => [c.header, c.ref]), [["Комплект", "Комплекты"], ["Акт", "Акты"]]);
  assert.deepEqual(TABLES["РеестрИД"].columns.map((c) => c.header), [
    "Комплект", "Вид", "Акт", "Номер документа", "Наименование", "Дата / период", "Экз.", "Шифр чертежа", "Скан", "Листов",
  ]);
  assert.deepEqual(REGISTRY_KINDS, ["ВОР", "АОСР", "РИМ", "ВД", "Схема", "КЖ", "Протокол", "Поверка", "Лаборатория", "АВК", "Документ качества", "Прочее"]);
  assert.equal(column("Комплекты", "cover").default, "да");
  assert.equal(column("РеестрИД", "copies").default, 1);
});

test("сканы и логотипы; папка сканов в «Объекте»", () => {
  assert.equal(column("Организации", "logo").type, "file");
  assert.equal(column("Электролаборатория", "file").header, "Скан");
  assert.equal(column("СредстваИзмерений", "file").header, "Скан");
  assert.equal(OBJECT_FIELDS.at(-2)!.label, "Папка сканов");
  assert.equal(OBJECT_FIELDS.at(-1)!.label, "Условия производства работ");
});

test("строки-примеры новых таблиц не читаются как данные", async () => {
  const ex = exampleRows();
  assert.ok(ex["Комплекты"]![0]["№ реестра"]);
  const book = await readBook(new MemoryWorkbook(ex as any));
  assert.deepEqual(book.tables["Комплекты"], []);
  assert.deepEqual(book.tables["РеестрИД"], []);
  assert.deepEqual(book.tables["АктыКомплектов"], []);
});
