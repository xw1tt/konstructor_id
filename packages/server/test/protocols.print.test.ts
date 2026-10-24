// План 13, задача 6: печать протоколов лаборатории и актов комиссии; сборка комплекта с ними.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildProtoBundle } from "@idk/shared/protocols/bundle";
import { registryRows } from "@idk/shared/kit/registry";
import { buildKitRequest } from "@idk/shared/kit/request";
import type { UserTemplate } from "@idk/shared/forms/template";
import { protoHtml } from "@idk/server/print/templates/proto";
import { closeBrowser } from "@idk/server/print/browser";
import { protoRecords, AOV1 } from "../../shared/test/fixtures/protoBook.ts";
import { startTestServer } from "./helpers/server.ts";
import { pdfPages } from "./helpers/pdftext.ts";

after(() => closeBrowser());

const d = (iso: string) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000) + 25569;
type Patch = Parameters<typeof protoRecords>[0];
const bundle = async (number: string, patch?: Patch) => {
  const r = buildProtoBundle(await readBook(new MemoryWorkbook(protoRecords(patch) as any)), number, defaultImportant());
  assert.deepEqual(r.issues, []);
  return r.bundle!;
};

async function pdf(doc: string, b: unknown) {
  const s = await startTestServer();
  const r = await s.raw("POST", `/api/print/${doc}`, { headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  assert.equal(r.status, 200, await r.clone().text());
  const buf = new Uint8Array(await r.arrayBuffer());
  const pd = await getDocument({ data: buf.slice() }).promise;
  const v = (await pd.getPage(1)).view;
  return { pages: await pdfPages(buf), landscape: v[2] > v[3], disposition: decodeURIComponent(r.headers.get("content-disposition") ?? "") };
}

test("HTML протокола лаборатории ПАВ: шапка лаборатории, заказчик, строки, результат, приборы, подписи", async () => {
  const h = protoHtml(await bundle("ПАВ-1"));
  assert.match(h, /Протокол №ПАВ-1/);
  assert.match(h, /проверки действия автоматических выключателей/);
  assert.match(h, /Заказчик: ООО &quot;СБД&quot;/);
  assert.match(h, /Дата проведения измерений: 15\.07\.2026 г\./);
  assert.match(h, /Температура воздуха 20 °C, влажность воздуха 60 %, атмосферное давление 750 мм рт\. ст\./);
  assert.match(h, /Предмет: Щит ЩР-1/);
  assert.match(h, /Нормативные и технические документы[^<]*: ПУЭ, п\. 1\.8\.37 \(3\)/);
  assert.equal((h.match(/<tr class="r">/g) ?? []).length, 2);
  assert.match(h, /<td>QF1<\/td>/);
  assert.match(h, /<td>соответствует<\/td>/);
  assert.match(h, /Перечень используемых средств измерений/);
  assert.match(h, /Руководитель электролаборатории/);
  assert.match(h, /Испытания провел/);
});

test("HTML акта комиссии АИИ: город и дата, состав комиссии, перечень, заключение, подписи членов", async () => {
  const h = protoHtml(await bundle("АИИ-1"));
  assert.match(h, /АКТ №АИИ-1/);
  assert.match(h, /о приемке электрооборудования после индивидуального испытания/);
  assert.match(h, /г\. Москва/);
  assert.match(h, /20\.07\.2026 г\./);
  assert.match(h, /Комиссия в составе:/);
  assert.match(h, /Технадзор застройщика: Ведущий инженер по автоматике и слаботочным системам ООО &quot;СБД&quot; Валерьянов А\.А\./);
  assert.match(h, /прошло индивидуальные испытания/);
  assert.equal((h.match(/class="sign-row"/g) ?? []).length, 5, "подпись каждого члена комиссии");
  assert.doesNotMatch(h, /средств измерений/);
});

test("PDF: ПАВ — альбомный, имя файла «ПАВ №ПАВ-1.pdf»; АИИ — книжный", async () => {
  const p = await pdf("pav", await bundle("ПАВ-1"));
  assert.ok(p.landscape);
  assert.match(p.pages.join(" "), /ПАВ-1/);
  assert.match(p.pages.join(" "), /соответствует/);
  assert.match(p.disposition, /ПАВ №ПАВ-1\.pdf/);
  const a = await pdf("aii", await bundle("АИИ-1"));
  assert.ok(!a.landscape);
  assert.match(a.pages.join(" "), /Комиссия в составе/);
});

test("PDF ПАВ на 200 строк: шапка таблицы на каждой странице, подписи — на последней", async () => {
  const b = await bundle("ПАВ-1", (r) => {
    const row = r["ЗамерыАвтоматов"][0];
    r["ЗамерыАвтоматов"] = Array.from({ length: 200 }, (_, i) => ({ ...row, "Обозначение по проекту": `QF${i + 1}` }));
  });
  const p = await pdf("pav", b);
  assert.ok(p.pages.length >= 4, String(p.pages.length));
  for (const [i, t] of p.pages.entries()) if (/QF\d/.test(t)) assert.match(t, /Время срабатывания факт/, `шапка на странице ${i + 1}`);
  assert.match(p.pages.join(" "), /QF200/);
  assert.match(p.pages.at(-1)!, /Испытания провел/);
});

test("PDF документов этапов 2 и 4: ПОКБ (комиссия, альбомный) и ПТСКС (лаборатория)", async () => {
  const patch: Patch = (r) => {
    r["Протоколы"].push(
      { "Документ": "ПОКБ", "№ документа": "ПОКБ-1", "Акт": AOV1, "Дата / начало": d("2026-06-04") },
      { "Документ": "ПТСКС", "№ документа": "ПТСКС-1", "Акт": AOV1, "Дата / начало": d("2026-06-07") },
    );
    r["ОсмотрБарабанов"] = [{ "№ документа": "ПОКБ-1", "№ барабана": "125", "Марка кабеля": "КПСнг(А)-FRLS 1х2х0,75", "Заключение по барабану": "годен к прокладке" }];
    r["ЗамерыСКС"] = [{ "№ документа": "ПТСКС-1", "Линия (порт)": "1.01", "Длина, м": 42, "Схема разводки": "PASS", "Запас NEXT, дБ": 4.2 }];
  };
  const k = await pdf("pokb", await bundle("ПОКБ-1", patch));
  assert.ok(k.landscape);
  const kt = k.pages.join(" ");
  assert.match(kt, /ПОКБ-1/);
  assert.match(kt, /без повреждений/, "значение по умолчанию столбца");
  assert.match(kt, /Филиппов М\.И\./, "стройконтроль подрядчика в комиссии");
  const s = await pdf("ptsks", await bundle("ПТСКС-1", patch));
  const st = s.pages.join(" ");
  assert.match(st, /ПТСКС-1/);
  assert.match(st, /соответствует/);
  assert.doesNotMatch(st, /влажность/, "только температура");
});

test("сборка комплекта с ПКЛ и ПАВ: строки реестра с «л.», документы в PDF", async () => {
  const tpl: UserTemplate = {
    id: "t-1", name: "Протоколы", print: { schemeEach: false },
    docs: [{ kind: "builtin", doc: "aosr", form: null }, { kind: "builtin", doc: "pkl", form: null }, { kind: "builtin", doc: "pav", form: null }],
  };
  const recs = protoRecords();
  recs["Комплекты"][0]["Титул"] = "нет";
  recs["Комплекты"][0]["Корешки"] = "нет";
  recs["РеестрИД"] = registryRows(await readBook(new MemoryWorkbook(protoRecords() as any)), "1", tpl).rows.map((x) => x.values)
    .filter((v) => ["АОСР", "Акт/протокол"].includes(String(v["Вид"])));
  const { request, issues } = buildKitRequest(await readBook(new MemoryWorkbook(recs as any)), "1", defaultImportant(), "sbd", undefined, new Date("2026-10-25"), tpl);
  assert.deepEqual(issues, []);
  const s = await startTestServer();
  const job = await s.req("POST", "/api/kit-jobs", request);
  assert.equal(job.status, 201, JSON.stringify(job.json));
  const res = await s.raw("GET", `/api/kit-jobs/${job.json.id}`);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const pages = await pdfPages(new Uint8Array(await res.arrayBuffer()));
  assert.match(pages[0], /№ПКЛ-1/);
  assert.match(pages[0], /№ПАВ-1/);
  assert.match(pages[0], /л\. \d/);
  assert.ok(pages.some((t) => /Протокол №ПАВ-1/.test(t)));
  assert.ok(pages.some((t) => /Протокол №ПКЛ-1/.test(t)));
});
