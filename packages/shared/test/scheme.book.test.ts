// Схема трассы из листа «Схемы трасс»: та же трасса, что в fixtures/route.example.json, но строками книги.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { neededTables } from "@idk/shared/workbook/sheets";
import { TABLES, SHEETS, type TableName } from "@idk/shared/workbook/schema";
import type { CellValue } from "@idk/shared/workbook/values";
import { routeFromBook, routeNumbers, routeOfRow, registerRecord, registerRowIndex, isXAxis } from "@idk/shared/scheme/fromBook";
import { routeTotals, cableRouteLengths } from "@idk/shared/scheme/route";
import { renderRouteSvg } from "@idk/shared/scheme/render";

const axes = (s: string, list: [string, number][]) => list.map(([n, p]) => ({ "Схема": s, "Ось": n, "Координата, мм": p }));
const pt = (s: string, id: string, ax: string, dx: number, ay: string, dy: number, level: number | null, label = "") =>
  ({ "Схема": s, "Точка": id, "Ось X": ax, "Смещение X, мм": dx, "Ось Y": ay, "Смещение Y, мм": dy, "Отметка, м": level, "Подпись": label });
const seg = (s: string, from: string, to: string, kind: string, mark: string, width: number | null, cables: string) =>
  ({ "Схема": s, "Откуда": from, "Куда": to, "Способ прокладки": kind, "Марка": mark, "Ширина / диаметр, мм": width, "Кабели": cables });

const BOOK: Partial<Record<TableName, Record<string, CellValue>[]>> = {
  "Объект": [{ "Поле": "Наименование объекта", "Значение": "Аэровокзальный комплекс" }, { "Поле": "Лицо, выполнившее работы (по умолчанию)", "Значение": "ООО «Монтаж»" }],
  "Акты": [{ "Номер акта": "СКС-5", "Шифр": "0997-01-СКС1", "Выполнивший работы": "ООО «Подрядчик»" }],
  "Представители": [
    { "Роль": "Выполнивший работы", "ФИО": "Иванов И.И.", "Порядок": 2 },
    { "Роль": "Выполнивший работы", "ФИО": "Сидоров С.С.", "Порядок": 1 },
    { "Роль": "Строительный контроль подрядчика", "ФИО": "Петров П.П." },
  ],
  "Трассы": [{
    "Номер схемы": "ИС-1", "Акт": "СКС-5", "Наименование": "Схема кабельных трасс СКС, этаж 2", "Дата": "20.10.2026",
    "Формат": "A3", "Ориентация": "альбомная", "Примечания": "Отметки от чистого пола.\nЛотки на шпильках М8.",
  }, { "Номер схемы": "ИС-2", "Наименование": "Пустая" }],
  "ТрассыОси": axes("ИС-1", [["1", 0], ["2", 6000], ["3", 12000], ["4", 18000], ["5", 24000], ["А", 0], ["Б", 6000], ["В", 9000]]),
  "ТрассыТочки": [
    pt("ИС-1", "ШК", "1", 800, "Б", 1500, 0, "ШК-2.1"),
    pt("ИС-1", "п1", "1", 800, "Б", 1500, 3.2),
    pt("ИС-1", "п2", "4", 0, "Б", 1500, 3.2),
    pt("ИС-1", "п3", "5", -600, "Б", 1500, 3.2),
    pt("ИС-1", "п4", "4", 0, "А", 1200, 3.2),
    pt("ИС-1", "к205", "4", -2500, "А", 1200, 0.3, "Каб. 205"),
    pt("ИС-1", "к207", "5", -600, "А", 2500, 0.3, "Каб. 207"),
  ],
  "ТрассыУчастки": [
    seg("ИС-1", "ШК", "п1", "Лоток кабельный", "ЛМ 200×50", 200, "1; 2; 3; 4"),
    seg("ИС-1", "п1", "п2", "Лоток кабельный", "ЛМ 200×50", 200, "1; 2; 3; 4"),
    seg("ИС-1", "п2", "п3", "Лоток кабельный", "ЛМ 100×50", 100, "3, 4"),
    seg("ИС-1", "п2", "п4", "Труба гладкая", "ПВХ 32", null, "1; 2"),
    seg("ИС-1", "п4", "к205", "Труба гофрированная", "ПВХ 25", null, "1; 2"),
    seg("ИС-1", "п3", "к207", "Труба гофрированная", "ПВХ 25", null, "3; 4"),
  ],
};

test("лист «Схемы трасс»: четыре таблицы; виден вместе с «Исполнительными схемами»", () => {
  assert.deepEqual(SHEETS.find((s) => s.name === "Схемы трасс")!.tables, ["Трассы", "ТрассыОси", "ТрассыТочки", "ТрассыУчастки"]);
  assert.deepEqual(TABLES["ТрассыТочки"].columns.map((c) => c.header),
    ["Схема", "Точка", "Ось X", "Смещение X, мм", "Ось Y", "Смещение Y, мм", "Отметка, м", "Подпись"]);
  for (const t of ["Трассы", "ТрассыОси", "ТрассыТочки", "ТрассыУчастки"] as const)
    for (const c of TABLES[t].columns) assert.ok(c.hint, `нет подсказки ${t}.${c.key}`);
  const need = neededTables({ docs: [{ kind: "builtin", doc: "aosr", form: null }] } as any);
  assert.ok(need.has("Трассы") && need.has("ТрассыУчастки"));
  assert.ok(isXAxis("10а") && !isXAxis("Б"));
});

test("схема из книги — те же длины, что у примера JSON; штамп из акта, объекта и представителей", async () => {
  const book = await readBook(new MemoryWorkbook(BOOK));
  assert.deepEqual(routeNumbers(book), ["ИС-1", "ИС-2"]);
  const { scheme, issues } = routeFromBook(book, "ИС-1");
  assert.deepEqual(issues, []);
  assert.ok(scheme);
  assert.deepEqual(routeTotals(scheme).map((t) => [t.mark, t.length]), [["ЛМ 100×50", 5.4], ["ЛМ 200×50", 20.4], ["ПВХ 32", 6.3], ["ПВХ 25", 13.3]]);
  assert.equal(cableRouteLengths(scheme).get("3"), 33.7);
  assert.equal(scheme.title, "Исполнительная схема №ИС-1. Схема кабельных трасс СКС, этаж 2");
  assert.deepEqual(scheme.notes, ["Отметки от чистого пола.", "Лотки на шпильках М8."]);
  assert.deepEqual(scheme.stamp, {
    code: "0997-01-СКС1", object: "Аэровокзальный комплекс", sheetName: "Схема кабельных трасс СКС, этаж 2", stage: "ИД",
    sheet: 1, sheets: 1, org: "ООО «Подрядчик»",
    signers: [{ role: "Составил", name: "Сидоров С.С.", date: "10.26" }, { role: "Проверил", name: "Петров П.П.", date: "10.26" }],
  });
  const svg = renderRouteSvg(scheme);
  assert.deepEqual(svg.warnings, []);
  assert.ok(svg.svg.includes("ЛМ 200×50, L=17,2 м"));
});

test("ошибки — по ячейкам: нет оси, ось не в той графе, нет точки, способ не из списка, повтор точки", async () => {
  const book = await readBook(new MemoryWorkbook({
    "Трассы": [{ "Номер схемы": "С", "Наименование": "x", "Масштаб 1:": "сто" }],
    "ТрассыОси": axes("С", [["1", 0], ["А", 0]]),
    "ТрассыТочки": [pt("С", "a", "А", 0, "А", 0, null), pt("С", "b", "1", 0, "Я", 0, null), pt("С", "c", "1", 0, "А", 0, null), pt("С", "c", "", 5, "", 5, null), pt("С", "d", "", 1000, "", 0, null)],
    "ТрассыУчастки": [seg("С", "a", "zz", "Лоток", "", null, ""), seg("С", "c", "c", "Кабель открыто", "", null, ""), seg("С", "c", "d", "Кабель открыто", "", -5, "")],
  }));
  const { scheme, issues } = routeFromBook(book, "С");
  assert.equal(scheme, null);
  assert.deepEqual(issues.map((i) => [i.table, i.row, i.column, i.message]), [
    ["ТрассыТочки", 0, "Ось X", "Ось «А» — буквенная, её место в «Ось Y»"],
    ["ТрассыТочки", 1, "Ось Y", "Нет оси «Я» в таблице «Оси» схемы «С»"],
    ["ТрассыТочки", 3, "Точка", "Точка «c» указана дважды"],
    ["ТрассыУчастки", 0, "Куда", "Нет точки «zz» в схеме «С»"],
    ["ТрассыУчастки", 0, "Способ прокладки", "Способ «Лоток» — выберите из списка"],
    ["ТрассыУчастки", 1, "Куда", "Начало и конец участка совпадают"],
    ["ТрассыУчастки", 2, "Ширина / диаметр, мм", "Ширина должна быть больше нуля"],
    ["Трассы", 0, "Масштаб 1:", "Нужно число"],
  ]);
  const empty = routeFromBook(book, "нет");
  assert.equal(empty.issues[0]!.message, "Схема «нет» не найдена в таблице «Схемы» листа «Схемы трасс»");
});

test("пустая схема — подсказка заполнить точки и участки", async () => {
  const book = await readBook(new MemoryWorkbook(BOOK));
  assert.deepEqual(routeFromBook(book, "ИС-2").issues.map((i) => i.message), [
    "В схеме «ИС-2» меньше двух точек — заполните таблицу «Точки трассы»",
    "В схеме «ИС-2» нет участков — заполните таблицу «Участки трассы»",
  ]);
});

test("строка «Исполнительных схем» для схемы трассы; повторное сохранение — та же строка", async () => {
  const book = await readBook(new MemoryWorkbook({ ...BOOK, "Схемы": [{ "Акт": "СКС-5", "Номер": "№ИС-1", "Наименование": "старое" }] }));
  assert.deepEqual(registerRecord(book, "ИС-1"), { "Акт": "СКС-5", "Вид": "Схема", "Номер": "ИС-1", "Наименование": "Схема кабельных трасс СКС, этаж 2", "Дата": "20.10.2026" });
  assert.equal(registerRowIndex(book, "ИС-1"), 0);
  assert.equal(registerRowIndex(book, "ИС-2"), null);
  assert.equal(routeOfRow("ТрассыУчастки", { scheme: "ИС-1" }), "ИС-1");
  assert.equal(routeOfRow("Трассы", { number: " ИС-2 " }), "ИС-2");
});
