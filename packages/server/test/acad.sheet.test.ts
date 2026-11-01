// Обмен с плагином AutoCAD: последнее задание листа схемы; нет задания — 404 с подсказкой.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";

const job = {
  act: "15", number: "1", title: "Исполнительная схема №1. Монтаж лотков", code: "АТ-4182", object: "Аэропорт", section: "СУДИО",
  org: "ООО «ТИ»", stage: "ИД", date: "10.26", signers: [{ role: "Разработал", name: "Рябов Е.А." }],
  rows: [{ n: 1, name: "Лоток", mark: "35262", supplier: "ДКС", unit: "м", quantity: 20, note: "" }],
};

test("POST → GET /api/acad/sheet: последнее задание; неверное — 400", async () => {
  const s = await startTestServer();
  const none = await s.req("GET", "/api/acad/sheet");
  assert.equal(none.status, 404);
  assert.match(none.json.error, /«В AutoCAD»/);
  assert.equal((await s.req("POST", "/api/acad/sheet", job)).status, 201);
  assert.equal((await s.req("POST", "/api/acad/sheet", { ...job, number: "2" })).status, 201);
  const got = await s.req("GET", "/api/acad/sheet");
  assert.equal(got.status, 200);
  assert.equal(got.json.number, "2");
  assert.deepEqual(got.json.rows, job.rows);
  assert.equal((await s.req("POST", "/api/acad/sheet", { number: "1" })).status, 400);
});
