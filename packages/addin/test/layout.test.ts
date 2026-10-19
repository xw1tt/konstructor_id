import { test } from "node:test";
import assert from "node:assert/strict";
import { column } from "@idk/shared/workbook/schema";
import { listSource, listName, strictList, importantRule, duplicateRule, colLetter, promptFor, exampleRule, applyValidation } from "@idk/addin/book/layout";
import { TABLES, TABLE_NAMES } from "@idk/shared/workbook/schema";

test("источник списка", () => {
  assert.equal(listSource(column("ВОР", "material")), '=INDIRECT("Материалы[Наименование]")');
  assert.equal(listSource(column("Акты", "vorCustomer")), '=INDIRECT("Представители[ФИО]")');
  assert.equal(listSource(column("Схемы", "kind"), "Схемы"), "=Список_Схемы_kind");
  assert.equal(listSource(column("Представители", "role"), "Представители"), "=Список_Представители_role");
  assert.equal(listSource(column("Материалы", "name")), null);
  assert.equal(strictList(column("ДокументыКачества", "materials")), false);
  assert.equal(strictList(column("ВОР", "material")), true);
});

test("правила условного форматирования", () => {
  assert.equal(importantRule("A", "E", "C", 5), "=AND(COUNTA($A5:$E5)>0,LEN(TRIM(C5))=0)");
  assert.equal(duplicateRule("A", 5, 300), '=AND(A5<>"",COUNTIF($A$5:$A$300,A5)>1)');
});

test("буква столбца", () => {
  assert.equal(colLetter(0), "A");
  assert.equal(colLetter(25), "Z");
  assert.equal(colLetter(26), "AA");
});

test("видимые строки таблицы из областей выделения (фильтр скрывает часть строк)", async () => {
  const { visibleTableRows } = await import("@idk/addin/book/layout");
  // данные таблицы с 5-й строки листа (rowIndex 4), 10 строк; видимы 4–5 и 8 строки листа (с 0)
  assert.deepEqual(visibleTableRows([{ rowIndex: 4, rowCount: 2 }, { rowIndex: 8, rowCount: 1 }], 4, 10), [0, 1, 4]);
  assert.deepEqual(visibleTableRows([{ rowIndex: 0, rowCount: 6 }], 4, 1), [0]);
});

test("место новой таблицы — ниже занятой части листа", async () => {
  const { nextTableTop } = await import("@idk/addin/book/layout");
  assert.equal(nextTableTop(null), 3);
  assert.equal(nextTableTop(20), 24);
});

test("текстовый формат ячеек для текстовых столбцов", async () => {
  const { textFormatted } = await import("@idk/addin/book/layout");
  assert.equal(textFormatted(column("Организации", "inn")), true);
  assert.equal(textFormatted(column("ВОР", "material")), true);
  assert.equal(textFormatted(column("Объект", "value")), true);
  assert.equal(textFormatted(column("ВОР", "quantity")), false);
  assert.equal(textFormatted(column("Акты", "date")), false);
  assert.equal(textFormatted(column("МатериалыАктов", "vorSum")), false);
});

test("имена списков перечислений уникальны по всей книге", () => {
  const names = TABLE_NAMES.flatMap((t) => TABLES[t].columns.filter((c) => c.type === "enum").map((c) => listName(t, c)));
  assert.equal(new Set(names).size, names.length, names.join(", "));
});

test("подсказка проверки данных", () => {
  const p = promptFor(column("Акты", "normative"));
  assert.equal(p.title, "Нормативы (п.6)");
  assert.equal(p.message, column("Акты", "normative").hint);
  const long = promptFor({ ...column("Акты", "normative"), header: "Очень длинный заголовок столбца для проверки" });
  assert.equal(long.title.length, 32);
  assert.ok(long.title.endsWith("…"));
});

test("правило оформления примеров — по ячейке-признаку", () => {
  assert.equal(exampleRule("C", 5), '=COUNTIF($C5,"Пример:*")>0');
});

test("ревью: подсказка не стирается очисткой правила списка", () => {
  // Модель dataValidation Office.js: clear() убирает и правило, и подсказку.
  const fake = () => {
    const dv: any = { rule: null, prompt: null, errorAlert: null, clear() { this.rule = null; this.prompt = null; this.errorAlert = null; } };
    return { dataValidation: dv };
  };
  const ref = fake(); applyValidation(ref, column("Акты", "section"), "Акты");
  assert.equal(ref.dataValidation.prompt.message, column("Акты", "section").hint);
  assert.ok(ref.dataValidation.rule.list.source.includes("Шифры"));
  const text = fake(); applyValidation(text, column("Акты", "works"), "Акты");
  assert.equal(text.dataValidation.prompt.title, "Работы (п.1)");
  assert.equal(text.dataValidation.rule, null);
});

test("«Объект»: розовая подсветка пустого значения — только у обязательных полей", async () => {
  const { objectImportantRule } = await import("../src/book/layout.ts");
  const { OBJECT_REQUIRED_LABELS, isObjectFieldRequired } = await import("@idk/shared/workbook/schema");
  assert.deepEqual(OBJECT_REQUIRED_LABELS, ["Наименование объекта", "Застройщик (технический заказчик)", "Лицо, осуществляющее строительство"]);
  assert.equal(objectImportantRule("A", "B", 5, ["Наименование объекта", 'Поле "x"']),
    '=AND(OR($A5="Наименование объекта",$A5="Поле ""x"""),LEN(TRIM(B5))=0)');
  assert.equal(isObjectFieldRequired("Договор №"), false);
  assert.equal(isObjectFieldRequired("Дата договора"), false);
  assert.equal(isObjectFieldRequired("Застройщик (технический заказчик)"), true);
});
