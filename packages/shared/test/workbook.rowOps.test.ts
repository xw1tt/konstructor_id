import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { tableRows } from "@idk/shared/workbook/store";
import { addRows, duplicateRow, moveRow, deleteRows } from "@idk/shared/workbook/rowOps";

const setup = () => {
  const wb = new MemoryWorkbook({ "Материалы": ["A", "B", "C"].map((n) => ({ "Наименование": n })) });
  const t = tableRows(wb, "Материалы");
  const names = async () => (await wb.read("Материалы"))!.rows.map((r) => r[0]);
  return { wb, t, names };
};

test("addRows под текущей и в конец", async () => {
  const { t, names } = setup();
  assert.equal(await addRows(t, 0, 2), 1);
  assert.deepEqual(await names(), ["A", null, null, "B", "C"]);
  assert.equal(await addRows(t, null, 1), 5);
  assert.equal(await t.count(), 6);
});

test("duplicateRow ставит копию под строкой", async () => {
  const { t, names } = setup();
  assert.equal(await duplicateRow(t, 1), 2);
  assert.deepEqual(await names(), ["A", "B", "B", "C"]);
});

test("moveRow: вверх, у края ничего, вниз", async () => {
  const { t, names } = setup();
  assert.equal(await moveRow(t, 1, -1), 0);
  assert.deepEqual(await names(), ["B", "A", "C"]);
  assert.equal(await moveRow(t, 0, -1), 0);
  assert.deepEqual(await names(), ["B", "A", "C"]);
  assert.equal(await moveRow(t, 2, 1), 2);
  assert.equal(await moveRow(t, 0, 1), 1);
  assert.deepEqual(await names(), ["A", "B", "C"]);
});

test("moveRow не переносит формулу Сумма ВОР", async () => {
  const wb = new MemoryWorkbook({ "МатериалыАктов": [
    { "Акт": "1", "Материал": "А", "Кол-во": 1 }, { "Акт": "1", "Материал": "Б", "Кол-во": 2 }] });
  await moveRow(tableRows(wb, "МатериалыАктов"), 1, -1);
  const rows = (await wb.read("МатериалыАктов"))!.rows;
  assert.deepEqual(rows, [["1", "Б", null, 2, null], ["1", "А", null, 1, null]]);
});

test("deleteRows удаляет выделенные, повторы игнорирует", async () => {
  const { t, names } = setup();
  assert.equal(await deleteRows(t, [2, 0, 2]), 2);
  assert.deepEqual(await names(), ["B"]);
});
