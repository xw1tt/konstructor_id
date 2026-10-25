// План 14, задача 5: комплект по шаблону «ТИ» — реестр в вёрстке «ТИ», документы РМ, РП, ВД, КЖ.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { registryRows } from "@idk/shared/kit/registry";
import { buildKitRequest } from "@idk/shared/kit/request";
import { BUILTIN_TI } from "@idk/shared/forms/template";
import { tiRegistryHtml } from "@idk/server/kit/templates";
import { closeBrowser } from "@idk/server/print/browser";
import { kitRecords } from "../../shared/test/fixtures/kitBook.ts";
import { AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { startTestServer } from "./helpers/server.ts";
import { pdfPages } from "./helpers/pdftext.ts";

after(() => closeBrowser());
const SECTION = "КУТ03-Р-ПИР-2-26-100-АОВ1.01.00";

test("HTML реестра «ТИ»: стороны, заголовок, графы, страницы без «л.», Сдал/Принял", () => {
  const h = tiRegistryHtml({
    customer: 'ООО "СБД"', contractor: 'ООО "Велесстрой"', object: "Объект", code: SECTION, sectionName: "Раздел", number: "1",
    rows: [{ n: 1, name: "Акт освидетельствования скрытых работ", number: "№1", date: "29.05.2026 г.", sheets: 1, copies: 1, code: "", pages: "л. 9-10" }],
  });
  assert.match(h, /Заказчик: ООО &quot;СБД&quot;/);
  assert.match(h, /Подрядчик: ООО &quot;Велесстрой&quot;/);
  assert.match(h, new RegExp(`Реестр №1/${SECTION.replace(/\./g, "\\.")}\\.Р`));
  assert.match(h, /Исполнительной документации/);
  for (const g of ["№п/п", "Наименование документа", "№ документа", "Дата документа", "Кол-во листов", "Страницы по списку"]) assert.ok(h.includes(g), g);
  assert.match(h, /<td class="c">9-10<\/td>/);
  assert.match(h, /\(шифр проекта\)/);
  assert.match(h, /Сдал:/);
  assert.match(h, /Принял:/);
  assert.match(h, /\(Ф\.И\.О\.\)/);
});

test("сборка комплекта по шаблону «ТИ»: реестр «ТИ», документы РМ, РП, ВД, КЖ в PDF", async () => {
  const recs = kitRecords((r: any) => { r["Комплекты"][0]["Титул"] = "нет"; r["Комплекты"][0]["Корешки"] = "нет"; });
  recs["РеестрИД"] = registryRows(await readBook(new MemoryWorkbook(kitRecords())), "1", BUILTIN_TI).rows.map((x) => x.values)
    .filter((v) => ["АОСР", "РИМ", "РП", "ВД", "КЖ"].includes(String(v["Вид"])));
  const { request, issues } = buildKitRequest(await readBook(new MemoryWorkbook(recs)), "1", defaultImportant(), "ti", BUILTIN_TI.print, new Date("2026-10-25"), BUILTIN_TI);
  assert.deepEqual(issues, []);
  const s = await startTestServer();
  const job = await s.req("POST", "/api/kit-jobs", request);
  assert.equal(job.status, 201, JSON.stringify(job.json));
  const pages = await pdfPages(new Uint8Array(await (await s.raw("GET", `/api/kit-jobs/${job.json.id}`)).arrayBuffer()));
  assert.match(pages[0], new RegExp(`Реестр №1/${SECTION.replace(/\./g, "\\.")}\\.Р`));
  assert.match(pages[0], /Страницы по списку/);
  assert.match(pages[0], new RegExp(`${AOV1.replace(/\./g, "\\.")}\\.РП`));
  const all = pages.join(" ");
  assert.match(all, /применённых материалов/);
  assert.match(all, /документов, подтверждающих соответствие работ/);
  assert.match(all, /СМОНТИРОВАННОГО ЭЛЕКТРООБОРУДОВАНИЯ/);
  assert.match(all, new RegExp(`Кабельный журнал №${AOV1.replace(/\./g, "\\.")}\\.КЖ`));
});
