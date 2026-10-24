// План 12, задача 7: панель справочника — тексты полноты, «не нужен для этого акта», сводка комплекта.
import { test } from "node:test";
import assert from "node:assert/strict";
import { statusText, shortageText, skipDoc, workListNames } from "@idk/addin/panel/catalogApi";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { BUILTIN_CATALOG } from "@idk/shared/catalog/builtin";
import { addWork } from "@idk/shared/catalog/template";
import { UserTemplate } from "@idk/shared/forms/template";

test("statusText для четырёх статусов", () => {
  assert.equal(statusText("print", "АОСР"), "печатается: АОСР");
  assert.equal(statusText("scan", "ПКЛ"), "скан есть: ПКЛ");
  assert.equal(statusText("noScan", "ПКЛ"), "нет скана: ПКЛ");
  assert.equal(statusText("noForm", "Акт осмотра"), "нет формы: Акт осмотра");
});

test("shortageText", () => assert.equal(shortageText(3), "Не хватает документов: 3"));

test("skipDoc дописывает код в «Без документов» через «; » без повторов", async () => {
  const wb = new MemoryWorkbook({ "Акты": [{ "Номер акта": "1" }, { "Номер акта": "2", "Без документов": "ПКЛ" }] });
  await skipDoc(wb, await readBook(wb), "1", "ПОКБ");
  await skipDoc(wb, await readBook(wb), "2", "ПОКБ");
  await skipDoc(wb, await readBook(wb), "2", "пкл");
  const rows = (await readBook(wb)).tables["Акты"]!;
  assert.equal(rows[0].v.skipDocs, "ПОКБ");
  assert.equal(rows[1].v.skipDocs, "ПКЛ; ПОКБ");
  await assert.rejects(skipDoc(wb, await readBook(wb), "9", "ПКЛ"), /не найден/);
});

test("workListNames: виды работ шаблона, без них — все из справочника", () => {
  const empty = UserTemplate.parse({ id: "t-00000000-0000-4000-8000-000000000000", name: "Т", docs: [], print: {} });
  const all = workListNames(BUILTIN_CATALOG, empty);
  assert.equal(all.length, BUILTIN_CATALOG.sections.flatMap((s) => s.works).length);
  const t = addWork(addWork(empty, BUILTIN_CATALOG, "ЭМ.КЛ"), BUILTIN_CATALOG, "ЭМ.ЛТ");
  assert.deepEqual(workListNames(BUILTIN_CATALOG, t), ["Прокладка кабельных линий", "Монтаж кабельных лотков и коробов"]);
});
