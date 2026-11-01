// Панель: PDF схемы трассы → скан в «Исполнительные схемы» (новая строка, затем обновление той же строки).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { routeFromBook } from "@idk/shared/scheme/fromBook";
import { saveSchemePdf, schemeFileName, schemePdf } from "@idk/addin/panel/scheme";

const init = () => new MemoryWorkbook({
  "Акты": [{ "Номер акта": "СКС-5" }],
  "Трассы": [{ "Номер схемы": "ИС/1", "Акт": "СКС-5", "Наименование": "Трасса СКС", "Дата": "20.10.2026" }],
  "ТрассыТочки": [
    { "Схема": "ИС/1", "Точка": "a", "Смещение X, мм": 0, "Смещение Y, мм": 0 },
    { "Схема": "ИС/1", "Точка": "b", "Смещение X, мм": 6000, "Смещение Y, мм": 0 },
  ],
  "ТрассыУчастки": [{ "Схема": "ИС/1", "Откуда": "a", "Куда": "b", "Способ прокладки": "Лоток кабельный", "Марка": "ЛМ 100×50" }],
});

test("сохранение: PDF загружен, строка «Схем» со сканом; повтор — та же строка", async () => {
  const wb = init();
  const book = await readBook(wb);
  const { scheme } = routeFromBook(book, "ИС/1");
  assert.ok(scheme);
  const uploads: string[] = [];
  const deps = {
    pdf: async () => new Blob(["%PDF"], { type: "application/pdf" }),
    upload: async (_b: Blob, name: string) => { uploads.push(name); return { id: 7, sha256: "", name, mime: "application/pdf", size: 4, pages: 1 }; },
  };
  const r = await saveSchemePdf(wb, book, "ИС/1", scheme, "https://localhost:3443", deps);
  assert.equal(r.added, true);
  assert.deepEqual(uploads, ["Схема ИС_1.pdf"]);
  const t = (await wb.read("Схемы"))!;
  assert.equal(t.rows.length, 1);
  const at = (h: string) => t.rows[0]![t.headers.indexOf(h)];
  assert.deepEqual([at("Акт"), at("Вид"), at("Номер"), at("Наименование"), at("Дата"), at("Скан")],
    ["СКС-5", "Схема", "ИС/1", "Трасса СКС", "20.10.2026", "Схема ИС_1.pdf"]);
  assert.equal(t.links[0]![t.headers.indexOf("Скан")], "https://localhost:3443/api/files/7");

  const again = await saveSchemePdf(wb, await readBook(wb), "ИС/1", scheme, "https://localhost:3443", deps);
  assert.equal(again.added, false);
  assert.equal((await wb.read("Схемы"))!.rows.length, 1);
});

test("schemePdf: ошибка сервера — текстом; нет сервера — «Сервер не запущен»", async () => {
  const { scheme } = routeFromBook(await readBook(init()), "ИС/1");
  await assert.rejects(schemePdf(scheme!, (async () => new Response(JSON.stringify({ error: "Не найден браузер" }), { status: 503 })) as typeof fetch), /Не найден браузер/);
  await assert.rejects(schemePdf(scheme!, (async () => { throw new TypeError("fetch failed"); }) as typeof fetch), /Сервер не запущен/);
  assert.equal(schemeFileName("A:B"), "Схема A_B.pdf");
});
