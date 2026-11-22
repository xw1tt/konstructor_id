import { test } from "node:test";
import assert from "node:assert/strict";
import { planKitActs } from "../src/kit/compose.ts";
import type { Book } from "../src/workbook/records.ts";

const book = (rows: [string, string][]) =>
  ({ tables: { АктыКомплектов: rows.map(([kit, act], row) => ({ row, v: { kit, act }, link: {} })) } }) as unknown as Book;

test("planKitActs: перестановка, добавление и удаление", () => {
  const b = book([
    ["1", "А1"],
    ["2", "Б1"],
    ["1", "А2"],
    ["1", "А3"],
  ]);
  assert.deepEqual(planKitActs(b, "1", ["А2", "А1"]), {
    write: [
      { row: 0, act: "А2" },
      { row: 2, act: "А1" },
    ],
    insert: null,
    remove: [3],
  });
  assert.deepEqual(planKitActs(b, "1", ["А1", "А2", "А3", "А4"]), { write: [], insert: { after: 3, acts: ["А4"] }, remove: [] });
  assert.deepEqual(planKitActs(b, "3", ["В1"]), { write: [], insert: { after: null, acts: ["В1"] }, remove: [] });
});
