// План 17, задача 2: книга, заполненная мастером, печатает АОСР (HTML формы «СБД»).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { writeBook } from "@idk/shared/workbook/write";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { exampleRows } from "@idk/shared/workbook/examples";
import { wizardRecords } from "@idk/shared/wizard";
import { renderActDoc } from "@idk/server/print/docs";
import { filled } from "../../shared/test/fixtures/wizardData.ts";

test("мастер → АОСР: номер, объект, работы, представители", async () => {
  const wb = new MemoryWorkbook({}, { placeholder: true });
  await writeBook(wb, exampleRows(), {});
  await writeBook(wb, wizardRecords(await readBook(wb), filled()));
  const { bundle, issues } = buildBundle(await readBook(wb), "ЭОМ-1", defaultImportant());
  assert.deepEqual(issues, []);
  const { html, name } = renderActDoc(bundle!, "aosr");
  assert.equal(name, "ЭОМ-1.АОСР.pdf");
  for (const s of ["ЭОМ-1.АОСР", "Прокладка кабельных линий", "Иванов И.И.", "Сидоров С.С.", "СП 76.13330.2016"]) assert.ok(html.includes(s), s);
});
