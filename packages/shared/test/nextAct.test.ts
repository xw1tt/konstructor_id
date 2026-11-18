// 0.32: «Следующий акт» — копия последнего акта того же вида работ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { addNextAct, nextNumber } from "@idk/shared/acts/nextAct";
import { excelSerialToIso } from "@idk/shared/workbook/values";
import { aov1Records } from "./fixtures/aov1Book.ts";

test("номер +1 по последней группе цифр, нули сохраняются, занятые пропускаются", () => {
  assert.equal(nextNumber("К32.В.СТ.АОВ1.01.00.1"), "К32.В.СТ.АОВ1.01.00.2");
  assert.equal(nextNumber("АОСР-007"), "АОСР-008");
  assert.equal(nextNumber("АОСР-9"), "АОСР-10");
  assert.equal(nextNumber("12/3 рев"), "12/4 рев");
  assert.equal(nextNumber("Акт"), "Акт-2");
  assert.equal(nextNumber("А-1", new Set(["а-2", "а-3"])), "А-4");
});

const rec = (t: { headers: string[]; rows: unknown[][] }, i: number) => Object.fromEntries(t.headers.map((h, j) => [h, t.rows[i][j]]));

test("следующий акт: даты продолжаются, реквизиты копируются, АВК — нет; схемы и материалы акта переносятся", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  await wb.write("Акты", 0, { "АВК: номер": "АВК-1", "Вид работ": "Кабельные линии", Подписанты: "Иванов И.И." });
  const before = rec((await wb.read("Акты"))!, 0);
  const nSchemes = (await wb.read("Схемы"))?.rows.length ?? 0;
  const nMat = (await wb.read("МатериалыАктов"))?.rows.length ?? 0;
  const r = await addNextAct(wb, 0);
  assert.equal(r.number, "К32.В.СТ.АОВ1.01.00.2");
  assert.equal(r.row, 1);
  const a = rec((await wb.read("Акты"))!, 1);
  assert.equal(a["Номер акта"], r.number);
  for (const h of ["Шифр", "Нормативы (п.6)", "Работы (п.1)", "Вид работ", "Подписанты", "ВОР: от монтажников"]) assert.equal(a[h], before[h], h);
  assert.equal(a["АВК: номер"], null);
  // Начало — следующий рабочий день после окончания образца.
  const end = excelSerialToIso(before["Окончание работ"] as number);
  const start = excelSerialToIso(a["Начало работ"] as number);
  assert.ok(start > end);
  assert.notEqual(new Date(`${start}T00:00:00Z`).getUTCDay(), 0, "не воскресенье");
  assert.equal(
    (a["Окончание работ"] as number) - (a["Начало работ"] as number) >= (before["Окончание работ"] as number) - (before["Начало работ"] as number),
    true,
    "та же длительность",
  );
  assert.equal(a["Дата акта"], a["Окончание работ"]);
  const sch = (await wb.read("Схемы"))!;
  assert.equal(sch.rows.length - nSchemes, r.schemes);
  const mat = (await wb.read("МатериалыАктов"))!;
  assert.equal(mat.rows.length - nMat, r.materials);
  assert.ok(r.schemes > 0 && r.materials > 0, `схем ${r.schemes}, материалов ${r.materials}`);
  if (r.schemes) {
    const s = rec(sch, sch.rows.length - 1);
    assert.equal(s["Акт"], r.number);
    assert.equal(s["Дата"], a["Дата акта"]);
  }
  if (r.materials) {
    const m = rec(mat, mat.rows.length - 1);
    assert.equal(m["Акт"], r.number);
    assert.equal(m["Кол-во"], null);
  }
  // Ещё раз от первого: образец — последний акт того же вида, номер — следующий за ним.
  const r2 = await addNextAct(wb, 0);
  assert.equal(r2.number, "К32.В.СТ.АОВ1.01.00.3");
  assert.equal(r2.row, 2);
});
