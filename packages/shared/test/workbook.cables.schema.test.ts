import { test } from "node:test";
import assert from "node:assert/strict";
import { TABLES, SHEETS, keyColumn, column } from "@idk/shared/workbook/schema";

test("лист «Изоляция» и его таблицы", () => {
  const iso = SHEETS.find((x) => x.name === "Изоляция")!;
  assert.deepEqual(iso.tables, ["Электролаборатория", "СредстваИзмерений", "ИзмеренияМарок", "ДокументыКабелей"]);
  assert.deepEqual(TABLES["ИзмеренияМарок"].columns.map((c) => c.header).slice(4),
    ["А-В", "В-С", "С-А", "A-N (PEN)", "B-N (PEN)", "C-N (PEN)", "A-PE", "B-PE", "C-PE", "N-PE"]);
  assert.deepEqual(TABLES["Электролаборатория"].columns.map((c) => c.header),
    ["Организация и адрес", "Свидетельство", "Руководитель электролаборатории", "Испытания провёл", "Скан"]);
  assert.deepEqual(TABLES["СредстваИзмерений"].columns.map((c) => c.header),
    ["Наименование СИ", "Тип", "Диапазон", "Точность", "Заводской №", "№ свидетельства о поверке", "Дата поверки", "Дата очередной поверки", "Орган поверки", "Скан"]);
  assert.equal(keyColumn("ДокументыКабелей")?.header, "Акт");
  assert.equal(column("ДокументыКабелей", "act").ref, "Акты");
  assert.equal(column("ДокументыКабелей", "normative").default, "ПУЭ 7 изд. 1.8.37 п.1, таблица 1.8.34");
  assert.equal(column("ДокументыКабелей", "purpose").default, "приемо-сдаточные");
  assert.equal(column("ИзмеренияМарок", "voltage").default, 500);
  assert.equal(column("ИзмеренияМарок", "allowed").default, 0.5);
});
