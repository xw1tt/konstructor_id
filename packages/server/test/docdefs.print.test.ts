// План 15, задача 4: печать по описаниям — имена файлов и формы как до рефакторинга.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildCableBundle } from "@idk/shared/workbook/cables";
import { PrintOptions } from "@idk/shared/templates";
import { ACT_DOC_KINDS } from "@idk/shared/docs/defs";
import { renderActDoc, actDocFormFor } from "@idk/server/print/docs";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { aov1Bundle } from "./helpers/aov1.ts";

const SBD = PrintOptions.parse({});
const TI = PrintOptions.parse({ formSet: "ti" });

test("имена файлов 8 документов в обоих наборах", async () => {
  const b = await aov1Bundle();
  const cb = async (kind: "kj" | "ip", set: "sbd" | "ti") =>
    buildCableBundle(await readBook(new MemoryWorkbook(aov1Records() as any)), AOV1, defaultImportant(), kind, { set }).bundle!;
  const exp = {
    sbd: { aosr: `${AOV1}.АОСР`, rim: `${AOV1}.РИМ`, vd: `${AOV1}.ВД`, vor: `${AOV1}.ВОР`, kj: null, ip: `${AOV1}.Протокол`, rp: `${AOV1}.РП` },
    ti: { aosr: AOV1, rim: `${AOV1}.РМ`, vd: `${AOV1}.ВД`, vor: `${AOV1}.ВОР`, kj: `${AOV1}.КЖ`, ip: `${AOV1}.П`, rp: `${AOV1}.РП` },
  } as const;
  for (const [set, o] of [["sbd", SBD], ["ti", TI]] as const) {
    for (const k of ACT_DOC_KINDS) {
      const bundle = k === "kj" || k === "ip" ? await cb(k, set) : b;
      const r = renderActDoc(bundle, k, o);
      assert.ok(r.html.length > 500, `${set} ${k}`);
      if (k === "avk") assert.match(r.name, /^АВК .+\.pdf$/);
      else if (k === "kj" && set === "sbd") assert.equal(r.name, `${bundle.cables?.doc?.journalCode || `${AOV1}.КЖ`}.pdf`);
      else assert.equal(r.name, `${exp[set][k as keyof typeof exp.sbd]}.pdf`, `${set} ${k}`);
      assert.equal(r.pageNumbers, k === "vor");
    }
  }
});

test("выбор формы: по набору, своя у документа, нет формы набора — первая", async () => {
  assert.equal(actDocFormFor("vd", TI), "ti");
  assert.equal(actDocFormFor("vd", PrintOptions.parse({ formSet: "ti", forms: { vd: "sbd" } })), "sbd");
  assert.equal(actDocFormFor("vor", TI), "sbd");
  assert.equal(actDocFormFor("avk", TI), "sbd");
  assert.equal(actDocFormFor("rp", SBD), "ti");
  assert.equal(actDocFormFor("kj", PrintOptions.parse({ forms: { kj: "ti" } })), "ti");
  const b = await aov1Bundle();
  assert.match(renderActDoc(b, "vd", TI).html, /СМОНТИРОВАННОГО ЭЛЕКТРООБОРУДОВАНИЯ/);
  assert.match(renderActDoc(b, "vd", SBD).html, /Ведомость смонтированного оборудования/);
});
