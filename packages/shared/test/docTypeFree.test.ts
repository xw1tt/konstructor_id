// 0.34.3: вид документа качества — из списка или свой; свой печатается как введён («Прочее» внутри).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { TABLES } from "@idk/shared/workbook/schema";
import { qualityDocLabel } from "@idk/shared/roles";
import { avkDocText } from "@idk/shared/acts/rows";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

const OWN = "Санитарно-эпидемиологическое заключение";

test("свой вид документа: без ошибки «не из списка», в пакете — «Прочее» с названием, в РИМ — название", async () => {
  const rec = aov1Records() as any;
  rec["ДокументыКачества"][0]["Тип"] = OWN;
  const wb = new MemoryWorkbook(rec);
  const { bundle, issues } = buildBundle(await readBook(wb), AOV1, defaultImportant());
  assert.deepEqual(issues, []);
  const d = bundle!.qualityDocs.find((q) => q.typeLabel === OWN)!;
  assert.ok(d, "документ в пакете");
  assert.equal(d.type, "other");
  assert.equal(qualityDocLabel(d), OWN);
  assert.equal(qualityDocLabel({ type: "passport" }), "Паспорт качества");
  assert.match(avkDocText(d), /^санитарно-эпидемиологическое заключение:/);
  assert.ok(TABLES["Материалы"].columns.find((c) => c.header === "Док.1: вид")!.freeText);
});
