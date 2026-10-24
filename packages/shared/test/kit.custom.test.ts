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

const form = { file: "00000000-0000-0000-0000-000000000000.docx", type: "docx" as const, original: "agi.docx" };
const tpl: UserTemplate = {
  id: "t-1", name: "ПИК",
  docs: [
    ...BUILTIN_SBD.docs.filter((d) => d.kind === "builtin" && d.doc !== "vor"),
    { kind: "custom", code: "АГИ", name: "Акт гидравлических испытаний", form },
  ],
};

test("вид реестра «Свой документ», схема v7", () => {
  assert.ok(REGISTRY_KINDS.includes("Свой документ" as never));
  assert.equal(SCHEMA_VERSION, 7);
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
