import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { actSummary, docsOfMaterial, cableTotal } from "@idk/addin/panel/extras/summaries";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

const CABLE = "Кабель для промышленного интерфейса RS-485, групповой прокладки, с пониженным дымо- и газовыделением";

test("сводка акта и документы материала", async () => {
  const b = await readBook(aov1Book());
  assert.deepEqual(actSummary(b, AOV1), { schemes: 6, materials: 20, vor: 73 });
  assert.deepEqual(actSummary(b, "нет"), { schemes: 0, materials: 0, vor: 0 });
  assert.equal(docsOfMaterial(b, CABLE).length, 2);
  assert.equal(docsOfMaterial(b, ` ${CABLE} `).length, 2);
});

test("итог кабельного журнала по акту, текст с запятой считается", async () => {
  const b = await readBook(new MemoryWorkbook({ "КабельныйЖурнал": [
    { "Акт": "1", "Кабель: длина, м": 48 }, { "Акт": "1", "Кабель: длина, м": "26,5" }, { "Акт": "2", "Кабель: длина, м": 100 },
    { "Акт": "1", "Кабель: длина, м": "нет" }] }));
  assert.equal(cableTotal(b, "1"), 74.5);
});
