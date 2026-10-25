// План 13, задача 4: 16 документов во встроенной печати — справочник, шаблоны плана 12, полнота.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_CATALOG } from "@idk/shared/catalog/builtin";
import { checkCatalog } from "@idk/shared/catalog/model";
import { addWork } from "@idk/shared/catalog/template";
import { completeness, kitShortage, actDocs, kitDocs } from "@idk/shared/catalog/need";
import { UserTemplate, upgradeTemplate, docLabel } from "@idk/shared/forms/template";
import { PROTO_DEFS, PROTO_KINDS } from "@idk/shared/protocols/defs";
import { readBook } from "@idk/shared/workbook/records";
import { protoBook, AOV1 } from "./fixtures/protoBook.ts";
import { PrintOptions } from "@idk/shared/templates";

const empty: UserTemplate = { id: "t", name: "Т", docs: [], print: PrintOptions.parse({ schemeEach: false }) };

test("справочник: 16 документов печатает конструктор, вид — из PROTO_DEFS", () => {
  assert.deepEqual(checkCatalog(BUILTIN_CATALOG), []);
  for (const k of PROTO_KINDS) {
    const d = BUILTIN_CATALOG.docs.find((x) => x.code === PROTO_DEFS[k].code)!;
    assert.equal(d.make, "builtin", d.code);
    assert.equal(d.builtin, k, d.code);
    assert.equal(d.scope, PROTO_DEFS[k].scope, d.code);
  }
  assert.ok(!BUILTIN_CATALOG.docs.some((d) => d.make !== "builtin"), "своих форм и сканов во встроенном справочнике не осталось");
});

test("«Из справочника» «ЭМ.ОСВ»: ПАВ, ПУЗО, ПФН — встроенные; ПАВ — на комплект", async () => {
  const t = addWork(empty, BUILTIN_CATALOG, "ЭМ.ОСВ");
  const pav = t.docs.find((d) => d.kind === "builtin" && d.doc === "pav");
  assert.ok(pav && pav.catalog === "ПАВ" && pav.works?.includes("ЭМ.ОСВ"));
  const book = await readBook(protoBook((r) => { r["Акты"][0]["Вид работ"] = "ЭМ.ОСВ"; }));
  assert.ok(!actDocs(t, BUILTIN_CATALOG, book, AOV1).docs.map(docLabel).includes("ПАВ"), "документ на комплект — не в акте");
  assert.deepEqual(kitDocs(t, BUILTIN_CATALOG, book, [AOV1]).map(docLabel), ["ПАВ", "ПУЗО", "ПФН"]);
});

test("шаблон плана 12: свой «ПАВ» (скан) и «ПОКБ» с формой → встроенные, форма и виды работ сохранены", () => {
  const old = UserTemplate.parse({
    id: "x", name: "Старый", docs: [
      { kind: "builtin", doc: "aosr", form: null },
      { kind: "custom", code: "ПАВ", name: "Протокол проверки действия автоматических выключателей", form: null, catalog: "ПАВ", works: ["ЭМ.ОСВ"], scope: "kit", scan: true },
      { kind: "custom", code: "ПОКБ", name: "Протокол осмотра кабелей на барабанах", form: { file: "f1.docx", type: "docx", original: "ПОКБ.docx" }, catalog: "ПОКБ", works: ["ЭМ.КЛ"], scope: "act" },
      { kind: "custom", code: "АГИ", name: "Акт гидроиспытаний", form: { file: "f2.docx", type: "docx", original: "" } },
    ],
  });
  const t = upgradeTemplate(old);
  assert.deepEqual(t.docs, [
    { kind: "builtin", doc: "aosr", form: null },
    { kind: "builtin", doc: "pav", form: null, catalog: "ПАВ", works: ["ЭМ.ОСВ"] },
    { kind: "builtin", doc: "pokb", form: { file: "f1.docx", type: "docx", original: "ПОКБ.docx" }, catalog: "ПОКБ", works: ["ЭМ.КЛ"] },
    old.docs[3],
  ]);
  assert.deepEqual(upgradeTemplate(t), t, "повторный перевод ничего не меняет");
  const dup = upgradeTemplate({ ...old, docs: [{ kind: "builtin", doc: "pav", form: null }, old.docs[1]] });
  assert.equal(dup.docs.length, 1, "встроенный уже есть — свой не дублируется");
});

test("полнота: документ без шапки в «Протоколах» — «нет данных», с шапкой — печатается", async () => {
  const t = addWork(addWork(empty, BUILTIN_CATALOG, "ЭМ.КЛ"), BUILTIN_CATALOG, "ЭМ.ОСВ");
  const book = await readBook(protoBook((r) => { r["Акты"][0]["Вид работ"] = "ЭМ.КЛ; ЭМ.ОСВ"; }));
  const st = (code: string) => completeness(t, BUILTIN_CATALOG, book, AOV1).find((s) => docLabel(s.doc) === code)?.status;
  assert.equal(st("ПКЛ"), "print", "шапка ПКЛ-1 есть");
  assert.equal(st("ПОКБ"), "noData");
  assert.equal(st("АОСР"), "print");
  const short = kitShortage(t, BUILTIN_CATALOG, book, "1");
  assert.deepEqual(short.filter((s) => s.act === null).map((s) => `${s.label}:${s.status}`), ["ПУЗО:noData", "ПФН:noData"], "ПАВ есть, ПУЗО и ПФН — нет, по одному разу");
  assert.ok(short.some((s) => s.act === AOV1 && s.label === "ПОКБ" && s.status === "noData"));
});
