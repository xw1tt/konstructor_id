// План 10: схема книги — спецификация проекта и № п/п РКЦ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TABLES, SHEETS, SCHEMA_VERSION, SPEC_SOURCES, SPEC_MISSING, TABLE_NAMES, keyColumn, column } from "@idk/shared/workbook/schema";
import { missingColumns } from "../../addin/src/book/layout.ts";

test("таблица «Спецификация» — виртуальная, из «Материалов» (план 31)", () => {
  assert.ok(SCHEMA_VERSION >= 13);
  assert.equal(TABLES["Спецификация"].virtual, true);
  assert.equal(TABLES["Спецификация"].sheet, "Материалы");
  assert.deepEqual(TABLES["Спецификация"].columns.map((c) => c.header), [
    "№ п/п", "Раздел", "Наименование", "Ед. изм.", "Кол-во по проекту", "Закрыто", "Остаток", "Источник", "Примечание",
  ]);
  assert.deepEqual(TABLES["Спецификация"].columns.map((c) => c.key),
    ["number", "section", "name", "unit", "quantity", "closed", "rest", "source", "note"]);
  assert.equal(keyColumn("Спецификация")!.header, "№ п/п");
  assert.equal(column("Спецификация", "number").type, "text");
  // Сравнение как текст: SUMIFS превращал «1.1» в число/дату и путал «1.1» с «1.10».
  assert.equal(column("Спецификация", "closed").formula,
    '=SUMPRODUCT(--(МатериалыАктов[№ п/п РКЦ]&""=[@[№ п/п]]&""),МатериалыАктов[Учёт])');
  assert.equal(column("Спецификация", "rest").formula, "=[@[Кол-во по проекту]]-[@Закрыто]");
  assert.ok(column("Спецификация", "closed").service && column("Спецификация", "rest").service);
  assert.deepEqual([...SPEC_SOURCES], ["РКЦ", "вручную"]);
  assert.deepEqual(column("Спецификация", "source").values, ["РКЦ", "вручную"]);
  assert.equal(column("Спецификация", "source").default, "вручную");
  assert.equal(SPEC_MISSING, "нет в РКЦ");
  assert.ok(!SHEETS.some((s) => s.name === "Спецификация" || s.tables.includes("Спецификация")));
  assert.deepEqual(TABLES["Материалы"].columns.slice(5, 12).map((c) => c.header),
    ["№ п/п РКЦ", "Раздел", "Кол-во по проекту", "Закрыто", "Остаток", "Источник", "Примечание"]);
});

test("№ п/п РКЦ в «Материалах» и формулы «Материалов в актах»", () => {
  const m = column("Материалы", "rkc");
  assert.equal(m.header, "№ п/п РКЦ");
  assert.equal(m.ref, undefined);
  assert.ok(!m.important);
  const cols = TABLES["МатериалыАктов"].columns;
  assert.deepEqual(cols.slice(-2).map((c) => c.key), ["rkc", "counted"]);
  assert.equal(column("МатериалыАктов", "rkc").formula,
    '=IFERROR(INDEX(Материалы[№ п/п РКЦ],MATCH([@Материал],Материалы[Наименование],0))&"","")');
  assert.equal(column("МатериалыАктов", "counted").formula, '=IF([@[Кол-во]]="",[@[Сумма ВОР]],[@[Кол-во]])');
  assert.equal(column("МатериалыАктов", "counted").header, "Учёт");
});

test("формулы без функций, которых нет в Excel 2019", () => {
  for (const t of TABLE_NAMES) for (const c of TABLES[t].columns)
    if (c.formula) assert.doesNotMatch(c.formula, /XLOOKUP|LET\(|FILTER\(/, `${t}.${c.header}`);
});

test("обновление разметки v5 → v6 дописывает новые столбцы", () => {
  const v5Mat = ["Наименование", "Марка", "Артикул", "Завод-изготовитель", "Ед. изм."];
  assert.deepEqual(missingColumns("Материалы", v5Mat).map((c) => c.header).slice(0, 2), ["№ п/п РКЦ", "Раздел"]);
  const v5Am = ["Акт", "Материал", "№ поз. по УСР", "Кол-во", "Сумма ВОР"];
  assert.deepEqual(missingColumns("МатериалыАктов", v5Am).map((c) => c.header), ["№ п/п РКЦ", "Учёт"]);
});
