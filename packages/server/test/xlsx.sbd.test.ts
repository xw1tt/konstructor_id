// План 27: бланки «СБД» в Excel — значения из тех же данных, что PDF; строки таблиц и подписанты.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderActXlsx } from "@idk/server/print/xlsx/index";
import { buildDocDataFromBundle, buildAvkData } from "@idk/server/print/fromBundle";
import { cableDocData } from "@idk/server/print/cableData";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { buildCableBundle } from "@idk/shared/workbook/cables";
import { defaultImportant } from "@idk/shared/workbook/important";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { readXlsx } from "./helpers/xlsxRead.ts";

const book = async () => readBook(new MemoryWorkbook(aov1Records() as any));
const bundle = async () => buildBundle(await book(), AOV1, defaultImportant()).bundle!;
const cable = async (kind: "kj" | "ip") => buildCableBundle(await book(), AOV1, defaultImportant(), kind, { set: "sbd" }).bundle!;
const flat = (s: string) => s.replace(/\s+/g, " ");
const sheetOf = (buf: Buffer) => readXlsx(buf).sheets[0];
const has = (text: string, v: string | number) => assert.ok(flat(text).includes(flat(String(v))), String(v));

test("РИМ: строки документов, наименование группы — одна объединённая ячейка, подписи; имя файла как у PDF", async () => {
  const b = await bundle();
  const d = buildDocDataFromBundle(b, "rim");
  const { xlsx, name } = renderActXlsx(b, "rim");
  assert.equal(name, `${AOV1}.РИМ.xlsx`);
  const s = sheetOf(xlsx);
  has(s.text, `№${d.number}`);
  for (const r of d.rows) { has(s.text, r.number); if (!r.cont) has(s.text, r.name); }
  // Группы из нескольких документов — объединение по строкам в столбце B.
  const groups = d.rows.filter((r, i) => !r.cont && d.rows[i + 1]?.cont).length;
  assert.equal(s.merges.filter((m) => /^B\d+:B\d+$/.test(m)).length, groups);
  for (const sg of d.signs) for (const n of sg.names) has(s.text, n);
  assert.match(s.xml, /<brk|<sheetData/);
});

test("ВД: все строки материалов с позицией, артикулом, количеством", async () => {
  const b = await bundle();
  const d = buildDocDataFromBundle(b, "vd");
  const s = sheetOf(renderActXlsx(b, "vd").xlsx);
  for (const r of d.rows) { has(s.text, r.name); has(s.text, r.quantity); }
  const dataRows = s.rows.filter((r) => /^\d+ /.test(r)).length;
  assert.ok(dataRows >= d.rows.length);
});

test("ВОР: группы и строки, номера страниц в колонтитуле, подписи заказчика и монтажной организации", async () => {
  const b = await bundle();
  const d = buildDocDataFromBundle(b, "vor");
  const { xlsx, name } = renderActXlsx(b, "vor");
  assert.equal(name, `${AOV1}.ВОР.xlsx`);
  const s = sheetOf(xlsx);
  for (const r of d.rows) has(s.text, r.kind === "group" ? r.title : r.name);
  assert.match(s.xml, /&amp;P/);
  has(s.text, `Представитель заказчика: ${d.customer}`);
  has(s.text, `Представитель монтажной организации: ${d.contractor}`);
});

test("АВК: альбомный лист, строки таблицы, комиссия", async () => {
  const b = await bundle();
  const d = buildAvkData(b);
  const s = sheetOf(renderActXlsx(b, "avk").xlsx);
  assert.match(s.xml, /orientation="landscape"/);
  has(s.text, `№ ${d.number}`);
  for (const r of d.rows) { has(s.text, r.name); has(s.text, r.docs); }
  has(s.text, d.customerRep);
});

test("Протокол изоляции: шапка таблицы на 3 строки (повтор), 15 граф, строки линий, средства измерений", async () => {
  const b = await cable("ip");
  const d = cableDocData(b, "ip", "sbd");
  const x = readXlsx(renderActXlsx(b, "ip").xlsx);
  const s = x.sheets[0];
  has(s.text, `Протокол №${d.number}`);
  for (const r of d.rows) has(s.text, r.line);
  for (const i of d.instruments) has(s.text, i.serial);
  assert.match(x.workbook, /_xlnm.Print_Titles/);
  assert.ok(s.merges.some((m) => /^F\d+:O\d+$/.test(m)), "«Сопротивление изоляции» над 10 графами");
});

test("Кабельный журнал: на каждом листе 30 строк, основная надпись с номером листа, разрывы между листами", async () => {
  const b = await cable("kj");
  const d = cableDocData(b, "kj", "sbd");
  const s = sheetOf(renderActXlsx(b, "kj").xlsx);
  for (const l of d.sheets.flat()) if (l.kind === "cable") has(s.text, l.row.designation);
  assert.equal((s.text.match(/Кабельный журнал/g) ?? []).length, d.sheets.length);
  assert.equal(s.breaks.length, d.sheets.length - 1);
  has(s.text, d.stamp.code);
  assert.match(s.xml, /Arial|<c /);
});
