import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsToMaterials, materialsToRows, splitNew } from "@idk/addin/sheetMapping";

test("rowsToMaterials: заголовки ВД из образца", () => {
  const { materials, errors } = rowsToMaterials([
    ["№ п/п", "Наименование оборудования, комплекта", "Тип, марка", "Ед. изм."],
    ["1", "Труба ПЛЛ гибкая гофрированная ∅ 20 мм", "81820", "м."],
    ["", "", "", ""],
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(materials, [
    { name: "Труба ПЛЛ гибкая гофрированная ∅ 20 мм", mark: "81820", article: "", manufacturer: "", unit: "м." },
  ]);
});

test("rowsToMaterials: заголовки ВД СБД (артикул, завод, опечатка «Ед.ихм»)", () => {
  const { materials } = rowsToMaterials([
    ["№ п/п", "№ поз по УСР", "Наименование оборудования, комплекта", "Артикул", "Завод изготовитель", "Ед.ихм", "Кол-во"],
    ["1", "б/н", "Муфта труба-коробка, IP67, М20х1,5, д.20мм", "50220", "DKC", "шт.", "14"],
  ]);
  assert.deepEqual(materials[0], {
    name: "Муфта труба-коробка, IP67, М20х1,5, д.20мм", mark: "", article: "50220", manufacturer: "DKC", unit: "шт.",
  });
});

test("rowsToMaterials: нет колонки наименования → ошибка", () => {
  const r = rowsToMaterials([["Марка", "Ед. изм."], ["x", "м"]]);
  assert.deepEqual(r.materials, []);
  assert.deepEqual(r.errors, ["Не найдена колонка «Наименование»"]);
});

test("rowsToMaterials: числа и пробелы приводятся к строкам", () => {
  const r = rowsToMaterials([["Наименование", "Артикул"], ["  Хомут  ", 63920 as unknown as string]]);
  assert.deepEqual(r.materials[0], { name: "Хомут", mark: "", article: "63920", manufacturer: "", unit: "" });
});

test("materialsToRows ∘ rowsToMaterials сохраняет данные", () => {
  const ms = [
    { name: "Труба ПВХ жёсткая гладкая, d20 мм", mark: "", article: "63920", manufacturer: "DKC", unit: "м." },
    { name: 'Кабель СегментКИ-485-ПсЭнг(А)-HF 1х2х0,78', mark: "1х2х0,78", article: "", manufacturer: 'ООО "СегментЭНЕРГО"', unit: "м." },
  ];
  assert.deepEqual(rowsToMaterials(materialsToRows(ms.map((m, i) => ({ id: i + 1, ...m })))).materials, ms);
});

test("splitNew: повтор по наименованию и марке пропускается", () => {
  const existing = [{ id: 1, name: "Хомут", mark: "P6.6", article: "", manufacturer: "", unit: "" }];
  const r = splitNew(
    [
      { name: " хомут ", mark: "p6.6", article: "", manufacturer: "", unit: "" },
      { name: "Хомут", mark: "P8", article: "", manufacturer: "", unit: "" },
      { name: "Хомут", mark: "P8", article: "", manufacturer: "", unit: "" },
    ],
    existing,
  );
  assert.equal(r.add.length, 1);
  assert.equal(r.skipped, 2);
});
