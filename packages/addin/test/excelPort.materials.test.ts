// План 30: материалы и документы качества — на одном листе рядом; вставка/удаление строк одной таблицы не трогает
// соседнюю; книга прежней версии — документы качества переносятся на лист «Материалы» со ссылками на сканы.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeExcel, FakeWorkbook } from "./helpers/fakeExcel.ts";
import { ExcelPort } from "@idk/addin/book/excelPort";
import { TABLES } from "@idk/shared/workbook/schema";
import { defaultImportant } from "@idk/shared/workbook/important";

const headers = (t: "Материалы" | "ДокументыКачества") => TABLES[t].columns.map((c) => c.header);

test("новая книга: на листе «Материалы» справочник и документы качества рядом, листа «Документы качества» нет", async () => {
  const wb = installFakeExcel();
  wb.addSheet("Лист1");
  await new ExcelPort().ensureBook(defaultImportant());
  const m = wb.table("Материалы")!, d = wb.table("ДокументыКачества")!;
  assert.equal(m.sheet.name, "Материалы");
  assert.equal(d.sheet.name, "Материалы");
  assert.equal(d.top, m.top, "заголовки на одной строке");
  assert.equal(d.left, m.left + m.cols + 1, "справа через пустой столбец");
  assert.ok(!wb.sheets.some((s) => s.name === "Документы качества" && !s.deleted));
  assert.equal(wb.table("МатериалыАктов")!.sheet.name, "Материалы в актах");
  assert.match(String(m.sheet.get(m.top - 1, m.left).v), /Материалы/);
  assert.match(String(d.sheet.get(d.top - 1, d.left).v), /Документы качества/);
});

test("строки одной таблицы на листе «рядом» вставляются и удаляются, не задевая соседнюю", async () => {
  const wb = installFakeExcel();
  wb.addSheet("Лист1");
  const port = new ExcelPort();
  await port.ensureBook(defaultImportant());
  await port.insert("ДокументыКачества", 0, [{ "Номер": "С-1" }, { "Номер": "С-2" }]);
  await port.insert("Материалы", 0, Array.from({ length: 5 }, (_, i) => ({ "Наименование": `М${i + 1}` })));
  await port.insert("Материалы", 2, [{ "Наименование": "вставка" }]);
  assert.deepEqual(wb.rowsOf("Материалы").map((r) => r["Наименование"]), ["М1", "М2", "вставка", "М3", "М4", "М5"]);
  assert.deepEqual(wb.rowsOf("ДокументыКачества").map((r) => r["Номер"]), ["С-1", "С-2"], "документы не раздвинуты");
  await port.remove("Материалы", [0, 2]);
  assert.deepEqual(wb.rowsOf("Материалы").map((r) => r["Наименование"]), ["М2", "М3", "М4", "М5"]);
  assert.deepEqual(wb.rowsOf("ДокументыКачества").map((r) => r["Номер"]), ["С-1", "С-2"]);
  await port.remove("ДокументыКачества", [0]);
  assert.deepEqual(wb.rowsOf("ДокументыКачества").map((r) => r["Номер"]), ["С-2"]);
  assert.equal(wb.rowsOf("Материалы").length, 4);
  // Чтение через порт — по таблице.
  assert.equal((await port.read("Материалы"))!.rows.length, 4);
});

/** Книга версии 11: «Материалы» и «Документы качества» — отдельные листы. */
function oldBook(extra = false): FakeWorkbook {
  const wb = installFakeExcel();
  wb.addTable("Материалы", "Материалы", 3, 0, headers("Материалы"), [["Кабель ВВГ"], ["Труба ПНД"]]);
  const dh = [...headers("ДокументыКачества"), ...(extra ? ["Моё"] : [])];
  const row = (m: string, n: string, scan = "") => dh.map((h) => (h === "Материалы" ? m : h === "Номер" ? n : h === "Тип" ? "Паспорт качества" : h === "Скан" ? scan : h === "Моё" ? "заметка" : ""));
  const t = wb.addTable("Документы качества", "ДокументыКачества", 3, 0, dh, [row("Кабель ВВГ", "П-1", "п1.pdf"), row("Кабель ВВГ; Труба ПНД", "С-7")]);
  const scanCol = dh.indexOf("Скан");
  t.sheet.put(t.top + 1, scanCol, { v: "п1.pdf", link: "https://localhost:3443/api/files/5" });
  return wb;
}

test("книга прежней версии: «Обновить разметку» переносит документы качества на лист «Материалы» со ссылками и удаляет старый лист", async () => {
  const wb = oldBook();
  const port = new ExcelPort();
  await port.ensureBook(defaultImportant());
  const d = wb.table("ДокументыКачества")!;
  assert.equal(d.sheet.name, "Материалы");
  assert.equal(d.left, wb.table("Материалы")!.left + wb.table("Материалы")!.cols + 1);
  assert.deepEqual(wb.rowsOf("ДокументыКачества").map((r) => [r["Материалы"], r["Номер"]]), [["Кабель ВВГ", "П-1"], ["Кабель ВВГ; Труба ПНД", "С-7"]]);
  const data = (await port.read("ДокументыКачества"))!;
  assert.equal(data.links[0][data.headers.indexOf("Скан")], "https://localhost:3443/api/files/5", "ссылка на скан сохранена");
  assert.ok(!wb.table("ДокументыКачества_перенос"), "временной таблицы нет");
  assert.ok(wb.sheets.find((s) => s.name === "Документы качества")!.deleted, "старый лист удалён");
  assert.deepEqual(wb.rowsOf("Материалы").map((r) => r["Наименование"]), ["Кабель ВВГ", "Труба ПНД"], "справочник не тронут");
  // Повторное «Обновить разметку» — ничего не переносит и не дублирует.
  await port.ensureBook(defaultImportant());
  assert.equal(wb.rowsOf("ДокументыКачества").length, 2);
});

test("свои столбцы в старой таблице документов — данные перенесены, старая таблица оставлена (под временным именем)", async () => {
  const wb = oldBook(true);
  await new ExcelPort().ensureBook(defaultImportant());
  assert.equal(wb.table("ДокументыКачества")!.sheet.name, "Материалы");
  assert.equal(wb.rowsOf("ДокументыКачества").length, 2);
  const old = wb.table("ДокументыКачества_перенос");
  assert.ok(old && !old.sheet.deleted, "старая таблица со своим столбцом не удалена");
});
