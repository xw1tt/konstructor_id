// 0.39: книга объекта из сохранённого .xlsx без Excel — таблицы по именам, гиперссылки «Скан», настройки надстройки.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeZip } from "../src/zip/zip.ts";
import { readBookFile } from "../src/xlsx/bookFile.ts";
import { startTestServer } from "./helpers/server.ts";

const is = (ref: string, v: string) => `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
const num = (ref: string, v: number) => `<c r="${ref}"><v>${v}</v></c>`;

/** Лист «Схемы»: заголовок на строке 2, таблица «Схемы» A2:C4, гиперссылка у скана B3; чужая таблица — пропускается. */
function sampleBook(): Buffer {
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>
<row r="1">${is("A1", "Исполнительные схемы")}</row>
<row r="2">${is("A2", "Акт")}${is("B2", "Скан")}${is("C2", "Номер")}</row>
<row r="3">${is("A3", "АКТ-1")}${is("B3", "схема.pdf")}${is("C3", "ИС-1")}</row>
<row r="4">${is("A4", "АКТ-1")}${num("C4", 2)}</row>
</sheetData><hyperlinks><hyperlink ref="B3" r:id="rId9"/></hyperlinks><tableParts count="2"><tablePart r:id="rId1"/><tablePart r:id="rId2"/></tableParts></worksheet>`;
  return writeZip([
    [
      "xl/workbook.xml",
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Схемы" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheet],
    [
      "xl/worksheets/_rels/sheet1.xml.rels",
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="../tables/table1.xml"/><Relationship Id="rId2" Target="../tables/table2.xml"/><Relationship Id="rId9" Target="https://localhost:3443/api/files/7" TargetMode="External"/></Relationships>`,
    ],
    [
      "xl/tables/table1.xml",
      `<?xml version="1.0"?><table id="1" name="Схемы" displayName="Схемы" ref="A2:C4"><tableColumns count="3"><tableColumn id="1" name="Акт"/><tableColumn id="2" name="Скан"/><tableColumn id="3" name="Номер"/></tableColumns></table>`,
    ],
    [
      "xl/tables/table2.xml",
      `<?xml version="1.0"?><table id="2" name="Чужая" displayName="Чужая" ref="E1:E2"><tableColumns count="1"><tableColumn id="1" name="X"/></tableColumns></table>`,
    ],
    [
      "xl/webextensions/webextension1.xml",
      `<?xml version="1.0"?><we:webextension xmlns:we="http://schemas.microsoft.com/office/webextensions/webextension/2010/11"><we:properties><we:property name="idk.template" value="&quot;ti&quot;"/><we:property name="idk.version" value="16"/><we:property name="other" value="1"/></we:properties></we:webextension>`,
    ],
  ]);
}

test("таблицы программы из файла: заголовки, строки, гиперссылки столбца «файл»; настройки idk.*", () => {
  const b = readBookFile(sampleBook());
  assert.deepEqual(Object.keys(b.tables), ["Схемы"]);
  const t = b.tables["Схемы"]!;
  assert.deepEqual(t.headers, ["Акт", "Скан", "Номер"]);
  assert.deepEqual(t.rows, [
    ["АКТ-1", "схема.pdf", "ИС-1"],
    ["АКТ-1", null, 2],
  ]);
  assert.deepEqual(t.links, [
    [null, "https://localhost:3443/api/files/7", null],
    [null, null, null],
  ]);
  assert.deepEqual(b.settings, { "idk.template": "ti", "idk.version": "16" });
});

test("POST /api/book-file: книга — таблицы; не книга объекта и не .xlsx — 422 с понятным текстом", async () => {
  const s = await startTestServer({ openWindow: null });
  const ok = await s.raw("POST", "/api/book-file", { body: new Uint8Array(sampleBook()), headers: { "x-file-name": encodeURIComponent("Объект.xlsx") } });
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.equal(j.name, "Объект.xlsx");
  assert.equal(j.tables["Схемы"].rows.length, 2);
  const bad = await s.raw("POST", "/api/book-file", { body: Buffer.from("не zip") });
  assert.equal(bad.status, 422);
  assert.match((await bad.json()).error, /\.xlsx/);
  const empty = writeZip([
    ["xl/workbook.xml", `<workbook><sheets><sheet name="Лист1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", `<worksheet><sheetData/></worksheet>`],
  ]);
  const none = await s.raw("POST", "/api/book-file", { body: new Uint8Array(empty) });
  assert.equal(none.status, 422);
  assert.match((await none.json()).error, /не книга объекта/);
});
