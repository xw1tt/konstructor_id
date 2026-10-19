// План 10: чтение .xlsx без зависимостей.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readXlsx, XlsxError } from "@idk/server/xlsx/read";
import { makeXlsx } from "./helpers/xlsx.ts";

test("листы, общие строки, числа", () => {
  const b = readXlsx(makeXlsx({ "д.с.1 ": [["№П/П", "Наименование"], [1.1, "Кабель «А» & <Б>"]], "ИД": [[null, "x", 3]] }));
  assert.deepEqual(b.sheets, ["д.с.1 ", "ИД"]);
  assert.deepEqual(b.grid("д.с.1 "), [["№П/П", "Наименование"], [1.1, "Кабель «А» & <Б>"]]);
  assert.deepEqual(b.grid("ИД"), [[null, "x", 3]]);
});

test("inline-строки и булевы читаются так же", () => {
  const b = readXlsx(makeXlsx({ "Л": [["текст", true, 2]] }, { shared: false }));
  assert.deepEqual(b.grid("Л"), [["текст", true, 2]]);
});

test("пропуски строк и столбцов — null", () => {
  const b = readXlsx(makeXlsx({ "Л": [[null, null, "C1"], [], [1]] }));
  assert.deepEqual(b.grid("Л"), [[null, null, "C1"], [], [1]]);
});

test("не xlsx — XlsxError; нет листа — XlsxError", () => {
  assert.throws(() => readXlsx(new TextEncoder().encode("%PDF-1.4 ...")), XlsxError);
  assert.throws(() => readXlsx(makeXlsx({ "А": [[1]] })).grid("Б"), /Лист «Б» не найден/);
});
