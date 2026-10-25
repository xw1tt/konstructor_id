// План 15, задача 1: книга одним заходом (readMany) и сборка из прочитанных таблиц.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook, readTables, bookFromTables } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { TABLE_NAMES, type TableName } from "@idk/shared/workbook/schema";
import type { TableData } from "@idk/shared/workbook/store";
import { aov1Records } from "./fixtures/aov1Book.ts";

test("readBook через readMany = через read; одно обращение readMany", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const plain = await readBook(wb);
  let many = 0, single = 0;
  const store = Object.assign(Object.create(wb), {
    read: (n: TableName) => { single++; return wb.read(n); },
    readMany: async (names: readonly TableName[]) => { many++; const m = new Map<TableName, TableData | null>(); for (const n of names) m.set(n, await wb.read(n)); return m; },
  });
  assert.deepEqual(await readBook(store), plain);
  assert.equal(many, 1);
  assert.equal(single, 0);
});

test("bookFromTables: отсутствующая таблица — в missing", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const t = await readTables(wb);
  t.set("ВОР", null);
  t.delete("Схемы");
  const b = bookFromTables(t);
  assert.ok(b.missing.includes("ВОР") && b.missing.includes("Схемы"));
  assert.equal(b.missing.length, 2);
  assert.equal(t.size, TABLE_NAMES.length - 1);
});
