// План 10: закрыто по актам, лист «Закрытие по актам», материалы без привязки.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { isoToExcelSerial } from "@idk/shared/workbook/values";
import { specClosed, positionOfMaterial, unboundMaterials, closedReport, CLOSED_SHEET } from "@idk/shared/spec/closed";

const d = isoToExcelSerial;
const records = () => ({
  "Акты": [{ "Номер акта": "А1", "Дата акта": d("2026-10-01") }, { "Номер акта": "А2", "Дата акта": d("2026-10-10") }],
  "Спецификация": [
    { "№ п/п": "1.1", "Раздел": "Кабели", "Наименование": "Кабель", "Ед. изм.": "м", "Кол-во по проекту": 100 },
    { "№ п/п": "1.2", "Раздел": "Кабели", "Наименование": "Хомут", "Ед. изм.": "шт.", "Кол-во по проекту": 5 },
    { "№ п/п": "2", "Раздел": "Лотки", "Наименование": "Лоток", "Ед. изм.": "шт.", "Кол-во по проекту": 10 },
  ],
  "Материалы": [
    { "Наименование": "Кабель ВВГ", "Ед. изм.": "м", "№ п/п РКЦ": "1.1" },
    { "Наименование": "Хомут 200", "Ед. изм.": "шт.", "№ п/п РКЦ": "1.2" },
    { "Наименование": "Лоток 50", "Ед. изм.": "шт.", "№ п/п РКЦ": 2 },
    { "Наименование": "Муфта", "Ед. изм.": "шт." },
  ],
  "МатериалыАктов": [
    { "Акт": "А1", "Материал": "Кабель ВВГ", "Кол-во": 30 },
    { "Акт": "А1", "Материал": "Хомут 200", "Кол-во": 7 },
    { "Акт": "А1", "Материал": "Муфта", "Кол-во": 1 },
    { "Акт": "А2", "Материал": "Кабель ВВГ" },
    { "Акт": "А2", "Материал": "Лоток 50", "Кол-во": 4 },
  ],
  "ВОР": [
    { "Акт": "А2", "Этаж / участок": "1", "Материал": "Кабель ВВГ", "Объём": 15 },
    { "Акт": "А2", "Этаж / участок": "2", "Материал": "Кабель ВВГ", "Объём": 5 },
  ],
});
const book = async (r: any = records()) => readBook(new MemoryWorkbook(r));

test("закрыто: «Кол-во» или сумма ВОР; разбивка по актам; остаток", async () => {
  const [cable, clamp, tray] = specClosed(await book());
  assert.equal(cable.closed, 50);
  assert.equal(cable.rest, 50);
  assert.deepEqual(cable.byAct, [{ act: "А1", date: "2026-10-01", qty: 30 }, { act: "А2", date: "2026-10-10", qty: 20 }]);
  assert.deepEqual(cable.materials, ["Кабель ВВГ"]);
  assert.equal(clamp.rest, -2);
  assert.equal(tray.closed, 4, "номер числом в «Материалах» совпадает с текстом «2» в спецификации");
});

test("позиция материала и материалы без привязки", async () => {
  const b = await book();
  assert.equal(positionOfMaterial(b, "Кабель ВВГ")!.number, "1.1");
  assert.equal(positionOfMaterial(b, "Муфта"), null);
  assert.deepEqual(unboundMaterials(b, "А1"), ["Муфта"]);
  const r = records();
  r["Материалы"][1]["№ п/п РКЦ"] = "9.9";
  assert.deepEqual(unboundMaterials(await book(r), "А1"), ["Хомут 200", "Муфта"], "номер, которого нет в спецификации");
  const empty = records() as any;
  delete empty["Спецификация"];
  assert.deepEqual(unboundMaterials(await book(empty), "А1"), [], "пустая спецификация — без предупреждений");
});

test("лист «Закрытие по актам»", async () => {
  const rep = closedReport(await book());
  assert.equal(rep.sheet, CLOSED_SHEET);
  assert.equal(CLOSED_SHEET, "Закрытие по актам");
  assert.deepEqual(rep.rows[0], ["№ п/п", "Наименование", "Ед. изм.", "По проекту", "Закрыто", "Остаток", "Акт №А1 от 01.10.2026", "Акт №А2 от 10.10.2026"]);
  assert.deepEqual(rep.rows[1], ["Кабели", null, null, null, null, null, null, null]);
  assert.deepEqual(rep.rows[2], ["1.1", "Кабель", "м", 100, 50, 50, 30, 20]);
  assert.deepEqual(rep.rows[3], ["1.2", "Хомут", "шт.", 5, 7, -2, 7, null]);
  assert.deepEqual(rep.rows[4], ["Лотки", null, null, null, null, null, null, null]);
  assert.deepEqual(rep.bold, [0, 1, 4]);
  assert.deepEqual(rep.negative, [[3, 5]]);
  assert.equal(rep.widths.length, 8);
});

test("пустая спецификация — отчёт из одной шапки", async () => {
  const r = records() as any;
  delete r["Спецификация"];
  const rep = closedReport(await book(r));
  assert.equal(rep.rows.length, 1);
  assert.deepEqual(specClosed(await book(r)), []);
});

test("writeReport в памяти: сохраняет и заменяет", async () => {
  const wb = new MemoryWorkbook(records());
  const rep = closedReport(await readBook(wb));
  await wb.writeReport(rep);
  assert.deepEqual(wb.report(CLOSED_SHEET), rep);
  await wb.writeReport({ ...rep, rows: [rep.rows[0]] });
  assert.equal(wb.report(CLOSED_SHEET)!.rows.length, 1);
  assert.equal(wb.report("Нет"), null);
});

test("позиция с пометкой «нет в РКЦ» продолжает считать закрытое", async () => {
  const r = records() as any;
  r["Спецификация"][0]["Примечание"] = "нет в РКЦ";
  r["Спецификация"][0]["Источник"] = "РКЦ";
  assert.equal(specClosed(await book(r))[0].closed, 50);
});
