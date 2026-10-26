import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";
import { pdfPages } from "./helpers/pdftext.ts";
import { closeBrowser } from "@idk/server/print/browser";
import type { ActBundle } from "@idk/shared/workbook/bundle";
import { aov1Bundle } from "./helpers/aov1.ts";

after(() => closeBrowser());

async function seeded(patch?: (r: any) => void) {
  return { s: await startTestServer(), b: await aov1Bundle(patch) };
}
const pdf = async (s: Awaited<ReturnType<typeof startTestServer>>, b: ActBundle, doc: string) => {
  const r = await s.raw("POST", `/api/print/${doc}`, {
    headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  });
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(r.headers.get("content-type"), "application/pdf");
  return { pages: await pdfPages(new Uint8Array(await r.arrayBuffer())), disposition: r.headers.get("content-disposition") ?? "" };
};

test("pdf: АОСР контрольного примера — 2 страницы, текст содержит номер и «Востров В.П.»", async () => {
  const { s, b } = await seeded();
  const { pages, disposition } = await pdf(s, b, "aosr");
  assert.equal(pages.length, 2, pages.map((p) => p.slice(-80)).join("\n---\n"));
  const all = pages.join(" ");
  assert.ok(all.includes("К32.В.СТ.АОВ1.01.00.1.АОСР"));
  assert.ok(all.includes("Востров В.П."));
  assert.ok(disposition.includes(encodeURIComponent("К32.В.СТ.АОВ1.01.00.1.АОСР.pdf")));
});

test("pdf: РИМ на 40 строк — 2 страницы, шапка повторяется", async () => {
  const { s, b } = await seeded((r) => {
    const first = r["МатериалыАктов"][0]["Материал"];
    for (let i = 0; i < 16; i++) r["ДокументыКачества"].push({ "Материалы": first, "Тип": "Прочее", "Номер": `X-${i}`, "Дата": r["ДокументыКачества"][0]["Дата"], "Листов": 1 });
  });
  const { pages } = await pdf(s, b, "rim");
  assert.equal(pages.length, 2);
  assert.ok(pages[1].includes("Номер документа"), "шапка таблицы на 2-й странице");
});

test("pdf: ВД на 1 странице; ВОР — «Страница 1 из N», подписи не отрываются", async () => {
  const { s, b } = await seeded();
  const vd = await pdf(s, b, "vd");
  assert.equal(vd.pages.length, 1);
  assert.ok(vd.pages[0].includes("1618,9"));
  const vor = await pdf(s, b, "vor");
  const n = vor.pages.length;
  assert.ok(vor.pages[0].includes(`Страница 1 из ${n}`));
  const last = vor.pages[n - 1];
  assert.ok(last.includes("Представитель монтажной организации") && last.includes("(подпись)"), last.slice(0, 200));
});

test("pdf: неизвестный документ → 400", async () => {
  const { s, b } = await seeded();
  const r = await s.raw("POST", "/api/print/xxx", { headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  assert.equal(r.status, 400);
});
