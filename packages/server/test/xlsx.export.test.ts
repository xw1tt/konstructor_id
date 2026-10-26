// План 26: запись .xlsx, перенос строк, АОСР в Excel, маршрут ?format=xlsx.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { Sheet, writeBook, colName } from "@idk/server/xlsx/book";
import { Layout, wrapLines, textWidth } from "@idk/server/xlsx/layout";
import { aosrSheet } from "@idk/server/print/xlsx/aosr";
import { renderActXlsx } from "@idk/server/print/xlsx/index";
import { buildDocDataFromBundle } from "@idk/server/print/fromBundle";
import { closeBrowser } from "@idk/server/print/browser";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { startTestServer } from "./helpers/server.ts";
import { readXlsx } from "./helpers/xlsxRead.ts";

after(() => closeBrowser());
const bookBundle = async () => buildBundle(await readBook(aov1Book()), AOV1, defaultImportant()).bundle!;
/** Текст листа без переносов: значения полей разбиты по строкам листа. */
const flat = (s: string) => s.replace(/\s+/g, " ");

test("запись книги: столбцы, объединения, высоты, разрывы, сквозные строки, А4 по ширине, шрифт", () => {
  const sh = new Sheet("Лист: проба", [10, 20, 30], { margins: [10, 10, 10, 20], landscape: true, pageNumbers: true });
  sh.merge(1, 1, 1, 3, "Заголовок & <знаки>", { b: true, h: "center", border: { b: true } });
  sh.set(2, 2, 42);
  sh.height(1, 15.3);
  sh.breakAfter(1);
  sh.titleRows = [1, 1];
  const x = readXlsx(writeBook([sh]));
  const s = x.sheets[0];
  assert.equal(s.name, "Лист_ проба");
  assert.equal(s.cells.get(1)!.get(1), "Заголовок & <знаки>");
  assert.equal(s.cells.get(2)!.get(2), "42");
  assert.deepEqual(s.merges, ["A1:C1"]);
  assert.deepEqual(s.breaks, [1]);
  assert.match(s.xml, /<row r="1" ht="15.25" customHeight="1">/);
  assert.match(s.xml, /orientation="landscape" fitToWidth="1" fitToHeight="0"/);
  assert.match(s.xml, /<pageSetUpPr fitToPage="1"\/>/);
  assert.match(s.xml, /<pageMargins left="0.787"/);
  assert.match(s.xml, /&amp;R&amp;P/);
  assert.equal((s.xml.match(/<col /g) ?? []).length, 3);
  assert.match(x.workbook, /_xlnm.Print_Titles" localSheetId="0">'Лист_ проба'!\$1:\$1/);
  assert.match(x.styles, /Times New Roman/);
  // Рамка у каждой ячейки объединения.
  assert.equal((s.xml.match(/<c r="[ABC]1" s="(\d+)"/g) ?? []).length, 3);
  assert.equal(colName(28), "AB");
});

test("перенос по словам: каждая строка помещается, слова не теряются; длинное слово режется", () => {
  const text = "Реконструируемый деловой комплекс в составе корп. «А», «Б», «В» с единой стилобатной (подземной) частью";
  const lines = wrapLines(text, 150, 10, true, true);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(textWidth(l, 10, true, true) <= 150, l);
  assert.equal(lines.join(" "), text);
  const long = wrapLines("Ш".repeat(40), 60);
  assert.ok(long.length > 1);
  assert.equal(long.join(""), "Ш".repeat(40));
  assert.deepEqual(wrapLines("а\nб", 100), ["а", "б"]);
  assert.ok(textWidth("ШШШ", 10, true) > textWidth("ШШШ", 10));
});

test("таблица: шапка с объединениями, повтор шапки, рамки", () => {
  const L = new Layout("Т", [10, 10, 10], { margins: [10, 10, 10, 10] });
  L.para("Таблица");
  L.table([[{ header: "№", rowspan: 2 }, { header: "Сопротивление", span: 2 }], [{ header: "A" }, { header: "B" }]],
    [[{ text: 1 }, { text: "x" }, { text: "y" }], [{ text: 2, rowspan: 2 }, { text: "z", span: 2 }], [{ text: "q" }, { text: "w" }]]);
  const s = readXlsx(writeBook([L.sheet])).sheets[0];
  assert.deepEqual(L.sheet.titleRows, [2, 3]);
  assert.ok(s.merges.includes("A2:A3") && s.merges.includes("B2:C2") && s.merges.includes("A5:A6") && s.merges.includes("B5:C5"));
  assert.equal(s.cells.get(6)!.get(2), "q");
  assert.equal(s.cells.get(6)!.get(3), "w");
});

test("АОСР в Excel: все значения, разрыв страницы перед п.1, номер и даты посередине линии, подписи", async () => {
  const b = await bookBundle();
  const d = buildDocDataFromBundle(b, "aosr");
  const L = aosrSheet(d);
  const s = readXlsx(writeBook([L.sheet])).sheets[0];
  const all = flat(s.rows.join(" "));
  for (const v of [d.objectName, d.developer, d.builder, d.designer, d.performerOrg, d.works, d.p2, d.normative, d.nextWorks, d.attachments, d.dateStart, d.dateEnd, `№${d.number}`, d.date, ...d.p3, ...d.p4, ...d.reps.flatMap((r) => r.lines)])
    assert.ok(all.includes(flat(v)), v);
  for (const sgn of d.signs) for (const n of sgn.names) assert.ok(all.includes(n), n);
  assert.equal((all.match(/\(фамилия, инициалы, подпись\)/g) ?? []).length, d.signs.reduce((n, x) => n + x.names.length, 0));
  // Разрыв — сразу перед строкой «1. К освидетельствованию…».
  const p1 = [...s.cells.entries()].find(([, row]) => [...row.values()].some((t) => t.startsWith("1. К освидетельствованию")))![0];
  assert.ok(s.breaks.length === 1 && s.breaks[0] < p1 && s.breaks[0] >= p1 - 2, `${s.breaks} / ${p1}`);
  const numRow = [...s.cells.entries()].find(([, row]) => row.get(1) === `№${d.number}`)![0];
  assert.equal(L.sheet.get(numRow, 1)!.s.h, "center");
  assert.equal(L.sheet.get(numRow, 28)!.v, d.date);
  assert.equal(L.sheet.get(numRow, 28)!.s.h, "center");
  assert.equal(L.sheet.get(numRow, 1)!.s.border?.b, true);
});

test("АОСР в Excel: пустой п.4 — «Не требуется»", async () => {
  const b = await bookBundle();
  const s = readXlsx(renderActXlsx({ ...b, documents: [] }, "aosr").xlsx).sheets[0];
  const i = s.rows.findIndex((r) => r.startsWith("4. Предъявлены документы"));
  assert.equal(s.rows[i + 1], "Не требуется");
});

test("GET /api/print-jobs/:id/aosr?format=xlsx → .xlsx с именем как у PDF; неизвестный документ — 400", async () => {
  const s = await startTestServer();
  const created = await s.req("POST", "/api/print-jobs", await bookBundle());
  const r = await s.raw("GET", `/api/print-jobs/${created.json.id}/aosr?format=xlsx`);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(r.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.ok((r.headers.get("content-disposition") ?? "").startsWith("attachment;"));
  assert.ok((r.headers.get("content-disposition") ?? "").includes(encodeURIComponent(`${AOV1}.АОСР.xlsx`)));
  const x = readXlsx(new Uint8Array(await r.arrayBuffer()));
  assert.ok(x.sheets[0].text.includes(`${AOV1}.АОСР`));
  assert.equal((await s.req("GET", `/api/print-jobs/${created.json.id}/xyz?format=xlsx`)).status, 400);
  assert.equal((await s.req("GET", `/api/print-jobs/00000000-0000-0000-0000-000000000000/aosr?format=xlsx`)).status, 404);
});
