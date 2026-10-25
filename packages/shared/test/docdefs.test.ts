// План 15, задача 3: описания документов акта дают прежние номера, наименования, виды реестра и подписи.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACT_DOC_DEFS, ACT_DOC_KINDS, actDocForm } from "@idk/shared/docs/defs";
import { docNumberFor } from "@idk/shared/acts/format";
import { PRINTED_KINDS } from "@idk/shared/kit/request";
import { BUILTIN_DOC_LABELS } from "@idk/shared/forms/template";
import { PRINT_KINDS, PROTO_KINDS } from "@idk/shared/acts/schemas";
import { TABLES, REGISTRY_KINDS } from "@idk/shared/workbook/schema";

test("номера по наборам — как в плане 14", () => {
  const exp = {
    sbd: { aosr: "A.АОСР", rim: "A.РИМ", vd: "A.ВД", rp: "A.РП", kj: "A.КЖ", ip: "A.Протокол" },
    ti: { aosr: "A", rim: "A.РМ", vd: "A.ВД", rp: "A.РП", kj: "A.КЖ", ip: "A.П" },
  } as const;
  for (const set of ["sbd", "ti"] as const)
    for (const [k, v] of Object.entries(exp[set])) assert.equal(docNumberFor(" A ", k as any, set), v, `${set} ${k}`);
});

test("наименования реестра и виды реестра — прежние", () => {
  const c = { aosrNo: "№A", date: "01.01.2026 г.", works: "Монтаж" };
  const n = (k: keyof typeof ACT_DOC_DEFS, s: "sbd" | "ti") => ACT_DOC_DEFS[k].name(s, c);
  assert.equal(n("aosr", "sbd"), "Акт освидетельствования скрытых работ Монтаж");
  assert.equal(n("aosr", "ti"), "Акт освидетельствования скрытых работ");
  assert.equal(n("rim", "sbd"), "Реестр использованных материалов");
  assert.equal(n("rim", "ti"), "Реестр используемых материалов и документов, подтверждающих их качество, к АОСР №A от 01.01.2026 г.");
  assert.equal(n("rp", "sbd"), "Реестр приложений к АОСР №A от 01.01.2026 г.");
  assert.equal(n("vd", "ti"), "Ведомость смонтированного электрооборудования и материалов");
  assert.equal(n("ip", "ti"), "Протокол сопротивления изоляции");
  assert.deepEqual(PRINTED_KINDS, { "ВОР": "vor", "АОСР": "aosr", "РИМ": "rim", "РП": "rp", "ВД": "vd", "КЖ": "kj", "Протокол": "ip", "АВК": "avk" });
  for (const k of ACT_DOC_KINDS) assert.ok((REGISTRY_KINDS as readonly string[]).includes(ACT_DOC_DEFS[k].registry), k);
});

test("подписи шаблона, виды печати, таблицы, формы", () => {
  assert.deepEqual(Object.fromEntries(ACT_DOC_KINDS.map((k) => [k, BUILTIN_DOC_LABELS[k]])),
    { aosr: "АОСР", rim: "РИМ", vd: "ВД", vor: "ВОР", avk: "АВК", kj: "КЖ", ip: "Протокол", rp: "РП" });
  assert.deepEqual([...PRINT_KINDS].filter((k) => !(PROTO_KINDS as readonly string[]).includes(k)).sort(), [...ACT_DOC_KINDS].sort());
  for (const k of ACT_DOC_KINDS) for (const t of ACT_DOC_DEFS[k].tables) assert.ok(t in TABLES, `${k}: ${t}`);
  assert.equal(actDocForm("aosr", "ti"), "sbd");
  assert.equal(actDocForm("rp", "sbd"), "ti");
  assert.equal(actDocForm("vd", "ti"), "ti");
});
