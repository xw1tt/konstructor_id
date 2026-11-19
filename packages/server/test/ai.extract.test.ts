// 0.34: текст РД для роли «Черновики актов из РД» — Word, Excel, PDF; скан без текста и не тот файл — понятная ошибка.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";
import { makeDocx, p, r } from "./helpers/docx.ts";
import { htmlToPdf, closeBrowser } from "@idk/server/print/browser";

test("извлечение текста РД", async (t) => {
  const s = await startTestServer();
  const docx = makeDocx([p(r("Спецификация оборудования")), p(r("Кабель ВВГнг-LS 3х2,5 — 120 м"))].join(""));
  const d = await s.req("POST", "/api/ai/extract", { file: docx.toString("base64"), name: "ЭМ.docx" });
  assert.equal(d.status, 200, JSON.stringify(d.json));
  assert.match(d.json.text, /Кабель ВВГнг-LS 3х2,5 — 120 м/);
  assert.equal(d.json.name, "ЭМ.docx");
  const bad = await s.req("POST", "/api/ai/extract", { file: Buffer.from("привет").toString("base64") });
  assert.equal(bad.status, 422);
  assert.match(bad.json.error, /PDF, Word/);
  t.after(() => closeBrowser());
  let pdf: Buffer;
  try {
    pdf = await htmlToPdf("<html><body><p>Лист 1. Прокладка кабеля в лотках</p></body></html>");
  } catch {
    t.diagnostic("нет браузера — PDF не проверяется");
    return;
  }
  const x = await s.req("POST", "/api/ai/extract", { file: pdf.toString("base64"), name: "РД.pdf" });
  assert.equal(x.status, 200, JSON.stringify(x.json));
  assert.match(x.json.text, /Прокладка кабеля в лотках/);
  assert.equal(x.json.pages, 1);
  const empty = await htmlToPdf("<html><body></body></html>");
  const e = await s.req("POST", "/api/ai/extract", { file: empty.toString("base64"), name: "скан.pdf" });
  assert.equal(e.status, 422);
  assert.match(e.json.error, /нет текстового слоя/);
});
