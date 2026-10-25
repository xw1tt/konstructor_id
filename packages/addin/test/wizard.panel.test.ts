// План 17, задача 3: «Создать акт» мастера пишет строки в книгу; с ошибками полей — ничего не пишет.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { emptyWizard } from "@idk/shared/wizard";
import { createAct } from "@idk/addin/panel/wizard";
import { filled } from "../../shared/test/fixtures/wizardData.ts";

test("мастер: пустые поля — ничего не записано; заполнено — акт в книге, АОСР собирается", async () => {
  const wb = new MemoryWorkbook({}, { placeholder: true });
  const bad = await createAct(wb, emptyWizard(), defaultImportant());
  assert.ok(bad.fieldErrors["object.name"]);
  assert.equal((await readBook(wb)).tables["Акты"]!.length, 0);
  const ok = await createAct(wb, filled(), defaultImportant());
  assert.deepEqual(ok, { fieldErrors: {}, issues: [] });
  const b = await readBook(wb);
  assert.deepEqual(b.tables["Акты"]!.map((r) => r.v.baseNumber), ["ЭОМ-1"]);
  assert.equal(b.tables["МатериалыАктов"]!.length, 1);
  const again = await createAct(wb, filled(), defaultImportant());
  assert.equal(again.fieldErrors["act.number"], "Такой акт уже есть в книге");
});
