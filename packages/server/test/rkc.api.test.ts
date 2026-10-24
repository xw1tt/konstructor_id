// План 10: загрузка РКЦ — листы и разобранные позиции.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";
import { makeXlsx } from "./helpers/xlsx.ts";
import { makePdf } from "./helpers/pdf.ts";
import { rkcSample } from "../../shared/test/fixtures/rkcSample.ts";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const send = (s: Awaited<ReturnType<typeof startTestServer>>, bytes: Uint8Array, type = XLSX) =>
  s.raw("POST", "/api/rkc", { body: bytes as unknown as BodyInit, headers: { "content-type": type } });

test("POST /api/rkc → листы; GET ?sheet= → позиции и предупреждения", async () => {
  const s = await startTestServer();
  const res = await send(s, makeXlsx({ "д.с.1 ": rkcSample, "Пусто": [["a"]] }));
  assert.equal(res.status, 201);
  const { id, sheets } = await res.json();
  assert.deepEqual(sheets, ["д.с.1 ", "Пусто"]);
  const r = await s.req("GET", `/api/rkc/${id}?sheet=${encodeURIComponent("д.с.1 ")}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.sheet, "д.с.1 ");
  assert.equal(r.json.items.length, 10);
  assert.deepEqual(r.json.items[0], { number: "1.1.1.1", section: "ОСНОВНОЕ ОБОРУДОВАНИЕ", name: "Термостат защиты от замораживания", unit: "шт.", quantity: 20 });
  assert.equal(r.json.warnings.length, 3);
});

test("ошибки: не xlsx — 422, нет листа — 404, нет шапки — 422, неизвестный id — 404", async () => {
  const s = await startTestServer();
  const bad = await send(s, await makePdf(1), "application/pdf");
  assert.equal(bad.status, 422);
  assert.equal((await bad.json()).error, "Это не файл Excel (.xlsx). Сохраните РКЦ в Excel как «Книга Excel (*.xlsx)»");
  const { id } = await (await send(s, makeXlsx({ "А": [["a"]] }))).json();
  const none = await s.req("GET", `/api/rkc/${id}?sheet=Нет`);
  assert.equal(none.status, 404);
  assert.equal(none.json.error, "Лист «Нет» не найден");
  const head = await s.req("GET", `/api/rkc/${id}?sheet=А`);
  assert.equal(head.status, 422);
  assert.match(head.json.error, /Не найдена шапка РКЦ/);
  assert.equal((await s.req("GET", "/api/rkc/нет?sheet=А")).status, 404);
});

test("повреждённый файл и битая ссылка на лист — 422, а не 500", async () => {
  const s = await startTestServer();
  const xlsx = Buffer.from(makeXlsx({ "А": [["a"]] }));
  const i = xlsx.indexOf(Buffer.from("xl/workbook.xml"));
  for (let k = 0; k < 8; k++) xlsx[i + 15 + 2 + k] ^= 0xff;
  assert.equal((await send(s, xlsx)).status, 422);
  // испорчен только лист: книга открывается, разбор листа — 422 с понятным текстом
  const sheet = Buffer.from(makeXlsx({ "А": [["a"]] }));
  const j = sheet.indexOf(Buffer.from("xl/worksheets/sheet1.xml"));
  for (let k = 0; k < 8; k++) sheet[j + 24 + 2 + k] ^= 0xff;
  const up = await send(s, sheet);
  assert.equal(up.status, 201);
  const r = await s.req("GET", `/api/rkc/${(await up.json()).id}?sheet=А`);
  assert.equal(r.status, 422);
  assert.match(r.json.error, /Повреждённый файл/);
});
