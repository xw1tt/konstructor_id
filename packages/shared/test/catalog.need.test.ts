// План 12, задача 4: документы акта по «Виду работ», «Без документов», полнота акта и комплекта.
import { test } from "node:test";
import assert from "node:assert/strict";
import { actDocs, actWorks, completeness, kitDocs, kitShortage } from "@idk/shared/catalog/need";
import { UserTemplate, docLabel, type UserTemplate as UT } from "@idk/shared/forms/template";
import { SCHEMA_VERSION } from "@idk/shared/workbook/schema";
import type { Catalog } from "@idk/shared/catalog/model";
import type { Book, BookRow } from "@idk/shared/workbook/records";
import type { CellValue } from "@idk/shared/workbook/values";

const cat: Catalog = {
  version: "t",
  docs: [
    { code: "АОСР", name: "Акт освидетельствования скрытых работ", clause344: 3, source: "", make: "builtin", builtin: "aosr", scope: "act" },
    { code: "ПСИ", name: "Протокол", clause344: 11, source: "", make: "builtin", builtin: "ip", scope: "act" },
    { code: "ПИК", name: "Протокол испытания кабеля", clause344: 11, source: "", make: "scan", scope: "act" },
    { code: "АЛ", name: "Акт осмотра лотков", clause344: 10, source: "", make: "form", scope: "act" },
    { code: "СЭЛ", name: "Свидетельство электролаборатории", clause344: 11, source: "", make: "scan", scope: "kit" },
  ],
  sections: [{ code: "ЭМ", name: "Электромонтаж", works: [
    { code: "КЛ", name: "Прокладка кабельных линий", docs: ["АОСР", "ПСИ", "ПИК", "СЭЛ"] },
    { code: "ЛТ", name: "Монтаж кабельных лотков", docs: ["АОСР", "АЛ"] },
  ] }],
};

const tpl: UT = UserTemplate.parse({
  id: "t-00000000-0000-4000-8000-000000000000", name: "Т", print: {},
  docs: [
    { kind: "builtin", doc: "aosr", form: null, catalog: "АОСР", works: ["КЛ", "ЛТ"] },
    { kind: "builtin", doc: "ip", form: null, catalog: "ПСИ", works: ["КЛ"] },
    { kind: "custom", code: "ПИК", name: "Протокол испытания кабеля", form: null, catalog: "ПИК", works: ["КЛ"], scope: "act", scan: true },
    { kind: "custom", code: "АЛ", name: "Акт осмотра лотков", form: null, catalog: "АЛ", works: ["ЛТ"], scope: "act", scan: false },
    { kind: "custom", code: "СЭЛ", name: "Свидетельство электролаборатории", form: null, catalog: "СЭЛ", works: ["КЛ"], scope: "kit", scan: true },
  ],
});

const rows = (list: Record<string, CellValue>[]): BookRow[] => list.map((v, row) => ({ row, v, link: {} }));
const book = (acts: Record<string, CellValue>[], registry: Record<string, CellValue>[] = [], kitActs: string[] = []): Book => ({
  object: {}, missing: [],
  tables: {
    "Акты": rows(acts),
    "РеестрИД": rows(registry),
    "Комплекты": rows([{ number: "1" }]),
    "АктыКомплектов": rows(kitActs.map((act) => ({ kit: "1", act }))),
  },
});
const labels = (docs: UT["docs"]) => docs.map(docLabel);

test("схема книги — версия 15 (лист «Схемы трасс»)", () => assert.equal(SCHEMA_VERSION, 15));

test("акт с двумя видами работ получает документы обоих без дублей; документ «на комплект» — не в акте", () => {
  const b = book([{ baseNumber: "1", workKinds: "Прокладка кабельных линий; Монтаж кабельных лотков" }]);
  assert.deepEqual(actWorks(cat, b, "1"), { works: ["КЛ", "ЛТ"], unknown: [] });
  assert.deepEqual(labels(actDocs(tpl, cat, b, "1").docs), ["АОСР", "Протокол", "Протокол испытания кабеля", "Акт осмотра лотков"]);
});

test("вид работ можно указать кодом; акт только с лотками не получает документы кабеля", () => {
  const b = book([{ baseNumber: "1", workKinds: "лт" }]);
  assert.deepEqual(labels(actDocs(tpl, cat, b, "1").docs), ["АОСР", "Акт осмотра лотков"]);
});

test("акт без вида работ — все документы «на акт»", () => {
  const b = book([{ baseNumber: "1" }]);
  assert.deepEqual(labels(actDocs(tpl, cat, b, "1").docs), ["АОСР", "Протокол", "Протокол испытания кабеля", "Акт осмотра лотков"]);
});

test("«Без документов» = ПИК убирает документ", () => {
  const b = book([{ baseNumber: "1", workKinds: "КЛ", skipDocs: "пик" }]);
  assert.deepEqual(labels(actDocs(tpl, cat, b, "1").docs), ["АОСР", "Протокол"]);
});

test("неизвестный вид работ — в unknown, остаются только непривязанные документы", () => {
  const t = UserTemplate.parse({ ...tpl, docs: [...tpl.docs, { kind: "custom", code: "ФОТ", name: "Фотофиксация", form: null }] });
  const b = book([{ baseNumber: "1", workKinds: "Сварка" }]);
  const r = actDocs(t, cat, b, "1");
  assert.deepEqual(r.unknown, ["Сварка"]);
  assert.deepEqual(labels(r.docs), ["Фотофиксация"]);
});

test("полнота акта: печать, скан есть / нет, своя форма без файла", () => {
  const acts = [{ baseNumber: "1", workKinds: "КЛ; ЛТ" }];
  const without = completeness(tpl, cat, book(acts), "1");
  assert.deepEqual(without.map((s) => [s.label, s.status, s.number]), [
    ["АОСР", "print", ""], ["Протокол", "print", ""], ["Протокол испытания кабеля", "noScan", "1.ПИК"], ["Акт осмотра лотков", "noForm", "1.АЛ"],
  ]);
  const withScan = completeness(tpl, cat, book(acts, [{ kit: "1", number: "№1.ПИК", file: "пик.pdf" }]), "1");
  assert.equal(withScan[2].status, "scan");
  const emptyScan = completeness(tpl, cat, book(acts, [{ kit: "1", number: "1.ПИК", file: "" }]), "1");
  assert.equal(emptyScan[2].status, "noScan");
});

test("комплект: скан «на комплект» в нехватке один раз; найденный скан убирает его", () => {
  const acts = [{ baseNumber: "1", workKinds: "КЛ" }, { baseNumber: "2", workKinds: "КЛ" }];
  const b = book(acts, [], ["1", "2"]);
  assert.deepEqual(kitDocs(tpl, cat, b, ["1", "2"]).map(docLabel), ["Свидетельство электролаборатории"]);
  const short = kitShortage(tpl, cat, b, "1");
  assert.deepEqual(short, [
    { act: "1", label: "Протокол испытания кабеля", status: "noScan" },
    { act: "2", label: "Протокол испытания кабеля", status: "noScan" },
    { act: null, label: "Свидетельство электролаборатории", status: "noScan" },
  ]);
  const b2 = book(acts, [{ kit: "1", number: "СЭЛ", file: "сэл.pdf" }], ["1", "2"]);
  assert.equal(kitShortage(tpl, cat, b2, "1").filter((s) => s.act === null).length, 0);
});
