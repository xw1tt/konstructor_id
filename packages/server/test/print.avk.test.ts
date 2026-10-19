// План 8: печать акта входного контроля из пакета книги.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { closeBrowser } from "@idk/server/print/browser";
import { startTestServer } from "./helpers/server.ts";
import { pdfPages } from "./helpers/pdftext.ts";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

after(() => closeBrowser());

test("АВК АОВ1: шапка, комиссия, 20 материалов, подписи", async () => {
  const s = await startTestServer();
  const b = buildBundle(await readBook(aov1Book()), AOV1, defaultImportant()).bundle!;
  const r = await s.raw("POST", "/api/print/avk", { headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  assert.equal(r.status, 200, await r.clone().text());
  assert.match(decodeURIComponent(r.headers.get("content-disposition") ?? ""), /АВК 01_АОВ1\.01\.00\.pdf/);
  const t = (await pdfPages(new Uint8Array(await r.arrayBuffer()))).join(" ");
  assert.match(t, /Акт входного контроля, технических средств и материалов № 01\/АОВ1\.01\.00/);
  assert.match(t, /Адрес : Москва/);
  assert.match(t, /Дата составления: 05\.06\.2026 г\./);
  assert.match(t, /Заказчик: ООО "СБД"/);
  assert.match(t, /Представитель заказчика: Ведущий инженер по автоматике и слаботочным системам ООО "СБД" Валерьянов А\.А\./);
  assert.match(t, /Представитель монтажной организации: Начальник участка ООО "ТехноИнжиниринг" Востров В\.П\./);
  assert.match(t, /авторского надзора : КУТ03-Р-ПИР-2-26-100-АОВ1\.01\.00/);
  assert.match(t, /1618,9 м\./);
  assert.match(t, /паспорт качества: №3\/405 от 09\.05\.2025 г\. сертификат соответствия/);
  assert.match(t, /\b20 /);
  assert.equal(t.match(/Должность\/ФИО\/Подпись/g)?.length, 2);
});
