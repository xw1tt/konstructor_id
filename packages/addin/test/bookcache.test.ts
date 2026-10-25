// План 15, задача 1: панель перечитывает только изменённую таблицу; книга = полному чтению.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import type { TableName } from "@idk/shared/workbook/schema";
import { BookCache } from "@idk/addin/panel/bookCache";
import { aov1Records } from "../../shared/test/fixtures/aov1Book.ts";

const counted = (wb: MemoryWorkbook) => {
  const reads: string[] = [];
  const store = Object.assign(Object.create(wb), {
    read: (n: TableName) => { reads.push(n); return wb.read(n); },
    readMany: async (names: readonly TableName[]) => { reads.push(`many:${names.length}`); const m = new Map(); for (const n of names) m.set(n, await wb.read(n)); return m; },
  });
  return { store, reads };
};

test("полное чтение — один readMany; правка одной таблицы — один read; книга = полному чтению", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const { store, reads } = counted(wb);
  const c = new BookCache(store);
  await c.full();
  assert.equal(reads.length, 1);
  assert.match(reads[0], /^many:/);
  reads.length = 0;
  await wb.write("Материалы", 0, { "Наименование": "Новый материал" });
  let b = await c.refresh(["Материалы"]);
  assert.deepEqual(reads, ["Материалы"]);
  assert.deepEqual(b, await readBook(wb));
  reads.length = 0;
  await wb.insert("Акты", 0, [{ "Номер акта": "X-1" }]);
  await wb.write("Объект", 0, { "Значение": "Другой объект" });
  b = await c.refresh(["Акты", "Объект"]);
  assert.deepEqual(reads.sort(), ["Акты", "Объект"]);
  assert.deepEqual(b, await readBook(wb));
  assert.equal(c.table("Акты")?.rows.length, (await wb.read("Акты"))!.rows.length, "таблицы для карточки — свежие");
});

test("неизвестная таблица, пустой кеш или ошибка чтения — полное чтение", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const { store, reads } = counted(wb);
  const c = new BookCache(store);
  await c.refresh(["Акты"]);
  assert.match(reads[0], /^many:/, "пустой кеш");
  reads.length = 0;
  await c.refresh([null]);
  assert.match(reads[0], /^many:/, "изменение вне наших таблиц");
  reads.length = 0;
  store.read = async () => { throw new Error("сбой"); };
  assert.deepEqual(await c.refresh(["Акты"]), await readBook(wb));
  assert.ok(reads.some((r) => r.startsWith("many:")));
});
