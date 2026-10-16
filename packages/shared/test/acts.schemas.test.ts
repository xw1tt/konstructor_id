import { test } from "node:test";
import assert from "node:assert/strict";
import { ActInput, ActMaterialInput } from "@idk/shared/acts/schemas";

test("ActInput: значения по умолчанию", () => {
  const a = ActInput.parse({ baseNumber: "К32.В.СТ.АОВ1.01.00.1", date: "2026-07-28" });
  assert.equal(a.extraInfo, "нет");
  assert.equal(a.copies, 4);
  assert.equal(a.attachments, "Согласно п.3, п.4.");
  assert.equal(a.sectionId, null);
  assert.equal(a.vorCustomerRepId, null);
});

test("ActInput: без baseNumber → ошибка «Укажите номер акта»", () => {
  const r = ActInput.safeParse({ date: "2026-07-28" });
  assert.equal(r.success, false);
  assert.match(JSON.stringify(r.error?.issues), /Укажите номер акта/);
});

test("ActMaterialInput: позиция по умолчанию «б/н», количество null", () => {
  const m = ActMaterialInput.parse({ materialId: 1 });
  assert.equal(m.position, "б/н");
  assert.equal(m.quantity, null);
});
