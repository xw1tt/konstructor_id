// 0.28: распознавание скана документа качества — текстовый PDF (pdf.js), картинка (OCR — подмена), нейросеть.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";
import { fakeAi } from "./helpers/fakeAi.ts";
import { htmlToPdf, closeBrowser } from "@idk/server/print/browser";

after(() => closeBrowser());

const CERT_HTML = `<html><body style="font-family:'Liberation Serif',serif;font-size:14px">
<p>ЕВРАЗИЙСКИЙ ЭКОНОМИЧЕСКИЙ СОЮЗ</p><h2>СЕРТИФИКАТ СООТВЕТСТВИЯ</h2><p>№ ЕАЭС RU C-RU.АД38.В.00024/21</p>
<p>ИЗГОТОВИТЕЛЬ Общество с ограниченной ответственностью "Спецкабель", Место нахождения: 107497, Москва</p>
<p>ПРОДУКЦИЯ Кабели для промышленного интерфейса RS-485, групповой прокладки</p>
<p>СРОК ДЕЙСТВИЯ С 11.06.2021 ПО 10.06.2026 ВКЛЮЧИТЕЛЬНО</p></body></html>`;

const upload = async (s: Awaited<ReturnType<typeof startTestServer>>, buf: Buffer, mime: string, name: string) =>
  (await (await s.raw("POST", "/api/files", { body: buf as unknown as BodyInit, headers: { "content-type": mime, "x-file-name": encodeURIComponent(name) } })).json()) as { id: number };

test("текстовый PDF без нейросети: поля по правилам, OCR не вызывается", async () => {
  let ocrCalls = 0;
  const s = await startTestServer({ ocrRunner: async () => { ocrCalls++; return { text: "", lang: "ru" }; } });
  const f = await upload(s, await htmlToPdf(CERT_HTML), "application/pdf", "серт.pdf");
  const r = await s.req("POST", `/api/files/${f.id}/recognize`, { material: "Кабель RS-485" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.method, "pdf-text");
  assert.equal(r.json.via, "rules");
  assert.equal(r.json.pages, 1);
  assert.deepEqual({ ...r.json.fields, manufacturer: undefined }, {
    type: "Сертификат соответствия", number: "№ЕАЭС RU C-RU.АД38.В.00024/21", issueDate: "2021-06-11", validUntil: "2026-06-10", manufacturer: undefined,
  });
  assert.equal(ocrCalls, 0);
});

test("картинка: текст от OCR Windows, нейросеть разбирает поля, правила дополняют", async () => {
  const ai = await fakeAi({ "/v1/chat/completions": [{ json: { choices: [{ message: { content: '{"type":"Паспорт качества","number":"№77","issueDate":"2026-03-14","validUntil":null,"manufacturer":"ДКС"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } }] });
  const seen: string[] = [];
  const s = await startTestServer({ ocrRunner: async (_p, kind) => { seen.push(kind); return { text: "ПАСПОРТ КАЧЕСТВА № 77\nТруба гофрированная ПНД 20 с зондом, partия 5, годен до 01.01.2031\nДата изготовления 14.03.2026", lang: "ru" }; } });
  await s.req("PUT", "/api/ai/providers/new", { name: "Своя", kind: "openai", baseUrl: `${ai.url}/v1`, model: "m", key: "k" });
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
  const f = await upload(s, png, "image/png", "паспорт.png");
  const r = await s.req("POST", `/api/files/${f.id}/recognize`, { material: "Труба ПНД 20" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(seen, ["image"]);
  assert.equal(r.json.method, "ocr");
  assert.equal(r.json.via, "ai");
  assert.equal(r.json.fields.number, "№77");
  assert.equal(r.json.fields.type, "Паспорт качества");
  assert.match(ai.seen[0].body.messages[1].content, /Труба ПНД 20/);
});

test("OCR недоступен — понятная ошибка; язык распознавания не русский — предупреждение", async () => {
  const s = await startTestServer({ ocrRunner: async () => { throw new (await import("@idk/server/http/router")).HttpError(501, "Распознавание сканов-картинок работает в Windows"); } });
  const f = await upload(s, Buffer.from("ffd8ffe000104a464946", "hex"), "image/jpeg", "a.jpg");
  const r = await s.req("POST", `/api/files/${f.id}/recognize`, {});
  assert.equal(r.status, 501);
  assert.match(r.json.error, /Windows/);
  const s2 = await startTestServer({ ocrRunner: async () => ({ text: "Certificate of conformity No 12345 valid until 01.01.2030 manufacturer ACME electrical cables", lang: "en-US" }) });
  const f2 = await upload(s2, Buffer.from("ffd8ffe000104a464946", "hex"), "image/jpeg", "b.jpg");
  const r2 = await s2.req("POST", `/api/files/${f2.id}/recognize`, {});
  assert.equal(r2.status, 200);
  assert.ok(r2.json.warnings.some((w: string) => /русского текста/.test(w)));
});
