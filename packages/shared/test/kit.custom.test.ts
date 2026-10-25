// План 11: документы шаблона пользователя в реестре ИД и задании комплекта.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { registryRows } from "@idk/shared/kit/registry";
import { buildKitRequest } from "@idk/shared/kit/request";
import { REGISTRY_KINDS, SCHEMA_VERSION } from "@idk/shared/workbook/schema";
import { BUILTIN_SBD, type UserTemplate } from "@idk/shared/forms/template";
import { kitRecords } from "./fixtures/kitBook.ts";
import { AOV1 } from "./fixtures/aov1Book.ts";
import type { Catalog } from "@idk/shared/catalog/model";
import { PrintOptions } from "@idk/shared/templates";

const form = { file: "00000000-0000-0000-0000-000000000000.docx", type: "docx" as const, original: "agi.docx" };
const tpl: UserTemplate = {
  id: "t-1", name: "ПИК", print: PrintOptions.parse({ schemeEach: false }),
  docs: [
    ...BUILTIN_SBD.docs.filter((d) => d.kind === "builtin" && d.doc !== "vor"),
    { kind: "custom", code: "АГИ", name: "Акт гидравлических испытаний", form },
  ],
};

test("вид реестра «Свой документ», схема v7", () => {
  assert.ok(REGISTRY_KINDS.includes("Свой документ" as never));
  assert.ok(SCHEMA_VERSION >= 7);
});

test("реестр по шаблону: без ВОР, со своим документом после АОСР/РИМ/ВД", async () => {
  const book = await readBook(new MemoryWorkbook(kitRecords()));
  const sbd = registryRows(book, "1").rows.map((r) => r.values["Вид"]);
  const own = registryRows(book, "1", tpl).rows;
  const kinds = own.map((r) => r.values["Вид"]);
  assert.ok(sbd.includes("ВОР") && !kinds.includes("ВОР"));
  const i = kinds.indexOf("Свой документ");
  assert.equal(kinds[i - 1], "ВД");
  const act = String(own[i].values["Акт"]);
  assert.equal(own[i].values["Номер документа"], `№${act}.АГИ`);
  assert.equal(own[i].values["Наименование"], "Акт гидравлических испытаний");
  assert.deepEqual(registryRows(book, "1", BUILTIN_SBD).rows.map((r) => r.values["Вид"]), sbd, "«СБД» — как раньше");
});

test("задание комплекта: свой документ печатается по форме шаблона", async () => {
  const r = kitRecords();
  const book0 = await readBook(new MemoryWorkbook(r));
  r["РеестрИД"] = registryRows(book0, "1", tpl).rows.map((x) => x.values).filter((v) => !["Схема", "Поверка", "Лаборатория", "Документ качества"].includes(String(v["Вид"])));
  const { request, issues } = buildKitRequest(await readBook(new MemoryWorkbook(r)), "1", defaultImportant(), tpl.id, undefined, new Date("2026-10-24"), tpl);
  assert.deepEqual(issues, []);
  const row = request!.rows.find((x) => x.kind === "Свой документ")!;
  assert.deepEqual(row.doc, { act: row.doc!.act, kind: null, form: { template: "t-1", doc: "АГИ" } });
  const aosr = request!.rows.find((x) => x.kind === "АОСР")!;
  assert.deepEqual(aosr.doc, { act: aosr.doc!.act, kind: "aosr" }, "встроенный без своей формы");
});

test("финальная проверка: свой документ без формы в реестр не попадает", async () => {
  const book = await readBook(new MemoryWorkbook(kitRecords()));
  const t2: UserTemplate = { ...tpl, docs: [...tpl.docs, { kind: "custom", code: "ЧЕР", name: "Черновик", form: null }] };
  const own = registryRows(book, "1", t2).rows.filter((r) => r.values["Вид"] === "Свой документ");
  assert.ok(own.every((r) => String(r.values["Номер документа"]).endsWith(".АГИ")));
});

// План 12, задача 5: сканы шаблона в реестре и задании комплекта.
const AOV2 = "К32.В.СТ.АОВ1.01.00.2";
const twoActs = () => kitRecords((r) => {
  r["Акты"] = [...r["Акты"], { ...r["Акты"][0], "Номер акта": AOV2 }];
  r["АктыКомплектов"] = [...r["АктыКомплектов"], { "Комплект": "1", "Акт": AOV2 }];
});
const scanTpl: UserTemplate = {
  id: "t-2", name: "Сканы", print: PrintOptions.parse({ schemeEach: false }),
  docs: [
    { kind: "builtin", doc: "aosr", form: null, catalog: "АОСР", works: ["КЛ"] },
    { kind: "custom", code: "ПИК", name: "Протокол испытания кабеля", form: null, catalog: "ПИК", works: ["КЛ"], scope: "act", scan: true },
    { kind: "custom", code: "СЭЛ", name: "Свидетельство электролаборатории", form: null, catalog: "СЭЛ", works: ["КЛ"], scope: "kit", scan: true },
  ],
};
const scanCat: Catalog = {
  version: "t",
  docs: [
    { code: "АОСР", name: "АОСР", clause344: 3, source: "", make: "builtin", builtin: "aosr", scope: "act" },
    { code: "ПИК", name: "Протокол испытания кабеля", clause344: 11, source: "", make: "scan", scope: "act" },
    { code: "СЭЛ", name: "Свидетельство электролаборатории", clause344: 11, source: "", make: "scan", scope: "kit" },
  ],
  sections: [{ code: "ЭМ", name: "Электромонтаж", works: [{ code: "КЛ", name: "Прокладка кабельных линий", docs: ["АОСР", "ПИК", "СЭЛ"] }] }],
};
const own = (rows: { values: Record<string, unknown> }[]) =>
  rows.filter((r) => r.values["Вид"] === "Свой документ").map((r) => [r.values["Акт"], r.values["Номер документа"]]);

test("реестр: скан «на акт» — строка на каждый акт, скан «на комплект» — одна строка в конце без акта", async () => {
  const book = await readBook(new MemoryWorkbook(twoActs()));
  const expected = [[AOV1, `№${AOV1}.ПИК`], [AOV2, `№${AOV2}.ПИК`], [null, "СЭЛ"]];
  const withCat = registryRows(book, "1", scanTpl, scanCat).rows;
  assert.deepEqual(own(withCat), expected);
  assert.equal(withCat.at(-1)!.values["Номер документа"], "СЭЛ");
  assert.deepEqual(own(registryRows(book, "1", scanTpl).rows), expected, "без справочника — все документы шаблона");
});

test("реестр со справочником: «Вид работ» другого раздела и «Без документов» убирают сканы", async () => {
  const r = twoActs();
  r["Акты"][0]["Без документов"] = "ПИК";
  r["Акты"][1]["Вид работ"] = "Сварка";
  const rows = registryRows(await readBook(new MemoryWorkbook(r)), "1", scanTpl, scanCat).rows;
  // первый акт без вида работ, но ПИК исключён; второй — неизвестный вид работ: документы с привязкой не нужны
  assert.deepEqual(own(rows), [[null, "СЭЛ"]]);
  assert.ok(!rows.some((x) => x.values["Вид"] === "АОСР" && x.values["Акт"] === AOV2));
});

test("задание комплекта: скан без файла — ошибка «Нет скана…», с файлом — строка с file и без doc", async () => {
  const r = twoActs();
  const book0 = await readBook(new MemoryWorkbook(r));
  const reg = () => registryRows(book0, "1", scanTpl, scanCat).rows.map((x) => ({ ...x.values }))
    .filter((v) => !["Схема", "Поверка", "Лаборатория", "Документ качества"].includes(String(v["Вид"])));
  r["РеестрИД"] = reg();
  const bad = buildKitRequest(await readBook(new MemoryWorkbook(r)), "1", defaultImportant(), scanTpl.id, undefined, new Date("2026-10-24"), scanTpl);
  assert.equal(bad.request, null);
  const msgs = bad.issues.filter((i) => i.message === "Нет скана: укажите файл в столбце «Скан»");
  assert.equal(msgs.length, 3);
  assert.ok(!bad.issues.some((i) => /нет формы/.test(i.message)), "скану форма не нужна");

  r["РеестрИД"] = reg().map((v) => (v["Вид"] === "Свой документ" ? { ...v, "Скан": `${v["Номер документа"]}.pdf` } : v));
  const { request, issues } = buildKitRequest(await readBook(new MemoryWorkbook(r)), "1", defaultImportant(), scanTpl.id, undefined, new Date("2026-10-24"), scanTpl);
  assert.deepEqual(issues, []);
  const scans = request!.rows.filter((x) => x.kind === "Свой документ");
  assert.equal(scans.length, 3);
  for (const s of scans) { assert.equal(s.doc, null); assert.equal(s.file!.name, `${s.number}.pdf`); }
});
