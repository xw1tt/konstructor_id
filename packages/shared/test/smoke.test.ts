import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_CODES } from "@idk/shared/roles";

test("smoke: импорт @idk/shared работает", () => {
  assert.ok(Array.isArray(ROLE_CODES));
});

test("настройки печати книги: по умолчанию как в образце СБД", async () => {
  const { loadPrintOptions, savePrintOptions, PrintOptions } = await import("@idk/shared/templates");
  const { MemoryWorkbook } = await import("@idk/shared/workbook/memory");
  const wb = new MemoryWorkbook({});
  assert.deepEqual(await loadPrintOptions(wb), { schemeEach: false, formSet: "sbd", forms: {}, kjReserve: 2, blanks: {} });
  await savePrintOptions(wb, { schemeEach: true, formSet: "sbd", forms: {}, kjReserve: 2, blanks: {} });
  assert.deepEqual(await loadPrintOptions(wb), { schemeEach: true, formSet: "sbd", forms: {}, kjReserve: 2, blanks: {} });
  assert.deepEqual(PrintOptions.parse({}), { schemeEach: false, formSet: "sbd", forms: {}, kjReserve: 2, blanks: {} });
});
