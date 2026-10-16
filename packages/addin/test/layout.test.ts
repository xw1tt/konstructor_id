import { test } from "node:test";
import assert from "node:assert/strict";
import { column } from "@idk/shared/workbook/schema";
import { listSource, strictList, importantRule, duplicateRule, colLetter } from "@idk/addin/book/layout";

test("источник списка", () => {
  assert.equal(listSource(column("ВОР", "material")), '=INDIRECT("Материалы[Наименование]")');
  assert.equal(listSource(column("Акты", "vorCustomer")), '=INDIRECT("Представители[ФИО]")');
  assert.equal(listSource(column("Схемы", "kind")), "=Список_kind");
  assert.equal(listSource(column("Представители", "role")), "=Список_role");
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
