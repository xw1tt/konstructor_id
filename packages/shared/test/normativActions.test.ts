import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { collectFromActs, appendToP6, insertIntoP6, filterNormativ } from "@idk/shared/workbook/normativActions";
import { aov1Book, AOV1 } from "./fixtures/aov1Book.ts";

test("Собрать из актов: 4 обозначения из АОВ1, повторно — 0", async () => {
  const wb = aov1Book();
  assert.equal(await collectFromActs(wb, await readBook(wb)), 4);
  const t = await wb.read("Нормативы");
  assert.deepEqual(t!.rows.map((r) => r[0]), ["СП 76.13330.2016", "ПУЭ", "СП 77.13330.2016", "СП 134.13330.2012"]);
  assert.deepEqual(t!.rows.map((r) => r[2]), ["СП", "ПУЭ", "СП", "СП"]);
  assert.equal(t!.rows[1][3], "Действует");
  assert.equal(await collectFromActs(wb, await readBook(wb)), 0);
});

test("иное написание уже существующего не дублируется", async () => {
  const wb = aov1Book();
  await wb.insert("Нормативы", 0, [{ "Обозначение": "сп76.13330.2016 ", "Вид": "СП" }]);
  assert.equal(await collectFromActs(wb, await readBook(wb)), 3);
});

test("appendToP6", () => {
  assert.equal(appendToP6("", "СП 1.1"), "СП 1.1");
  assert.equal(appendToP6("  ", "СП 1.1"), "СП 1.1");
  assert.equal(appendToP6("СП 76.13330.2016.", "ГОСТ 10434-82"), "СП 76.13330.2016, ГОСТ 10434-82.");
  assert.equal(appendToP6("ПУЭ", "ГОСТ 1-1"), "ПУЭ, ГОСТ 1-1");
  assert.equal(appendToP6("по СП 76.13330.2016", "сп 76.13330.2016"), null);
});

test("insertIntoP6: уже есть, нет акта, успешно", async () => {
  const wb = aov1Book();
  const b = await readBook(wb);
  assert.deepEqual(await insertIntoP6(wb, b, AOV1, "СП 76.13330.2016"), { ok: false, message: "Уже есть в п.6" });
  assert.deepEqual(await insertIntoP6(wb, b, "нет", "СП 1"), { ok: false, message: "Акт «нет» не найден на листе «База актов»" });
  assert.deepEqual(await insertIntoP6(wb, b, AOV1, "ГОСТ 10434-82"), { ok: true });
  assert.match(String((await readBook(wb)).tables["Акты"]![0].v.normative), /, ГОСТ 10434-82\.$/);
});

test("filterNormativ", async () => {
  const wb = aov1Book();
  await collectFromActs(wb, await readBook(wb));
  const rows = (await readBook(wb)).tables["Нормативы"]!;
  assert.equal(filterNormativ(rows, "77").length, 1);
  assert.equal(filterNormativ(rows, "пуэ").length, 1);
  assert.equal(filterNormativ(rows, "  ").length, 4);
});

test("appendToP6 замечает повтор обозначений, которые не распознаются (СНиП, СТО)", () => {
  assert.equal(appendToP6("СНиП 3.05.06-85", "СНиП 3.05.06-85"), null);
  assert.equal(appendToP6("по СТО 123-2020 и ПУЭ", "сто 123-2020"), null);
  assert.equal(appendToP6("СНиП 3.05.06-85", "СНиП 3.05.06"), "СНиП 3.05.06-85, СНиП 3.05.06");
  assert.equal(appendToP6("по СНиП 3.05.06-85.", "СНиП 3.05.06-85"), null);
  assert.equal(appendToP6("СТО 1.2.3", "СТО 1.2"), "СТО 1.2.3, СТО 1.2");
});
