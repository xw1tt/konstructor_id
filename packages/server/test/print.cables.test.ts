import { test, after } from "node:test";
import assert from "node:assert/strict";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildCableBundle } from "@idk/shared/workbook/cables";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { closeBrowser } from "@idk/server/print/browser";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { startTestServer } from "./helpers/server.ts";
import { pdfPages } from "./helpers/pdftext.ts";

after(() => closeBrowser());

const cableBundle = async (kind: "kj" | "ip", n?: number) => {
  const b = buildCableBundle(await readBook(aov1Book()), AOV1, defaultImportant(), kind).bundle!;
  if (n) {
    const r0 = b.cables!.rows[0];
    b.cables!.rows = Array.from({ length: n }, (_, i) => ({ ...r0, designation: `Л-${i + 1}` }));
  }
  return b;
};

async function pdf(doc: string, bundle: unknown) {
  const s = await startTestServer();
  const r = await s.raw("POST", `/api/print/${doc}`, { headers: { "content-type": "application/json" }, body: JSON.stringify(bundle) });
  if (r.status !== 200) return { status: r.status, json: await r.json(), pages: [] as string[], sizes: [] as number[][], disposition: "" };
  const buf = new Uint8Array(await r.arrayBuffer());
  const d = await getDocument({ data: buf.slice() }).promise;
  const sizes: number[][] = [];
  for (let i = 1; i <= d.numPages; i++) { const v = (await d.getPage(i)).view; sizes.push([v[2], v[3]]); }
  return { status: 200, json: null, pages: await pdfPages(buf), sizes, disposition: r.headers.get("content-disposition") ?? "" };
}

test("КЖ АОВ1: 1 лист, шифр, ИТОГО 1618,9, подписи, Лист 1 Листов 1", async () => {
  const r = await pdf("kj", await cableBundle("kj"));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.pages.length, 1);
  assert.ok(r.sizes[0][1] > r.sizes[0][0], "книжная");
  const t = r.pages[0];
  for (const s of ["СБД-1436-АОВ1К1", "П2.Щ-АК2-17", "П5.Щ-АК2-12", "ИТОГО", "1618,9", "Востров", "Королев", "Валерьянов", "06.26",
    "Кабельный журнал", "ИД", "Велесстрой", "Подземная часть", "Взам. инв."]) assert.ok(t.includes(s), s);
  assert.match(t, /Стадия Лист Листов ИД 1 1/);
  assert.ok(r.disposition.includes(encodeURIComponent("СБД-1436-АОВ1К1.pdf")));
});

test("КЖ на 70 кабелей — 3 листа, «Листов» 3 на каждом, листы 1, 2, 3", async () => {
  const r = await pdf("kj", await cableBundle("kj", 70));
  assert.equal(r.pages.length, 3);
  r.pages.forEach((t, i) => {
    assert.ok(t.includes("СБД-1436-АОВ1К1"), `шифр на листе ${i + 1}`);
    assert.match(t, new RegExp(`Стадия Лист Листов ИД ${i + 1} 3`), `лист ${i + 1}: ${t.slice(-400)}`);
  });
  assert.ok(r.pages[2].includes("Л-70") && r.pages[2].includes("ИТОГО"));
});

test("протокол АОВ1: альбомный, 25 строк, значения, приборы, подписи", async () => {
  const r = await pdf("ip", await cableBundle("ip"));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.sizes[0][0] > r.sizes[0][1], "альбомная");
  assert.ok(r.pages.length >= 3 && r.pages.length <= 5, `страниц ${r.pages.length}`);
  const t = r.pages.join(" ");
  for (const s of ["Протокол №1", "проверки сопротивления изоляции", "Температура воздуха 20 °C", "Влажность воздуха 60 %",
    "приемо-сдаточные", "ПУЭ 7 изд. 1.8.37 п.1, таблица 1.8.34", "П2.Щ-АК2-17; RS-485", "П5.Щ-АК2-12; RS-485", ">1000", "—",
    "Заказчик: ООО \"СБД\"", "05.06.2026 г. - 06.06.2026 г.", "№9305", "Ml3102Н CL", "RGKTH-10", "Рябов Е.А.", "Ходырев С.А.",
    "Проведена проверка целостности жил", "Заключение на соответствие требованиям НТД"]) assert.ok(t.includes(s), s);
  assert.ok(r.disposition.includes(encodeURIComponent(`${AOV1}.Протокол.pdf`)));
});

test("протокол на 200 линий — все строки по порядку, шапка таблицы на каждой странице", async () => {
  const r = await pdf("ip", await cableBundle("ip", 200));
  const t = r.pages.join(" ");
  assert.ok(t.includes("Л-200; RS-485"));
  assert.ok(t.indexOf("Л-199;") < t.indexOf("Л-200;"));
  assert.ok(r.pages.length > 8);
  for (const p of r.pages.slice(1, -1)) assert.ok(p.includes("Сопротивление изоляции"), "шапка таблицы");
});

test("kj/ip без кабелей в пакете — 400", async () => {
  const plain = buildBundle(await readBook(aov1Book()), AOV1, defaultImportant()).bundle!;
  const r = await pdf("kj", plain);
  assert.equal(r.status, 400);
  assert.equal(r.json.error, "В пакете нет данных кабельного журнала");
});
