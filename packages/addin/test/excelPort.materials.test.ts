// План 31: одна таблица «Материалы» — материал, позиция РКЦ и до трёх документов качества; «Спецификация» и
// «ДокументыКачества» — виртуальные. Книга прежней версии (0.25 — отдельные листы, 0.26 — документы рядом)
// сводится в одну таблицу при «Обновить разметку»: со ссылками на сканы, архивом старых таблиц и списком проблем.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeExcel, FakeWorkbook } from "./helpers/fakeExcel.ts";
import { ExcelPort } from "@idk/addin/book/excelPort";
import { TABLES } from "@idk/shared/workbook/schema";
import { defaultImportant } from "@idk/shared/workbook/important";

const headers = (t: "Материалы" | "ДокументыКачества" | "Спецификация") => TABLES[t].columns.map((c) => c.header);
const OLD_MAT = ["Наименование", "Марка", "Артикул", "Завод-изготовитель", "Ед. изм.", "№ п/п РКЦ"];

test("новая книга: на листе «Материалы» одна таблица со всеми столбцами; листов «Спецификация» и «Документы качества» нет", async () => {
  const wb = installFakeExcel();
  wb.addSheet("Лист1");
  await new ExcelPort().ensureBook(defaultImportant());
  const m = wb.table("Материалы")!;
  assert.equal(m.sheet.name, "Материалы");
  assert.deepEqual(m.headers(), headers("Материалы"));
  assert.ok(!wb.table("ДокументыКачества") && !wb.table("Спецификация"));
  for (const s of ["Документы качества", "Спецификация", "Архив до 0.27"]) assert.ok(!wb.sheets.some((x) => x.name === s && !x.deleted), s);
});

test("документ качества и позиция РКЦ через порт — в столбцах строки материала; переход к ячейке — в «Материалы»", async () => {
  const wb = installFakeExcel();
  wb.addSheet("Лист1");
  const port = new ExcelPort();
  await port.ensureBook(defaultImportant());
  await port.insert("Материалы", 0, [{ "Наименование": "Кабель" }, { "Наименование": "Труба" }]);
  assert.equal(await port.isVirtual("ДокументыКачества"), true);
  const i = await port.insert("ДокументыКачества", 0, [{ "Материалы": "Кабель; Труба", "Тип": "Сертификат соответствия", "Номер": "С-1", "Листов": 2 }]);
  await port.write("ДокументыКачества", i, { "Скан": "с1.pdf" }, { "Скан": "https://localhost:3443/api/files/7" });
  const rows = wb.rowsOf("Материалы");
  assert.deepEqual(rows.map((r) => [r["Наименование"], r["Док.1: вид"], r["Док.1: номер"], r["Док.1: скан"]]),
    [["Кабель", "Сертификат соответствия", "С-1", "с1.pdf"], ["Труба", "Сертификат соответствия", "С-1", "с1.pdf"]]);
  const d = (await port.read("ДокументыКачества"))!;
  assert.equal(d.rows.length, 1, "общий сертификат — один документ");
  assert.equal(d.links[0][d.headers.indexOf("Скан")], "https://localhost:3443/api/files/7");
  await port.insert("Спецификация", 0, [{ "№ п/п": "1.1", "Наименование": "Лоток", "Ед. изм.": "м", "Кол-во по проекту": 10 }]);
  assert.equal(wb.rowsOf("Материалы")[2]["№ п/п РКЦ"], "1.1");
  wb.active = "Лист1";
  await port.selectCell("ДокументыКачества", 0, "Номер");
  assert.equal(wb.active, "Материалы");
  assert.equal(await port.tableSheetOffset("Спецификация"), await port.tableSheetOffset("Материалы"));
});

/** Книга 0.25: «Спецификация», «Материалы», «Документы качества» — отдельные листы. */
function book025(extraDocs = 0): FakeWorkbook {
  const wb = installFakeExcel();
  wb.addTable("Спецификация", "Спецификация", 3, 0, headers("Спецификация"), [
    ["1.1", "Кабели", "Кабель по РКЦ", "м", 500, "", "", "РКЦ", ""],
    ["2.1", "Прочее", "Без материала", "шт", 3, "", "", "вручную", ""],
  ]);
  wb.addTable("Материалы", "Материалы", 3, 0, OLD_MAT, [["Кабель ВВГ", "", "", "Завод", "м", "1.1"], ["Труба ПНД", "", "", "", "м", ""]]);
  const dh = headers("ДокументыКачества");
  const row = (m: string, n: string, scan = "") => dh.map((h) => (h === "Материалы" ? m : h === "Номер" ? n : h === "Тип" ? "Паспорт качества" : h === "Скан" ? scan : h === "Листов" ? 1 : ""));
  const docs = [row("Кабель ВВГ", "П-1", "п1.pdf"), row("Кабель ВВГ; Труба ПНД", "С-7"), ...Array.from({ length: extraDocs }, (_, k) => row("Кабель ВВГ", `Д-${k}`))];
  const t = wb.addTable("Документы качества", "ДокументыКачества", 3, 0, dh, docs);
  t.sheet.put(t.top + 1, dh.indexOf("Скан"), { v: "п1.pdf", link: "https://localhost:3443/api/files/5" });
  return wb;
}

test("книга 0.25: «Обновить разметку» сводит три листа в одну таблицу, сканы сохраняются, старые листы — в архив и прочь", async () => {
  const wb = book025();
  const port = new ExcelPort();
  await port.ensureBook(defaultImportant());
  assert.ok(!wb.table("Спецификация") && !wb.table("ДокументыКачества"));
  for (const s of ["Спецификация", "Документы качества"]) assert.ok(wb.sheets.find((x) => x.name === s)!.deleted, s);
  const archive = wb.sheets.find((x) => x.name === "Архив до 0.27" && !x.deleted)!;
  assert.equal(archive.visibility, "Hidden");
  assert.ok([...archive.cells.values()].some((c) => c.v === "П-1"), "в архиве — старые строки");
  const rows = wb.rowsOf("Материалы");
  assert.deepEqual(rows.map((r) => [r["Наименование"], r["№ п/п РКЦ"], r["Кол-во по проекту"], r["Док.1: номер"], r["Док.2: номер"]]), [
    ["Кабель ВВГ", "1.1", 500, "П-1", "С-7"],
    ["Труба ПНД", "", "", "С-7", ""],
    ["Без материала", "2.1", 3, "", ""],
  ]);
  const t = (await port.read("Материалы"))!;
  assert.equal(t.links[0][t.headers.indexOf("Док.1: скан")], "https://localhost:3443/api/files/5");
  assert.deepEqual(port.lastMerge && { ...port.lastMerge, problems: port.lastMerge.problems.length }, { docs: 2, positions: 2, problems: 0, backup: "Архив до 0.27" });
  // Виртуальные таблицы — как до переноса.
  assert.equal((await port.read("ДокументыКачества"))!.rows.length, 2);
  assert.deepEqual((await port.read("Спецификация"))!.rows.map((r) => r[0]), ["1.1", "2.1"]);
  // Повторное «Обновить разметку» — ничего не дублирует.
  port.lastMerge = null;
  await port.ensureBook(defaultImportant());
  assert.equal(wb.rowsOf("Материалы").length, 3);
  assert.equal(port.lastMerge, null);
});

test("книга 0.25: четвёртый документ материала не помещается — в списке проблем, данные в архиве", async () => {
  const wb = book025(2);
  const port = new ExcelPort();
  await port.ensureBook(defaultImportant());
  assert.equal(port.lastMerge!.problems.length, 1);
  assert.match(port.lastMerge!.problems[0], /Д-1.*Кабель ВВГ.*не поместился/);
  assert.ok([...wb.sheets.find((x) => x.name === "Архив до 0.27")!.cells.values()].some((c) => c.v === "Д-1"));
});

test("книга 0.26: документы стояли справа от «Материалов» — убираются до дописывания столбцов, лист «Материалы» остаётся", async () => {
  const wb = installFakeExcel();
  wb.addTable("Материалы", "Материалы", 3, 0, OLD_MAT, [["Кабель ВВГ", "", "", "", "м", ""]]);
  const dh = headers("ДокументыКачества");
  const t = wb.addTable("Материалы", "ДокументыКачества", 3, OLD_MAT.length + 1, dh,
    [dh.map((h) => (h === "Материалы" ? "Кабель ВВГ" : h === "Номер" ? "П-9" : h === "Тип" ? "Паспорт качества" : ""))]);
  t.sheet.put(2, OLD_MAT.length + 1, { v: "Документы качества (паспорта, сертификаты)", link: null });
  const port = new ExcelPort();
  await port.ensureBook(defaultImportant());
  assert.ok(!wb.table("ДокументыКачества"));
  assert.ok(!wb.sheets.find((x) => x.name === "Материалы")!.deleted);
  assert.deepEqual(wb.table("Материалы")!.headers(), headers("Материалы"));
  assert.equal(wb.rowsOf("Материалы")[0]["Док.1: номер"], "П-9");
  assert.equal((await port.read("ДокументыКачества"))!.rows.length, 1);
});

test("0.27.4: «Закрыто» и «Остаток» — формулы в формате «Общий» (и у новых строк), книга 0.27 чинится «Обновить разметку»", async () => {
  const wb = book025();
  const port = new ExcelPort();
  await port.ensureBook(defaultImportant());
  const t = wb.table("Материалы")!;
  const fmt = (h: string, r: number) => t.sheet.get(t.top + 1 + r, t.left + t.headers().indexOf(h)).fmt;
  const n = wb.rowsOf("Материалы").length;
  for (let r = 0; r < n; r++) for (const h of ["Закрыто", "Остаток"]) assert.equal(fmt(h, r), "General", `${h} ${r}`);
  await port.insert("Материалы", n, [{ "Наименование": "Новый 1" }, { "Наименование": "Новый 2" }]);
  assert.equal(fmt("Закрыто", n + 1), "General");
  assert.match(String(wb.rowsOf("Материалы")[n + 1]["Закрыто"]), /^=SUMIFS/);
  // Книга 0.27 (разметка 13) с текстовым форматом формул — «Обновить разметку» ставит «Общий».
  const ci = t.left + t.headers().indexOf("Закрыто");
  for (let r = 0; r < n + 2; r++) t.sheet.cells.set(`${t.top + 1 + r}:${ci}`, { ...t.sheet.get(t.top + 1 + r, ci), fmt: "@" });
  wb.settings.set("idk.version", "13");
  await port.ensureBook(defaultImportant());
  for (let r = 0; r < n + 2; r++) assert.equal(fmt("Закрыто", r), "General");
  assert.equal(wb.rowsOf("Материалы")[0]["Наименование"], "Кабель ВВГ", "данные не тронуты");
});
