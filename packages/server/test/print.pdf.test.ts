import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";
import { pdfPages } from "./helpers/pdftext.ts";
import { openDb } from "@idk/server/db";
import { seedSbdAov1 } from "@idk/server/seed/sbdAov1";
import { closeBrowser } from "@idk/server/print/browser";
import { join } from "node:path";

after(() => closeBrowser());

async function seeded() {
  const s = await startTestServer();
  const db = openDb(join(s.dataDir, "db.sqlite"));
  const { actId } = seedSbdAov1(db);
  return { s, db, actId };
}
const pdf = async (s: Awaited<ReturnType<typeof startTestServer>>, actId: number, doc: string) => {
  const r = await s.raw("GET", `/api/acts/${actId}/pdf/${doc}`);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(r.headers.get("content-type"), "application/pdf");
  return { pages: await pdfPages(new Uint8Array(await r.arrayBuffer())), disposition: r.headers.get("content-disposition") ?? "" };
};

test("pdf: АОСР контрольного примера — 2 страницы, текст содержит номер и «Востров В.П.»", async () => {
  const { s, actId } = await seeded();
  const { pages, disposition } = await pdf(s, actId, "aosr");
  assert.equal(pages.length, 2, pages.map((p) => p.slice(-80)).join("\n---\n"));
  const all = pages.join(" ");
  assert.ok(all.includes("К32.В.СТ.АОВ1.01.00.1.АОСР"));
  assert.ok(all.includes("Востров В.П."));
  assert.ok(disposition.includes(encodeURIComponent("К32.В.СТ.АОВ1.01.00.1.АОСР.pdf")));
});

test("pdf: РИМ на 30 строк — 2 страницы, шапка повторяется", async () => {
  const { s, db, actId } = await seeded();
  const matId = (db.prepare("SELECT material_id FROM act_materials WHERE act_id=? ORDER BY sort_order LIMIT 1").get(actId) as any).material_id;
  for (let i = 0; i < 6; i++) {
    const r = db.prepare("INSERT INTO quality_docs (type, number, issue_date, sheets) VALUES ('other', ?, '2025-01-01', 1)").run(`X-${i}`);
    db.prepare("INSERT INTO material_quality_docs (material_id, doc_id) VALUES (?, ?)").run(matId, r.lastInsertRowid);
  }
  const { pages } = await pdf(s, actId, "rim");
  assert.equal(pages.length, 2);
  assert.ok(pages[1].includes("Номер документа"), "шапка таблицы на 2-й странице");
});

test("pdf: ВД на 1 странице; ВОР — «Страница 1 из N», подписи не отрываются", async () => {
  const { s, actId } = await seeded();
  const vd = await pdf(s, actId, "vd");
  assert.equal(vd.pages.length, 1);
  assert.ok(vd.pages[0].includes("1618,9"));
  const vor = await pdf(s, actId, "vor");
  const n = vor.pages.length;
  assert.ok(vor.pages[0].includes(`Страница 1 из ${n}`));
  const last = vor.pages[n - 1];
  assert.ok(last.includes("Представитель монтажной организации") && last.includes("(подпись)"), last.slice(0, 200));
});

test("pdf: неизвестный документ → 400", async () => {
  const { s, actId } = await seeded();
  assert.equal((await s.raw("GET", `/api/acts/${actId}/pdf/xxx`)).status, 400);
});
