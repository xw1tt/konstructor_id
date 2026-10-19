// План 9: печать разделов 3 и 5 общего журнала работ.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { isoToExcelSerial } from "@idk/shared/workbook/values";
import { fillOjr, ojrPrintRequest } from "@idk/shared/ojr";
import { closeBrowser } from "@idk/server/print/browser";
import { startTestServer } from "./helpers/server.ts";
import { pdfPages } from "./helpers/pdftext.ts";
import { aov1Records } from "../../shared/test/fixtures/aov1Book.ts";

after(() => closeBrowser());

async function book(days = ["2026-10-03", "2026-10-15"]) {
  const r: any = aov1Records();
  r["Объект"].push({ "Поле": "Условия производства работ", "Значение": "+18 °С, в помещении" });
  Object.assign(r["Акты"][0], { "Начало работ": isoToExcelSerial(days[0]), "Окончание работ": isoToExcelSerial(days[1]) });
  const wb = new MemoryWorkbook(r);
  await fillOjr(wb, await readBook(wb));
  return readBook(wb);
}

async function pdf(s: Awaited<ReturnType<typeof startTestServer>>, body: unknown) {
  const r = await s.req("POST", "/api/ojr-jobs", body);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const res = await s.raw("GET", `/api/ojr-jobs/${r.json.id}`);
  assert.equal(res.status, 200);
  return pdfPages(new Uint8Array(await res.arrayBuffer()));
}

test("раздел 3: шапка по форме, номера граф, даты по порядку", async () => {
  const s = await startTestServer();
  const pages = await pdf(s, ojrPrintRequest(await book(), 3));
  const t = pages.join(" ");
  assert.match(t, /Раздел 3\. Сведения о выполнении работ в процессе строительства, реконструкции, капитального ремонта объекта капитального строительства/);
  assert.match(t, /Условия производства работ/);
  assert.match(t, /1 2 3 4 5/);
  assert.match(t, /1 03\.10\.2026 \+18 °С, в помещении Монтаж кабельных линий/);
  assert.match(t, /11 15\.10\.2026/);
  assert.doesNotMatch(t, /04\.10\.2026/);
  assert.match(t, /Страница 1 из 1/);
});

test("раздел 3 на несколько страниц: шапка таблицы на каждой", async () => {
  const s = await startTestServer();
  const pages = await pdf(s, ojrPrintRequest(await book(["2026-01-01", "2026-06-30"]), 3));
  assert.ok(pages.length >= 3, `страниц ${pages.length}`);
  for (const p of pages) assert.match(p, /Дата выполнения работ/);
});

test("раздел 5: документы с датами и подписавшими", async () => {
  const s = await startTestServer();
  const t = (await pdf(s, ojrPrintRequest(await book(), 5))).join(" ");
  assert.match(t, /Раздел 5\. Перечень исполнительной документации/);
  assert.match(t, /Акт освидетельствования скрытых работ №К32\.В\.СТ\.АОВ1\.01\.00\.1\.АОСР/);
  assert.match(t, /28\.07\.2026 г\. Ведущий инженер/);
  assert.match(t, /Исполнительная схема №К32\.В\.СТ\.АОВ1\.01\.00\.1/);
});

test("пустой лист — нечего печатать; неверное тело — 400", async () => {
  const empty = await readBook(new MemoryWorkbook({}));
  assert.equal(ojrPrintRequest(empty, 3), null);
  const s = await startTestServer();
  assert.equal((await s.req("POST", "/api/ojr-jobs", { section: 3, rows: [] })).status, 400);
});
