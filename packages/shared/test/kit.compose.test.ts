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

test("setActKit: акт переносится в другой комплект (в конец состава), «не в комплекте» — убирается", async () => {
  const { MemoryWorkbook } = await import("../src/workbook/memory.ts");
  const { readBook } = await import("../src/workbook/records.ts");
  const { setActKit } = await import("../src/kit/compose.ts");
  const wb = new MemoryWorkbook({
    АктыКомплектов: [
      { Комплект: "1", Акт: "А1" },
      { Комплект: "1", Акт: "А2" },
      { Комплект: "2", Акт: "Б1" },
    ],
  } as never);
  const list = async () => ((await readBook(wb)).tables["АктыКомплектов"] ?? []).map((r) => `${r.v.kit}:${r.v.act}`);
  await setActKit(wb, await readBook(wb), "А1", "2");
  assert.deepEqual(await list(), ["1:А2", "2:Б1", "2:А1"]);
  await setActKit(wb, await readBook(wb), "Б1", "1");
  assert.deepEqual(await list(), ["1:А2", "1:Б1", "2:А1"]);
  await setActKit(wb, await readBook(wb), "В1", "3");
  assert.deepEqual(await list(), ["1:А2", "1:Б1", "2:А1", "3:В1"]);
  await setActKit(wb, await readBook(wb), "А2", "");
  assert.deepEqual(await list(), ["1:Б1", "2:А1", "3:В1"]);
});
