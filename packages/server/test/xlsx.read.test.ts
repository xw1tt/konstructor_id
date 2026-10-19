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

test("повреждённое сжатие — XlsxError; посторонние файлы книги не распаковываются", async () => {
  const { makeXlsx: mk } = await import("./helpers/xlsx.ts");
  const good = Buffer.from(mk({ "А": [[1, "x"]] }));
  // испортить данные первой записи (Content_Types) — она не нужна для чтения
  const bad = Buffer.from(good);
  bad[30 + "[Content_Types].xml".length + 2] ^= 0xff;
  bad[30 + "[Content_Types].xml".length + 3] ^= 0xff;
  assert.deepEqual(readXlsx(bad).grid("А"), [[1, "x"]]);
  // испортить лист — понятная ошибка, а не Z_DATA_ERROR
  const i = good.indexOf(Buffer.from("xl/worksheets/sheet1.xml"));
  const broken = Buffer.from(good);
  for (let k = 0; k < 8; k++) broken[i + 24 + 2 + k] ^= 0xff;
  assert.throws(() => readXlsx(broken).grid("А"), XlsxError);
});
