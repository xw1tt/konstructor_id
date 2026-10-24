// План 13, задача 7: образцы .docx с метками протоколов и актов; заполнение образца данными документа.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildProtoBundle } from "@idk/shared/protocols/bundle";
import { PROTO_KINDS } from "@idk/shared/protocols/defs";
import { protoSampleDocx } from "@idk/server/forms/protoDocx";
import { formData } from "@idk/server/forms/fields";
import { fillDocx, docxText } from "@idk/server/forms/docx";
import { openZip } from "@idk/server/zip/zip";
import { protoRecords } from "../../shared/test/fixtures/protoBook.ts";
import { startTestServer } from "./helpers/server.ts";

const wellFormedW = (xml: string) => {
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)(w:[A-Za-z]+)\b[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) stack.push(m[2]);
    else if (stack.pop() !== m[2]) return false;
  }
  return stack.length === 0;
};
const bundle = async (n: string) => buildProtoBundle(await readBook(new MemoryWorkbook(protoRecords() as any)), n, defaultImportant()).bundle!;

test("образец каждого из 16 видов — целый .docx с метками документа и строкой-повтором", () => {
  for (const k of PROTO_KINDS) {
    const buf = protoSampleDocx(k);
    const files = openZip(buf);
    for (const f of ["[Content_Types].xml", "_rels/.rels", "word/document.xml"]) assert.ok(files.has(f), `${k}: ${f}`);
    assert.ok(wellFormedW(files.get("word/document.xml")!().toString()), k);
    const t = docxText(buf);
    assert.match(t, /\{Документ\.Номер\}/, k);
    assert.match(t, /\{#Строки\}\{Строка\.№\}/, k);
    assert.match(t, /\{\/Строки\}/, k);
  }
  const pav = docxText(protoSampleDocx("pav"));
  assert.match(pav, /\{Строка\.Время срабатывания факт\., с\}/);
  assert.match(pav, /\{#Приборы\}/);
  assert.match(pav, /\{Лаборатория\.Руководитель\}/);
  assert.match(docxText(protoSampleDocx("aii")), /\{#Комиссия\}/);
});

test("образец ПАВ, заполненный пакетом ПАВ-1: номер, все строки, результат, приборы — без предупреждений", async () => {
  const b = await bundle("ПАВ-1");
  const { buf, warnings } = fillDocx(protoSampleDocx("pav"), formData(b));
  assert.deepEqual(warnings, []);
  const t = docxText(buf);
  assert.match(t, /Протокол №ПАВ-1/);
  assert.match(t, /QF1/);
  assert.match(t, /QF2/);
  assert.match(t, /соответствует/);
  assert.match(t, new RegExp(b.proto!.instruments[0].name));
  assert.match(t, new RegExp(b.proto!.lab!.head));
});

test("образец АИИ, заполненный пакетом АИИ-1: комиссия и перечень", async () => {
  const b = await bundle("АИИ-1");
  const { buf, warnings } = fillDocx(protoSampleDocx("aii"), formData(b));
  assert.deepEqual(warnings, []);
  const t = docxText(buf);
  assert.match(t, /АКТ №АИИ-1/);
  assert.match(t, /Валерьянов А\.А\./);
  assert.match(t, new RegExp(b.proto!.rows[0].name.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("GET /api/forms/sample/:kind — .docx; неизвестный вид — 404", async () => {
  const s = await startTestServer();
  const ok = await s.raw("GET", "/api/forms/sample/pav");
  assert.equal(ok.status, 200);
  assert.match(decodeURIComponent(ok.headers.get("content-disposition") ?? ""), /ПАВ\.docx/);
  assert.match(docxText(new Uint8Array(await ok.arrayBuffer())), /\{Документ\.Номер\}/);
  assert.equal((await s.raw("GET", "/api/forms/sample/aosr")).status, 404);
});
