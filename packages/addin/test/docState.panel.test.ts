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

test("0.46.12: КЖ «Камчатки» без строки «ДокументыКабелей» печатается — проверка по набору шаблона", async () => {
  const { PrintOptions } = await import("@idk/shared/templates");
  const { BUILTIN_KAM } = await import("@idk/shared/forms/template");
  const recs = aov1Records() as any;
  recs["ДокументыКабелей"] = [];
  const book = await readBook(new MemoryWorkbook(recs));
  assert.equal(docState(book, AOV1, defaultImportant(), "kj").state, "bad", "по «СБД» нужен шифр журнала");
  assert.equal(docState(book, AOV1, defaultImportant(), "kj", PrintOptions.parse(BUILTIN_KAM.print)).state, "ok");
});

test("0.46.14: «Камчатка» — материалов не больше 5: реестр примененных материалов не составляется (ни печать, ни реестр ИД)", async () => {
  const { PrintOptions } = await import("@idk/shared/templates");
  const { BUILTIN_KAM } = await import("@idk/shared/forms/template");
  const { registryRows } = await import("@idk/shared/kit/registry");
  const KAM = PrintOptions.parse(BUILTIN_KAM.print);
  const many = await readBook(new MemoryWorkbook(aov1Records() as any));
  assert.equal(docState(many, AOV1, defaultImportant(), "rim", KAM).state, "ok");
  const recs = aov1Records() as any;
  const mine = recs["МатериалыАктов"].filter((m: any) => m["Акт"] === AOV1).slice(0, 3);
  recs["МатериалыАктов"] = mine;
  const kept = new Set(mine.map((m: any) => m["Материал"]));
  if (recs["ВОР"]) recs["ВОР"] = recs["ВОР"].filter((v: any) => kept.has(v["Материал"]));
  const few = await readBook(new MemoryWorkbook(recs));
  assert.equal(docState(few, AOV1, defaultImportant(), "rim", KAM).state, "absent");
  assert.equal(docState(few, AOV1, defaultImportant(), "rim").state, "ok", "в «СБД» реестр составляется всегда");
  const { kitRecords } = await import("../../shared/test/fixtures/kitBook.ts");
  const kit = kitRecords() as any;
  const act = kit["АктыКомплектов"][0]["Акт"];
  const keep = kit["МатериалыАктов"].filter((m: any) => m["Акт"] === act).slice(0, 2);
  kit["МатериалыАктов"] = [...kit["МатериалыАктов"].filter((m: any) => m["Акт"] !== act), ...keep];
  const keepNames = new Set(keep.map((m: any) => m["Материал"]));
  if (kit["ВОР"]) kit["ВОР"] = kit["ВОР"].filter((v: any) => v["Акт"] !== act || keepNames.has(v["Материал"]));
  const rows = registryRows(await readBook(new MemoryWorkbook(kit)), "1", BUILTIN_KAM).rows.filter((r) => r.values["Акт"] === act);
  const kinds = rows.map((r) => r.values["Вид"]);
  assert.ok(kinds.includes("АОСР") && kinds.includes("ВД"));
  assert.ok(!kinds.includes("РИМ"), "в реестре ИД нет реестра материалов");
});
