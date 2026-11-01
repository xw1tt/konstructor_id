// PDF исполнительной схемы трассы: один лист формата схемы, текст подписей и штампа; ошибки JSON — 400.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { startTestServer } from "./helpers/server.ts";
import { pdfPages } from "./helpers/pdftext.ts";
import { closeBrowser } from "@idk/server/print/browser";

after(() => closeBrowser());

const example = JSON.parse(readFileSync(new URL("../../shared/test/fixtures/route.example.json", import.meta.url), "utf8"));
const mm = (pt: number) => Math.round((pt / 72) * 25.4);

test("POST /api/scheme/pdf: лист A3 альбомный, подписи участков и штамп", async () => {
  const s = await startTestServer();
  const res = await s.raw("POST", "/api/scheme/pdf", { headers: { "content-type": "application/json" }, body: JSON.stringify(example) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const buf = new Uint8Array(await res.arrayBuffer());
  const doc = await PDFDocument.load(buf);
  assert.equal(doc.getPageCount(), 1);
  const { width, height } = doc.getPage(0).getSize();
  assert.deepEqual([mm(width), mm(height)], [420, 297]);
  const [text] = await pdfPages(buf);
  for (const t of ["М 1:75", "ЛМ 200×50, L=17,2 м", "Ведомость кабельных трасс", "0997-01-СКС1.ИС-1"]) assert.ok(text!.includes(t), `нет «${t}»: ${text}`);
});

test("POST /api/scheme/pdf: книжный A4", async () => {
  const s = await startTestServer();
  const res = await s.raw("POST", "/api/scheme/pdf", { headers: { "content-type": "application/json" }, body: JSON.stringify({ ...example, format: "A4", orientation: "portrait" }) });
  const { width, height } = (await PDFDocument.load(new Uint8Array(await res.arrayBuffer()))).getPage(0).getSize();
  assert.deepEqual([mm(width), mm(height)], [210, 297]);
});

test("POST /api/scheme/pdf: неверная схема — 400", async () => {
  const s = await startTestServer();
  const r = await s.req("POST", "/api/scheme/pdf", { nodes: [], segments: [] });
  assert.equal(r.status, 400);
});
