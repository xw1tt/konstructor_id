// План 30: материалы акта из карточки — правки «Материалов в актах»; документы качества из карточки материала.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { actMaterialRows, planActMaterials, describeActMaterials, newQualityDoc, docMaterials } from "@idk/shared/acts/actMaterials";
import { applyChanges, undoChanges } from "@idk/shared/ai/changes";
import { sheetPlan } from "@idk/shared/workbook/sheets";
import { BUILTIN_SBD } from "@idk/shared/forms/template";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

test("выбор материалов акта: снять, добавить, изменить количество и № поз.; применение и отмена", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const book = await readBook(wb);
  const cur = actMaterialRows(book, AOV1);
  assert.ok(cur.length >= 3);
  const keep = cur.slice(1).map((r, i) => ({ material: r.material, quantity: i === 0 ? 99 : r.quantity, position: i === 0 ? "П-1" : r.position }));
  const picks = [...keep, { material: "Новый материал", quantity: 5, position: "" }];
  const ch = planActMaterials(book, AOV1, picks);
  assert.deepEqual(ch.map((c) => c.kind).sort(), ["add", "delete", "update"]);
  assert.equal(describeActMaterials(ch), "добавлено 1, изменено 1, убрано 1");
  const undo = await applyChanges(wb, ch);
  const after = actMaterialRows(await readBook(wb), AOV1);
  assert.deepEqual(after.map((r) => r.material), [...cur.slice(1).map((r) => r.material), "Новый материал"]);
  assert.equal(after[0].quantity, 99);
  assert.equal(after[0].position, "П-1");
  assert.equal(after.at(-1)!.position, "б/н");
  // Повтор того же выбора — без изменений.
  assert.equal(planActMaterials(await readBook(wb), AOV1, picks).length, 0);
  await undoChanges(wb, undo);
  assert.deepEqual(actMaterialRows(await readBook(wb), AOV1).map((r) => [r.material, r.quantity]), cur.map((r) => [r.material, r.quantity]));
});

test("повтор материала в акте убирается, регистр не важен", async () => {
  const r: any = aov1Records();
  const first = r["МатериалыАктов"].find((x: any) => x["Акт"] === AOV1);
  r["МатериалыАктов"].push({ ...first });
  const book = await readBook(new MemoryWorkbook(r));
  const cur = actMaterialRows(book, AOV1);
  const picks = [...new Map(cur.map((x) => [x.material.toUpperCase(), { material: x.material.toUpperCase(), quantity: x.quantity, position: x.position }])).values()];
  const ch = planActMaterials(book, AOV1, picks);
  assert.deepEqual(ch.map((c) => c.kind), ["delete"]);
});

test("документ качества из карточки материала; привязка общего сертификата и отвязка", () => {
  assert.deepEqual(newQualityDoc(" Кабель ", { type: "Паспорт качества", number: " П-1 ", date: 46000, validUntil: null, sheets: 2 }),
    { "Материалы": "Кабель", "Тип": "Паспорт качества", "Номер": "П-1", "Дата": 46000, "Действует до": null, "Листов": 2 });
  assert.equal(docMaterials("Кабель; Труба", "Лоток", true), "Кабель; Труба; Лоток");
  assert.equal(docMaterials("Кабель; Труба", "кабель", true), "Труба; кабель");
  assert.equal(docMaterials("Кабель; Труба", "Кабель", false), "Труба");
  assert.equal(docMaterials("Кабель", "Кабель", false), "");
});

test("лист «Материалы в актах» служебный: при «Только нужных листах» скрыт даже с данными", async () => {
  const book = await readBook(new MemoryWorkbook(aov1Records() as any));
  assert.ok(sheetPlan(BUILTIN_SBD, book, true).hidden.includes("Материалы в актах"));
  assert.ok(sheetPlan(BUILTIN_SBD, book, false).visible.includes("Материалы в актах"));
  assert.ok(sheetPlan(BUILTIN_SBD, book, true).visible.includes("Материалы"));
});
