// План 11: подстановка меток в .xlsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openZip } from "@idk/server/zip/zip";
import { readXlsx } from "@idk/server/xlsx/read";
import { fillXlsx } from "@idk/server/forms/xlsx";
import { FormError } from "@idk/server/forms/docx";
import type { FormData } from "@idk/shared/forms/fields";
import { makeXlsx } from "./helpers/xlsx.ts";

const data: FormData = {
  values: { "Акт.Номер": "1", "Объект.Заказчик": 'ООО "СБД" & <Ко>' },
  lists: {
    "Материалы": [
      { "Материал.Наименование": "Кабель", "Материал.Кол-во": "120,5" },
      { "Материал.Наименование": "Лоток", "Материал.Кол-во": "10" },
      { "Материал.Наименование": "Муфта", "Материал.Кол-во": "3" },
    ],
    "Схемы": [],
  },
};
const sheet = (buf: Buffer) => openZip(buf).get("xl/worksheets/sheet1.xml")!().toString("utf8");

test("метки в ячейках, спецсимволы", () => {
  const out = fillXlsx(makeXlsx({ "Л": [["Акт № {Акт.Номер}", "{Объект.Заказчик}"]] }), data);
  assert.deepEqual(readXlsx(out.buf).grid("Л"), [["Акт № 1", 'ООО "СБД" & <Ко>']]);
  assert.deepEqual(out.warnings, []);
});

test("повтор строки: числа, сдвиг строк ниже, объединения и области печати", () => {
  const src = makeXlsx({ "Л": [
    ["Шапка"], [], [], [],
    ["{#Материалы}{Материал.Наименование}", "{Материал.Кол-во}{/Материалы}"],
    ["Итого", null, "x"],
  ] }, { merges: ["A6:C6"], printArea: "'Л'!$A$1:$C$6" });
  const out = fillXlsx(src, data);
  const g = readXlsx(out.buf).grid("Л");
  assert.deepEqual(g.slice(4), [["Кабель", 120.5], ["Лоток", 10], ["Муфта", 3], ["Итого", null, "x"]]);
  assert.match(sheet(out.buf), /<mergeCell ref="A8:C8"\/>/);
  assert.match(openZip(out.buf).get("xl/workbook.xml")!().toString("utf8"), /\$A\$1:\$C\$8/);
});

test("пустой список убирает строку, нижние поднимаются", () => {
  const out = fillXlsx(makeXlsx({ "Л": [["Схемы"], ["{#Схемы}{Схема.Номер}{/Схемы}"], ["Конец"]] }), data);
  assert.deepEqual(readXlsx(out.buf).grid("Л"), [["Схемы"], ["Конец"]]);
});

test("неизвестная метка; не xlsx", () => {
  const out = fillXlsx(makeXlsx({ "Л": [["{Нет.Поля}"]] }, { shared: false }), data);
  assert.deepEqual(readXlsx(out.buf).grid("Л"), [["[нет поля: Нет.Поля]"]]);
  assert.deepEqual(out.warnings, ["Нет поля «Нет.Поля»"]);
  assert.throws(() => fillXlsx(new TextEncoder().encode("%PDF"), data), (e: unknown) => e instanceof FormError && e.message === "Это не файл Excel (.xlsx)");
});

test("цепочка вычислений удаляется вместе со ссылками на неё", async () => {
  const { writeZip } = await import("@idk/server/zip/zip");
  const base = openZip(makeXlsx({ "Л": [["{Акт.Номер}"]] }));
  const files: [string, Buffer][] = [...base].map(([k, g]) => [k, g()]);
  files.push(["xl/calcChain.xml", Buffer.from("<calcChain/>")]);
  const fix = (k: string, f: (s: string) => string) => { const i = files.findIndex(([n]) => n === k); files[i][1] = Buffer.from(f(files[i][1].toString())); };
  fix("xl/_rels/workbook.xml.rels", (s) => s.replace("</Relationships>", '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>'));
  fix("[Content_Types].xml", (s) => s.replace("/>", '><Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>'));
  const out = openZip(fillXlsx(writeZip(files), data).buf);
  assert.ok(!out.has("xl/calcChain.xml"));
  assert.doesNotMatch(out.get("xl/_rels/workbook.xml.rels")!().toString(), /calcChain/);
  assert.doesNotMatch(out.get("[Content_Types].xml")!().toString(), /calcChain/);
});

/** Лист с объединениями, формулой итога и проверкой данных — правка XML листа поверх makeXlsx. */
function withSheet(rows: any[][], extra: (xml: string) => string) {
  return (async () => {
    const { writeZip } = await import("@idk/server/zip/zip");
    const z = openZip(makeXlsx({ "Л": rows }));
    return writeZip([...z].map(([k, g]) => [k, k === "xl/worksheets/sheet1.xml" ? extra(g().toString()) : g()]));
  })();
}

test("финальная проверка: объединения строки-повтора копируются, при пустом списке удаляются", async () => {
  const merge = (xml: string) => xml.replace("</sheetData>", '</sheetData><mergeCells count="2"><mergeCell ref="A2:B2"/><mergeCell ref="A3:B3"/></mergeCells>');
  const three = fillXlsx(await withSheet([["Шапка"], ["{#Материалы}{Материал.Наименование}{/Материалы}"], ["Итого"]], merge), data);
  assert.deepEqual([...sheet(three.buf).matchAll(/<mergeCell ref="([^"]+)"/g)].map((m) => m[1]), ["A2:B2", "A3:B3", "A4:B4", "A5:B5"]);
  const none = fillXlsx(await withSheet([["Шапка"], ["{#Схемы}{Схема.Номер}{/Схемы}"], ["Итого"]], merge), data);
  assert.deepEqual([...sheet(none.buf).matchAll(/<mergeCell ref="([^"]+)"/g)].map((m) => m[1]), ["A2:B2"]);
});

test("финальная проверка: формула итога расширяется на строки повтора; ссылки ниже и проверка данных сдвигаются", async () => {
  const f = (xml: string) => xml
    .replace(/<c r="B3"[^>]*>[\s\S]*?<\/c>|<c r="B3"\/>/, "")
    .replace('<row r="3">', '<row r="3"><c r="B3"><f>SUM(B2:B2)+B5</f><v>0</v></c>')
    .replace("</sheetData>", '</sheetData><dataValidations count="1"><dataValidation sqref="A5"/></dataValidations>');
  const out = fillXlsx(await withSheet([["Шапка"], ["{#Материалы}{Материал.Наименование}", "{Материал.Кол-во}{/Материалы}"], ["Итого"], [], ["x"]], f), data);
  const xml = sheet(out.buf);
  assert.match(xml, /<f>SUM\(B2:B4\)\+B7<\/f>/);
  assert.match(xml, /<dataValidation sqref="A7"\/>/);
});

test("финальная проверка: числом — только количества, ведущие нули сохраняются", () => {
  const d = { values: { "Объект.Договор": "007", "Акт.Экз.": "4" }, lists: { "Материалы": [{ "Материал.Кол-во": "012", "Материал.Наименование": "123" }] } };
  const out = fillXlsx(makeXlsx({ "Л": [["{Объект.Договор}", "{Акт.Экз.}"], ["{#Материалы}{Материал.Наименование}", "{Материал.Кол-во}{/Материалы}"]] }), d);
  assert.deepEqual(readXlsx(out.buf).grid("Л"), [["007", 4], ["123", "012"]]);
});

test("финальная проверка: картинки ниже повтора сдвигаются; число объединений верное", async () => {
  const { writeZip } = await import("@idk/server/zip/zip");
  const z = openZip(makeXlsx({ "Л": [["Шапка"], ["{#Материалы}{Материал.Наименование}{/Материалы}"], ["Подпись"]] }));
  const files: [string, Buffer | string][] = [...z].map(([k, g]) => [k, k === "xl/worksheets/sheet1.xml"
    ? g().toString().replace("</sheetData>", '</sheetData><mergeCells count="1"><mergeCell ref="A3:C3"/></mergeCells><drawing r:id="rId1"/>') : g()]);
  files.push(["xl/worksheets/_rels/sheet1.xml.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>']);
  files.push(["xl/drawings/drawing1.xml", "<xdr:wsDr><xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:row>2</xdr:row></xdr:from><xdr:to><xdr:col>1</xdr:col><xdr:row>3</xdr:row></xdr:to></xdr:twoCellAnchor><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:row>0</xdr:row></xdr:from></xdr:oneCellAnchor></xdr:wsDr>"]);
  const out = openZip(fillXlsx(writeZip(files), data).buf);
  assert.equal(out.get("xl/drawings/drawing1.xml")!().toString().match(/<xdr:row>(\d+)<\/xdr:row>/g)!.join(""), "<xdr:row>4</xdr:row><xdr:row>5</xdr:row><xdr:row>0</xdr:row>");
  assert.match(out.get("xl/worksheets/sheet1.xml")!().toString(), /<mergeCells count="1"><mergeCell ref="A5:C5"\/>/);
});
