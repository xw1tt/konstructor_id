// 0.38: сводка по объекту для главного экрана окна программы.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { objectSummary } from "@idk/shared/acts/objectSummary";
import { addNextAct } from "@idk/shared/acts/nextAct";
import { aov1Records } from "./fixtures/aov1Book.ts";

test("сводка: акты по готовности, шифры, документы качества, требует внимания — сначала критичное", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const next = await addNextAct(wb, 0);
  await wb.write("Акты", next.row, { "Работы (п.1)": "" });
  const s = objectSummary(await readBook(wb), defaultImportant(), "2026-11-19");
  assert.ok(s.name.length > 0);
  assert.ok(s.codes.length > 0);
  assert.equal(s.acts.total, 2);
  assert.equal(s.acts.ready + s.acts.warn + s.acts.blocked, 2);
  assert.ok(s.acts.blocked >= 1);
  assert.equal(s.attention[0].level, "critical");
  assert.equal(s.attention[0].act, next.number);
  assert.ok(s.attentionTotal >= s.attention.length);
  assert.ok(s.quality.total >= s.quality.noScan);
});

test("пустая книга — нули, без ошибок", async () => {
  const s = objectSummary({ tables: {}, object: {}, missing: [] }, defaultImportant(), "2026-11-19");
  assert.deepEqual(s.acts, { total: 0, ready: 0, warn: 0, blocked: 0 });
  assert.deepEqual(s.attention, []);
  assert.equal(s.ojrDays, 0);
});
