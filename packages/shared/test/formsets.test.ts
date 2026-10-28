// План 14, задача 1: наборы форм — опции печати, нумерация, встроенный шаблон «ТИ».
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrintOptions } from "@idk/shared/templates";
import { docNumberFor, formOf } from "@idk/shared/acts/format";
import { BUILTIN_TI, BUILTIN_SBD, TI_ID, UserTemplate, BUILTIN_DOC_LABELS, isBuiltinTemplate } from "@idk/shared/forms/template";
import { PRINT_KINDS } from "@idk/shared/acts/schemas";

const B = "4/АТ-4182-03-РД3.9.15-СУДИО";

test("опции по умолчанию: набор СБД, без своих форм, запас 2 %; шаблон без новых полей парсится", () => {
  assert.deepEqual(PrintOptions.parse({}), { schemeEach: false, formSet: "sbd", forms: {}, kjReserve: 2, kjDecimals: null, blanks: {} });
  const old = UserTemplate.parse({ id: "t-1", name: "Старый", docs: [], print: { schemeEach: true } });
  assert.deepEqual(old.print, { schemeEach: true, formSet: "sbd", forms: {}, kjReserve: 2, kjDecimals: null, blanks: {} });
});

test("нумерация СБД и ТИ", () => {
  assert.equal(docNumberFor(B, "aosr", "sbd"), `${B}.АОСР`);
  assert.equal(docNumberFor(B, "rim", "sbd"), `${B}.РИМ`);
  assert.equal(docNumberFor(B, "vd", "sbd"), `${B}.ВД`);
  assert.equal(docNumberFor(B, "rp", "sbd"), `${B}.РП`);
  assert.equal(docNumberFor(B, "aosr", "ti"), B);
  assert.equal(docNumberFor(B, "rim", "ti"), `${B}.РМ`);
  assert.equal(docNumberFor(B, "rp", "ti"), `${B}.РП`);
  assert.equal(docNumberFor(B, "vd", "ti"), `${B}.ВД`);
  assert.equal(docNumberFor(B, "kj", "ti"), `${B}.КЖ`);
  assert.equal(docNumberFor(B, "ip", "ti"), `${B}.П`);
  assert.equal(docNumberFor(` ${B} `, "aosr", "ti"), B, "края обрезаны");
});

test("форма документа: своя для документа, иначе набор", () => {
  const o = PrintOptions.parse({ formSet: "ti", forms: { kj: "sbd" } });
  assert.equal(formOf(o, "vd"), "ti");
  assert.equal(formOf(o, "kj"), "sbd");
  assert.equal(formOf(PrintOptions.parse({}), "registry"), "sbd");
  assert.equal(formOf(undefined, "rim"), "sbd");
});

test("встроенный шаблон «ТИ»: АОСР, РИМ, РП, ВД, КЖ, протокол; набор ТИ", () => {
  assert.equal(BUILTIN_TI.id, TI_ID);
  assert.equal(BUILTIN_TI.name, "ТИ");
  assert.deepEqual(BUILTIN_TI.docs.map((d) => d.kind === "builtin" && d.doc), ["aosr", "rim", "rp", "vd", "kj", "ip"]);
  assert.equal(BUILTIN_TI.print.formSet, "ti");
  assert.ok(UserTemplate.safeParse(BUILTIN_TI).success);
  assert.ok((PRINT_KINDS as readonly string[]).includes("rp"));
  assert.equal(BUILTIN_DOC_LABELS.rp, "РП");
  assert.ok(isBuiltinTemplate("sbd") && isBuiltinTemplate("ti") && !isBuiltinTemplate("t-1"));
  assert.ok(!BUILTIN_SBD.docs.some((d) => d.kind === "builtin" && d.doc === "rp"), "СБД без РП");
});
