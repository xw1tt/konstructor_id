// План 17, задача 1: только нужные листы.
import { test } from "node:test";
import assert from "node:assert/strict";
import { neededTables, sheetPlan } from "@idk/shared/workbook/sheets";
import { BUILTIN_SBD, BUILTIN_TI, type UserTemplate } from "@idk/shared/forms/template";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { SHEETS } from "@idk/shared/workbook/schema";

const tpl = (docs: UserTemplate["docs"]): UserTemplate => ({ ...structuredClone(BUILTIN_SBD), id: "t", name: "Т", docs });
const empty = async () => readBook(new MemoryWorkbook({}));

test("нужные таблицы: СБД — с кабелями; без КЖ и протоколов — без кабельных таблиц", () => {
  const sbd = neededTables(BUILTIN_SBD);
  assert.ok(sbd.has("КабельныйЖурнал") && sbd.has("ВОР") && sbd.has("Электролаборатория"));
  const only = neededTables(tpl([{ kind: "builtin", doc: "aosr", form: null }, { kind: "builtin", doc: "rim", form: null }]));
  assert.ok(!only.has("КабельныйЖурнал") && !only.has("ВОР") && !only.has("ОсмотрБарабанов"));
  assert.ok(only.has("Спецификация") && only.has("ОЖР3"), "общие разделы ИД — всегда");
  const pkl = neededTables(tpl([{ kind: "builtin", doc: "pkl", form: null }]));
  assert.ok(pkl.has("ИспытанияКЛ") && pkl.has("Протоколы"));
  assert.ok(neededTables(BUILTIN_TI).has("ДокументыКачества"));
});

test("скрываются листы без нужных таблиц и без данных; «Реквизиты» и лист с данными — видны; выключено — всё видно", async () => {
  const t = tpl([{ kind: "builtin", doc: "aosr", form: null }]);
  const p = sheetPlan(t, await empty(), true);
  for (const s of ["ВОР", "Кабельный журнал", "Изоляция", "Протоколы и акты", "Замеры электрики", "Барабаны и трубы", "Замеры СКС и ВОЛС"])
    assert.ok(p.hidden.includes(s as any), s);
  for (const s of ["Реквизиты", "База актов", "Материалы", "Реестр ИД", "Спецификация"]) assert.ok(p.visible.includes(s as any), s);
  const withData = await readBook(new MemoryWorkbook({ "ВОР": [{ "Акт": "1", "Объём": 5 }] } as any));
  assert.ok(sheetPlan(t, withData, true).visible.includes("ВОР"), "лист с данными не скрывается");
  const off = sheetPlan(t, await empty(), false);
  assert.equal(off.hidden.length, 0);
  assert.equal(off.visible.length, SHEETS.length);
  assert.ok(sheetPlan(tpl([]), await empty(), true).visible.includes("Реквизиты"));
});
