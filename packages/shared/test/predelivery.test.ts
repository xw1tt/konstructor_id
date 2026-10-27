// Проверка перед сдачей: только предупреждения, каждое — на ячейку книги.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { isoToExcelSerial as d } from "@idk/shared/workbook/values";
import { checkActs, warningsText, allActs } from "@idk/shared/check/predelivery";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

const run = async (edit: (r: any) => void = () => undefined) => {
  const r: any = aov1Records();
  edit(r);
  return checkActs(await readBook(new MemoryWorkbook(r)), [AOV1], "2026-10-27");
};
const msgs = (w: Awaited<ReturnType<typeof run>>, re: RegExp) => w.filter((x) => re.test(x.message));

test("книга АОВ1: два сертификата истекли до даты акта, у шайбы нет документов, сканов нет", async () => {
  const w = await run();
  assert.equal(msgs(w, /срок действия истёк/).length, 2);
  assert.deepEqual(msgs(w, /нет документов качества/).map((x) => x.message), [`акт ${AOV1}: у материала «Шайба с узкими полями М8» нет документов качества`]);
  assert.equal(w.filter((x) => !/нет скана|срок действия истёк|нет документов качества/.test(x.message)).length, 0);
  assert.ok(w.every((x) => x.act === AOV1));
});

test("документ качества: истёк к дате акта, дата позже акта, нет листов — один раз на документ", async () => {
  const w = await run((r) => {
    const doc = r["ДокументыКачества"][4];
    doc["Действует до"] = d("2026-07-01");
    doc["Листов"] = null;
    r["ДокументыКачества"][5]["Дата"] = d("2026-08-01");
  });
  const exp = msgs(w, /срок действия истёк 01\.07\.2026 — раньше даты акта/);
  assert.equal(exp.length, 1);
  assert.equal(exp[0].table, "ДокументыКачества");
  assert.equal(exp[0].column, "Действует до");
  assert.equal(msgs(w, /дата документа 01\.08\.2026 позже даты акта/).length, 1);
  assert.equal(msgs(w, /не указано число листов/).length, 1);
});

test("материал акта без документов и без количества", async () => {
  const w = await run((r) => {
    r["Материалы"].push({ "Наименование": "Новый лоток", "Ед. изм.": "м" });
    r["МатериалыАктов"].push({ "Акт": AOV1, "Материал": "Новый лоток" });
  });
  const no = msgs(w, /«Новый лоток» нет документов качества/);
  assert.equal(no.length, 1);
  assert.equal(no[0].table, "МатериалыАктов");
  assert.equal(msgs(w, /«Новый лоток» нет количества/).length, 1);
});

test("даты работ и подписанты", async () => {
  const w = await run((r) => {
    const a = r["Акты"][0];
    a["Начало работ"] = d("2026-06-10");
    a["Окончание работ"] = d("2026-08-01");
    for (const p of r["Представители"]) if (p["Роль"] === "Технадзор застройщика") p["Действует по"] = d("2026-07-01");
  });
  assert.equal(msgs(w, /окончание работ \(01\.08\.2026\) позже даты акта/).length, 1);
  const rep = msgs(w, /нет представителя «Технадзор застройщика»/);
  assert.equal(rep.length, 1);
  assert.equal(rep[0].table, "Представители");
  const w2 = await run((r) => { r["Акты"][0]["Начало работ"] = d("2026-06-10"); r["Акты"][0]["Окончание работ"] = d("2026-06-01"); });
  assert.equal(msgs(w2, /окончание работ \(01\.06\.2026\) раньше начала/).length, 1);
});

test("подписи: склонение и все акты", async () => {
  assert.equal(warningsText(1), "1 предупреждение");
  assert.equal(warningsText(3), "3 предупреждения");
  assert.equal(warningsText(12), "12 предупреждений");
  assert.deepEqual(allActs(await readBook(new MemoryWorkbook(aov1Records() as any))), [AOV1]);
});
