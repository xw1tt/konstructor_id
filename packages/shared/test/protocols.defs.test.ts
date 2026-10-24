// План 13, задача 1: описания 16 документов и правила результата строк.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROTO_DEFS, PROTO_KINDS, protoByCode, isProtoKind } from "../src/protocols/defs.ts";
import { resultOf, computed, isNegative } from "../src/protocols/result.ts";
import { PRINT_KINDS } from "../src/acts/schemas.ts";
import { BUILTIN_DOC_LABELS } from "../src/forms/template.ts";

const CODES = ["ПКЛ", "ПАВ", "ПУЗО", "ПФН", "ПМС", "ПЗУ", "ПОКБ", "ППКБ", "АТП", "АИИ", "АТГ", "АПНР", "АОМА", "АРПС", "ПЗОВ", "ПТСКС"];
const OK = "соответствует", BAD = "не соответствует";

test("16 видов печати: коды справочника, подписи, входят в PRINT_KINDS", () => {
  assert.equal(PROTO_KINDS.length, 16);
  assert.deepEqual(PROTO_KINDS.map((k) => PROTO_DEFS[k].code), CODES);
  for (const k of PROTO_KINDS) {
    assert.ok((PRINT_KINDS as readonly string[]).includes(k), k);
    assert.equal(BUILTIN_DOC_LABELS[k], PROTO_DEFS[k].code);
    assert.equal(protoByCode(PROTO_DEFS[k].code)?.kind, k);
    assert.ok(isProtoKind(k));
    assert.ok(PROTO_DEFS[k].columns.length > 0, k);
  }
  assert.ok(!isProtoKind("aosr"));
  assert.equal(protoByCode("пав")?.kind, "pav", "код без учёта регистра");
});

test("области и подписи по спецификации §4, §6.2", () => {
  const kit = PROTO_KINDS.filter((k) => PROTO_DEFS[k].scope === "kit").map((k) => PROTO_DEFS[k].code);
  assert.deepEqual(kit, ["ПАВ", "ПУЗО", "ПФН", "ПМС", "ПЗУ", "АИИ", "АТГ", "АПНР", "АОМА", "АРПС"]);
  const lab = PROTO_KINDS.filter((k) => PROTO_DEFS[k].signer === "lab").map((k) => PROTO_DEFS[k].code);
  assert.deepEqual(lab, ["ПКЛ", "ПАВ", "ПУЗО", "ПФН", "ПМС", "ПЗУ", "ПЗОВ", "ПТСКС"]);
  assert.deepEqual(PROTO_DEFS.pokb.signer, ["builder_control", "performer"]);
  assert.deepEqual(PROTO_DEFS.atp.signer, ["developer_control", "builder", "performer"]);
  assert.deepEqual(PROTO_DEFS.aii.signer, ["developer_control", "builder", "performer", "designer"]);
});

test("ПАВ: факт ≤ верхней границы нормы; равенство — соответствует", () => {
  assert.equal(resultOf(PROTO_DEFS.pav, { tripNorm: "0,01–0,1", tripFact: 0.1 }), OK);
  assert.equal(resultOf(PROTO_DEFS.pav, { tripNorm: "0,01–0,1", tripFact: "0,11" }), BAD);
  assert.equal(resultOf(PROTO_DEFS.pav, { tripNorm: "≤5", tripFact: 4.2 }), OK);
  assert.equal(resultOf(PROTO_DEFS.pav, { tripNorm: "", tripFact: 0.05 }), null);
  assert.equal(resultOf(PROTO_DEFS.pav, { tripNorm: "0,1", tripFact: null }), null);
});

test("ПУЗО: 0,5·IΔн ≤ факт ≤ IΔн и время ≤ нормы (по умолчанию 300 мс)", () => {
  assert.equal(resultOf(PROTO_DEFS.puzo, { diffRated: 30, diffFact: 15 }), OK);
  assert.equal(resultOf(PROTO_DEFS.puzo, { diffRated: 30, diffFact: 30 }), OK);
  assert.equal(resultOf(PROTO_DEFS.puzo, { diffRated: 30, diffFact: 14 }), BAD);
  assert.equal(resultOf(PROTO_DEFS.puzo, { diffRated: 30, diffFact: 31 }), BAD);
  assert.equal(resultOf(PROTO_DEFS.puzo, { diffRated: 30, diffFact: 20, timeFact: 300 }), OK);
  assert.equal(resultOf(PROTO_DEFS.puzo, { diffRated: 30, diffFact: 20, timeFact: 301 }), BAD);
  assert.equal(resultOf(PROTO_DEFS.puzo, { diffRated: 30, diffFact: 20, timeFact: 40, timeNorm: 30 }), BAD);
  assert.equal(resultOf(PROTO_DEFS.puzo, { diffRated: null, diffFact: 20 }), null);
});

test("ПФН: Iкз = 230/Zп, Iсраб = Iн × 5/10/20; Iкз ≥ Iсраб", () => {
  const row = { zloop: "0,46", rated: 16, curve: "C" };
  assert.deepEqual(computed(PROTO_DEFS.pfn, row), { ikz: "500", itrip: "160" });
  assert.equal(resultOf(PROTO_DEFS.pfn, row), OK);
  assert.equal(resultOf(PROTO_DEFS.pfn, { zloop: 2, rated: 16, curve: "D" }), BAD);
  assert.equal(resultOf(PROTO_DEFS.pfn, { ikz: 320, itrip: 320 }), OK);
  assert.deepEqual(computed(PROTO_DEFS.pfn, { ikz: 300, itrip: 100, zloop: 1 }), { ikz: "300", itrip: "100" }, "внесённое не пересчитывается");
  assert.equal(resultOf(PROTO_DEFS.pfn, { zloop: 0.5, rated: 16, curve: "—" }), null, "без характеристики и тока срабатывания");
});

test("ПМС и ПЗУ: сопротивление ≤ допустимого; ПЗУ — с сезонным коэффициентом", () => {
  assert.equal(resultOf(PROTO_DEFS.pms, { resistance: "0,05" }), OK);
  assert.equal(resultOf(PROTO_DEFS.pms, { resistance: 0.06 }), BAD);
  assert.equal(resultOf(PROTO_DEFS.pms, { resistance: 0.3, allowed: 0.5 }), OK);
  assert.deepEqual(computed(PROTO_DEFS.pzu, { measured: 3, season: 1.2 }), { reduced: "3,6" });
  assert.equal(resultOf(PROTO_DEFS.pzu, { measured: 3, season: 1.2 }), OK);
  assert.equal(resultOf(PROTO_DEFS.pzu, { measured: 3, season: 1.2, allowed: 3.5 }), BAD);
  assert.equal(resultOf(PROTO_DEFS.pzu, { measured: 4 }), OK, "допустимое по умолчанию 4, коэффициент 1");
});

test("ПЗОВ: норма по длине волны; ПТСКС: разводка и запасы", () => {
  assert.deepEqual(computed(PROTO_DEFS.pzov, { wave: 1310 }), { norm: "0,36" });
  assert.deepEqual(computed(PROTO_DEFS.pzov, {}), { norm: "0,22" }, "длина волны по умолчанию 1550");
  assert.equal(resultOf(PROTO_DEFS.pzov, { wave: 1310, att: 0.36 }), OK);
  assert.equal(resultOf(PROTO_DEFS.pzov, { att: 0.25 }), BAD);
  assert.equal(resultOf(PROTO_DEFS.pzov, { wave: 850, att: 2 }), null, "нормы для 850 нм нет");
  assert.equal(resultOf(PROTO_DEFS.ptsks, { wiremap: "PASS", next: 3.1, il: 0 }), OK);
  assert.equal(resultOf(PROTO_DEFS.ptsks, { wiremap: "fail" }), BAD);
  assert.equal(resultOf(PROTO_DEFS.ptsks, { wiremap: "PASS", rl: -0.2 }), BAD);
  assert.equal(resultOf(PROTO_DEFS.ptsks, { wiremap: "" }), null);
});

test("без правила результат не вычисляется; признак «не соответствует»", () => {
  assert.equal(resultOf(PROTO_DEFS.pkl, { voltage: 6 }), null);
  assert.equal(resultOf(PROTO_DEFS.aii, { name: "Щит" }), null);
  for (const s of ["не соответствует", "Не годен к прокладке", "не выдержала", "FAIL", "непригоден"]) assert.ok(isNegative(s), s);
  for (const s of ["соответствует", "годен к прокладке", "выдержала", "PASS", ""]) assert.ok(!isNegative(s), s);
});
