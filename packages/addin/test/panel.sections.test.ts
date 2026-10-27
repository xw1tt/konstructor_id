import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS, sectionForSheet } from "@idk/addin/panel/sections";
import { columnStatus, tablesOnSheet } from "@idk/addin/panel/tableTools";

test("разделы панели", () => {
  assert.deepEqual(SECTIONS.map((s) => s.label), ["Реквизиты", "Представители", "Акты", "Материалы", "Схемы", "Кабельный журнал", "Комплекты", "ОЖР"]);
  assert.equal(sectionForSheet("Спецификация"), null, "план 31: спецификация — столбцы «Материалов»");
  assert.deepEqual(SECTIONS.find((s) => s.id === "acts")!.sheets, ["База актов", "Исполнительные схемы", "Материалы в актах", "ВОР"]);
  assert.deepEqual(SECTIONS.find((s) => s.id === "materials")!.sheets, ["Материалы"]);
});

test("раздел по листу", () => {
  assert.equal(sectionForSheet("Материалы"), "materials");
  assert.equal(sectionForSheet("ВОР"), "acts");
  assert.equal(sectionForSheet("Исполнительные схемы"), "schemes");
  assert.equal(sectionForSheet("Лист1"), null);
  assert.equal(sectionForSheet("Изоляция"), "cables");
  assert.equal(sectionForSheet("Реестр ИД"), "kits");
});

test("статус столбцов", () => {
  assert.deepEqual(columnStatus(["А", "Б", "В"], ["Б", "В"], ["x", "", 0]), [
    { header: "А", important: false, empty: false },
    { header: "Б", important: true, empty: true },
    { header: "В", important: true, empty: false },
  ]);
  assert.deepEqual(columnStatus(["А"], ["А"], null), [{ header: "А", important: true, empty: false }]);
});

test("таблицы листа", () => {
  assert.deepEqual(tablesOnSheet("Реквизиты"), ["Объект", "Организации", "Шифры"]);
  assert.deepEqual(tablesOnSheet("Лист1"), []);
});
