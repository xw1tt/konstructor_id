// План 10: повторная загрузка РКЦ — слияние со спецификацией книги.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import type { CellValue } from "@idk/shared/workbook/values";
import { mergeSpec, applySpec } from "@idk/shared/spec/merge";
import type { RkcItem } from "@idk/shared/spec/rkc";

const it = (number: string, name: string, quantity: number, section = "Р", unit = "шт."): RkcItem => ({ number, section, name, unit, quantity });
const row = (n: string, name: string, q: number, source: string, note: string | null = null): Record<string, CellValue> =>
  ({ "№ п/п": n, "Раздел": "Р", "Наименование": name, "Ед. изм.": "шт.", "Кол-во по проекту": q, "Источник": source, "Примечание": note });
const book = async (spec: Record<string, CellValue>[], extra: Record<string, Record<string, CellValue>[]> = {}) =>
  readBook(new MemoryWorkbook({ "Спецификация": spec, ...extra }));
const nums = (rows: Record<string, CellValue>[]) => rows.map((r) => r["№ п/п"]);

test("пустая книга — все позиции новые, источник «РКЦ»", async () => {
  const { rows, diff } = mergeSpec(await book([]), [it("1", "А", 1), it("2", "Б", 2), it("3", "В", 3)]);
  assert.equal(diff.added.length, 3);
  assert.deepEqual(rows.map((r) => r["Источник"]), ["РКЦ", "РКЦ", "РКЦ"]);
  assert.deepEqual(rows[1], { "№ п/п": "2", "Раздел": "Р", "Наименование": "Б", "Ед. изм.": "шт.", "Кол-во по проекту": 2, "Источник": "РКЦ", "Примечание": null });
});

test("обновление по №, ручная строка остаётся на месте, новая — по порядку РКЦ", async () => {
  const b = await book([row("1.1", "Кабель", 10, "РКЦ"), row("доп-1", "Доп. кабель", 3, "вручную"), row("1.2", "Лоток", 5, "РКЦ")]);
  const { rows, diff } = mergeSpec(b, [it("1.1", "Кабель", 12), it("1.2", "Лоток", 5), it("1.3", "Муфта", 1)]);
  assert.deepEqual(nums(rows), ["1.1", "доп-1", "1.2", "1.3"]);
  assert.deepEqual(diff.changed, [{ number: "1.1", fields: ["Кол-во по проекту"] }]);
  assert.deepEqual(diff.added.map((a) => a.number), ["1.3"]);
  assert.equal(diff.same, 1);
  assert.deepEqual(rows[1], row("доп-1", "Доп. кабель", 3, "вручную"));
});

test("позиции нет в новом РКЦ — остаётся с пометкой; пометка не дублируется и снимается при возврате", async () => {
  const b = await book([row("1.1", "Кабель", 10, "РКЦ"), row("1.2", "Лоток", 5, "РКЦ", "уточнить")]);
  const first = mergeSpec(b, [it("1.1", "Кабель", 10)]);
  assert.deepEqual(nums(first.rows), ["1.1", "1.2"]);
  assert.equal(first.rows[1]["Примечание"], "уточнить; нет в РКЦ");
  assert.deepEqual(first.diff.missing, ["1.2"]);
  const b2 = await book(first.rows);
  assert.equal(mergeSpec(b2, [it("1.1", "Кабель", 10)]).rows[1]["Примечание"], "уточнить; нет в РКЦ");
  const back = mergeSpec(b2, [it("1.1", "Кабель", 10), it("1.2", "Лоток", 5)]);
  assert.equal(back.rows[1]["Примечание"], "уточнить");
});

test("«б/н» сопоставляются по наименованию", async () => {
  const b = await book([row("б/н-1", "Датчик X", 7, "РКЦ")]);
  const { rows } = mergeSpec(b, [it("б/н-1", "Датчик Y", 1), it("б/н-2", "Датчик X", 7)]);
  assert.deepEqual(rows.map((r) => [r["№ п/п"], r["Наименование"]]), [["б/н-1", "Датчик Y"], ["б/н-2", "Датчик X"]]);
});

test("applySpec пишет только «Спецификацию»; привязки материалов не трогаются", async () => {
  const wb = new MemoryWorkbook({
    "Спецификация": [row("1.2", "Лоток", 5, "РКЦ")],
    "Материалы": [{ "Наименование": "Лоток 50х50", "Ед. изм.": "шт.", "№ п/п РКЦ": "1.2" }],
  });
  const diff = await applySpec(wb, await readBook(wb), [it("1.1", "Кабель", 10)]);
  assert.deepEqual(diff.missing, ["1.2"]);
  const b = await readBook(wb);
  assert.deepEqual(b.tables["Спецификация"]!.map((r) => r.v.number), ["1.1", "1.2"]);
  assert.equal(b.tables["Материалы"]![0].v.rkc, "1.2");
});
