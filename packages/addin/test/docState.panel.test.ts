// 0.45: документ акта без исходных данных (нет кабелей — КЖ) акту не нужен; АОСР — всегда нужен.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { docState } from "@idk/addin/panel/print";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

test("КЖ без кабелей акта — absent; с кабелями — печатается; АОСР — ok", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const book = await readBook(wb);
  assert.equal(docState(book, AOV1, defaultImportant(), "aosr").state, "ok");
  const withCables = docState(book, AOV1, defaultImportant(), "kj").state;
  assert.notEqual(withCables, "absent", "у АОВ1 есть кабели");
  const cables = (await wb.read("КабельныйЖурнал"))!;
  await wb.remove(
    "КабельныйЖурнал",
    cables.rows.map((_, i) => i),
  );
  const none = await readBook(wb);
  assert.equal(docState(none, AOV1, defaultImportant(), "kj").state, "absent");
  assert.equal(docState(none, AOV1, defaultImportant(), null).state, "ok");
});
