// 0.33: оформление документа из шаблона — в PDF (стиль поверх формы) и в Excel (шрифт, масштаб, поля, ориентация).
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderActXlsx } from "@idk/server/print/xlsx/index";
import { renderActDoc } from "@idk/server/print/docs";
import { applyDocStyle } from "@idk/shared/docStyle";
import { openZip } from "@idk/server/zip/zip";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

const bundle = async () => buildBundle(await readBook(new MemoryWorkbook(aov1Records() as any)), AOV1, defaultImportant()).bundle!;
const part = (buf: Buffer, name: string) => openZip(buf).get(name)!().toString("utf8");

test("Excel: шрифт и масштаб кегля по основному тексту, поля и ориентация; без оформления — как раньше", async () => {
  const b = await bundle();
  const plain = renderActXlsx(b, "rim").xlsx;
  assert.doesNotMatch(part(plain, "xl/styles.xml"), /Arial/);
  const styled = renderActXlsx(b, "rim", { styles: { "rim:sbd": { font: "Arial", size: 12, marginLeft: 30, orientation: "landscape" } } }).xlsx;
  const st = part(styled, "xl/styles.xml");
  assert.match(st, /<name val="Arial"\/>/);
  assert.doesNotMatch(st, /Times New Roman/);
  assert.match(st, /<sz val="12"\/>/, "10 пт × 1,2");
  const ws = part(styled, "xl/worksheets/sheet1.xml");
  assert.match(ws, /orientation="landscape"/);
  assert.match(ws, /left="1\.18/, "30 мм ≈ 1,18 дюйма");
  // Оформление другого документа на РИМ не действует.
  assert.doesNotMatch(part(renderActXlsx(b, "rim", { styles: { "vd:sbd": { font: "Arial" } } }).xlsx, "xl/styles.xml"), /Arial/);
});

test("PDF: стиль документа встраивается в HTML формы последним", async () => {
  const b = await bundle();
  const { html } = renderActDoc(b, "aosr", {});
  const out = applyDocStyle(html, { size: 11 });
  assert.ok(out.length > html.length);
  assert.ok(out.indexOf("idk-doc-style") > out.indexOf("<body"));
});

test("предпросмотр: HTML задания печати с оформлением из запроса — на «бумаге» с полями и ориентацией", async () => {
  const { startTestServer } = await import("./helpers/server.ts");
  const s = await startTestServer();
  const b = await bundle();
  const r = await s.req("POST", "/api/print-jobs", { ...b, template: "sbd", options: { styles: { "rim:sbd": { size: 9 } } } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const get = async (q: string) => {
    const x = await s.raw("GET", `/api/print-jobs/${r.json.id}/rim?format=html${q}`);
    return { status: x.status, type: x.headers.get("content-type"), text: await x.text() };
  };
  const saved = await get("");
  assert.equal(saved.type, "text/html; charset=utf-8");
  assert.match(saved.text, /body \{ font-size: 9pt/, "оформление из шаблона");
  assert.match(saved.text, /width:210mm/);
  const live = await get(`&style=${encodeURIComponent(JSON.stringify({ size: 12, orientation: "landscape", marginLeft: 30 }))}`);
  assert.match(live.text, /body \{ font-size: 12pt/);
  assert.doesNotMatch(live.text, /font-size: 9pt !important; \} \.field/);
  assert.match(live.text, /width:297mm/);
  assert.match(live.text, /padding:10mm 10mm 10mm 30mm/);
  assert.equal((await get(`&style=${encodeURIComponent('{"size":99}')}`)).status, 400);
  assert.equal((await get(`&style=oops`)).status, 400);
});
