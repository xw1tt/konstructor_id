// 0.39: книга из сохранённого файла без Excel — чтение (с виртуальными таблицами), печать по ней; правки запрещены.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { TABLE_NAMES, type TableName } from "@idk/shared/workbook/schema";
import type { TableData } from "@idk/shared/workbook/store";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { FilePort, READ_ONLY } from "@idk/addin/book/filePort";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

async function snapshot() {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const tables: Partial<Record<TableName, TableData>> = {};
  for (const n of TABLE_NAMES) {
    const t = await wb.read(n);
    if (t) tables[n] = t;
  }
  return { name: "Объект.xlsx", tables, settings: { "idk.template": "sbd" } };
}

test("FilePort: книга читается как из Excel, пакет акта собирается; запись — понятная ошибка", async () => {
  const snap = await snapshot();
  const port = new FilePort(snap);
  const book = await readBook(port);
  const direct = await readBook(new MemoryWorkbook(aov1Records() as any));
  assert.deepEqual(book.tables["Акты"], direct.tables["Акты"]);
  assert.deepEqual(book.tables["ДокументыКачества"], direct.tables["ДокументыКачества"], "виртуальные таблицы — как в Excel");
  assert.ok(buildBundle(book, AOV1, defaultImportant()).bundle, "печать по файлу");
  assert.equal(await port.setting("idk.template"), "sbd");
  await port.setSetting("idk.template", "ti");
  assert.equal(await port.setting("idk.template"), "ti", "выбор шаблона — на время просмотра");
  await assert.rejects(port.write("Акты", 0, { "Номер акта": "X" }), new RegExp(READ_ONLY.slice(0, 20)));
  await assert.rejects(port.insert("Акты", 0, [{}]));
  await assert.rejects(port.ensureBook(defaultImportant()));
  await port.activateSheet("Материалы");
  assert.equal((await port.getSelection()).table, null);
});
