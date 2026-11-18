// 0.32: служебные листы собираются сами — реестр комплекта и ОЖР сверяются с актами и перестраиваются, только если
// документы изменились; ручные «Листов», «Экз.», сканы и условия производства работ сохраняются.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { syncRegistry } from "@idk/shared/kit/registry";
import { syncOjr } from "@idk/shared/ojr";
import { parseDateCell } from "@idk/shared/workbook/values";
import { kitRecords } from "./fixtures/kitBook.ts";
import { aov1Records } from "./fixtures/aov1Book.ts";

const iso = (v: unknown) => {
  const p = parseDateCell(v as any);
  return p.ok ? p.value : null;
};

test("реестр: пустой — заполняется; совпадает — не трогается; новый документ — перестраивается с ручными «Листов» и «Экз.»", async () => {
  const wb = new MemoryWorkbook(kitRecords());
  let r = await syncRegistry(wb, await readBook(wb), "1");
  assert.equal(r.changed, true);
  assert.ok(r.count > 10);
  assert.equal(r.added, r.count);
  r = await syncRegistry(wb, await readBook(wb), "1");
  assert.equal(r.changed, false, "реестр уже совпадает с актами");
  // Ручные правки: листы и экземпляры у первой строки.
  const t0 = (await wb.read("РеестрИД"))!;
  const name0 = t0.rows[0][t0.headers.indexOf("Наименование")];
  await wb.write("РеестрИД", 0, { Листов: 7, "Экз.": 3 });
  // Новый документ в акте: исполнительная схема.
  const schemes = (await wb.read("Схемы"))!;
  const row = Object.fromEntries(schemes.headers.map((h, i) => [h, schemes.rows[0][i]]));
  await wb.insert("Схемы", schemes.rows.length, [{ ...row, Номер: "ИС-99", Наименование: "Новая схема" }]);
  r = await syncRegistry(wb, await readBook(wb), "1");
  assert.equal(r.changed, true);
  assert.equal(r.added, 1);
  assert.equal(r.removed, 0);
  const t = (await wb.read("РеестрИД"))!;
  const i = t.rows.findIndex((x) => x[t.headers.indexOf("Наименование")] === name0);
  assert.equal(t.rows[i][t.headers.indexOf("Листов")], 7, "ручные листы — на тот же документ");
  assert.equal(t.rows[i][t.headers.indexOf("Экз.")], 3);
  assert.ok(t.rows.some((x) => String(x[t.headers.indexOf("Номер документа")]).includes("ИС-99")));
});

test("ОЖР: пустой — заполняется; совпадает — не трогается; изменились даты акта — перестраивается, условия по датам сохраняются", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  let r = await syncOjr(wb, await readBook(wb));
  assert.equal(r.changed, true);
  r = await syncOjr(wb, await readBook(wb));
  assert.equal(r.changed, false);
  const t3 = (await wb.read("ОЖР3"))!;
  const di = t3.headers.indexOf("Дата"),
    ci = t3.headers.indexOf("Условия производства работ");
  const day = iso(t3.rows[0][di]);
  await wb.write("ОЖР3", 0, { "Условия производства работ": "-2 °С, снег" });
  r = await syncOjr(wb, await readBook(wb));
  assert.equal(r.changed, false, "правка условий — не повод перестраивать");
  // Окончание акта сдвинуто на неделю: появился новый день работ.
  const acts = (await wb.read("Акты"))!;
  const ei = acts.headers.indexOf("Окончание работ");
  await wb.write("Акты", 0, { "Окончание работ": Number(acts.rows[0][ei]) + 7 }); // неделя — точно с рабочими днями
  r = await syncOjr(wb, await readBook(wb));
  assert.equal(r.changed, true);
  const after = (await wb.read("ОЖР3"))!;
  const kept = after.rows.find((x) => iso(x[di]) === day);
  assert.equal(kept?.[ci], "-2 °С, снег");
});
