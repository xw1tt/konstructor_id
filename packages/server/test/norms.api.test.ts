import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { openDb } from "@idk/server/db";
import { normCatalog } from "@idk/server/repo/normCatalog";
import { startTestServer } from "./helpers/server.ts";

const row = (designation: string, title: string, pages = 10, status = "Действует", id = designation) =>
  ({ designation, title, pages, status, url: `https://protect.gost.ru/x/details/${encodeURIComponent(id)}` });

async function seeded() {
  const s = await startTestServer();
  const db = openDb(join(s.dataDir, "db.sqlite"));
  const N = normCatalog(db);
  N.replaceSection("sp", [
    row("СП 2.13130.2020", "Системы противопожарной защиты. Обеспечение огнестойкости объектов защиты", 32),
    row("СП 76.13330.2016", "Электротехнические устройства", 40),
  ], "2026-10-13T10:00:00.000Z");
  N.replaceSection("gost", [row("ГОСТ 10434-82", "Соединения контактные электрические", 12)], "2026-10-12T10:00:00.000Z");
  return { s, db, N };
}

test("поиск: регистр, «ё», несколько слов, счётчики", async () => {
  const { s } = await seeded();
  const r = await s.req("GET", "/api/norms?q=" + encodeURIComponent("ОГНЕСТОЙКОСТЁ сп 2.13130".replace("Ё", "И")));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.items.map((i: any) => i.designation), ["СП 2.13130.2020"]);
  assert.deepEqual(r.json.counts, { sp: 1, gost: 0, rst: 0, classificators: 0, tr: 0, foundational: 0 });
  const yo = await s.req("GET", "/api/norms?q=" + encodeURIComponent("соединёния"));
  assert.deepEqual(yo.json.items.map((i: any) => i.designation), ["ГОСТ 10434-82"]);
  const g = await s.req("GET", "/api/norms?section=gost");
  assert.equal(g.json.total, 1);
  assert.equal(g.json.counts.sp, 2);
  assert.equal(g.json.updated.sp, "2026-10-13T10:00:00.000Z");
  assert.equal(g.json.items[0].section, "gost");
  assert.equal(typeof g.json.items[0].id, "number");
});

test("замена раздела целиком и отказ чужих адресов", async () => {
  const { s, N } = await seeded();
  N.replaceSection("sp", [row("СП 1.13130.2020", "Эвакуационные пути"), { ...row("СП 9", "x"), url: "https://evil.ru/sp/details/1" }], "2026-10-14T10:00:00.000Z");
  const r = await s.req("GET", "/api/norms?section=sp");
  assert.deepEqual(r.json.items.map((i: any) => i.designation), ["СП 1.13130.2020"]);
});

test("неизвестный раздел — 400", async () => {
  const { s } = await seeded();
  const r = await s.req("GET", "/api/norms?section=xxx");
  assert.equal(r.status, 400);
  assert.equal(r.json.error, "Неизвестный раздел: xxx");
});

test("limit ограничен 500, offset работает, порядок портала", async () => {
  const { s, N } = await seeded();
  N.replaceSection("tr", Array.from({ length: 600 }, (_, i) => row(`ТР ${i}`, "т", 1, "Действует", `tr${i}`)), "2026-10-14T10:00:00.000Z");
  const r = await s.req("GET", "/api/norms?section=tr&limit=9999");
  assert.equal(r.json.items.length, 500);
  assert.equal(r.json.total, 600);
  const d = await s.req("GET", "/api/norms?section=tr&offset=598");
  assert.deepEqual(d.json.items.map((i: any) => i.designation), ["ТР 598", "ТР 599"]);
  assert.equal((await s.req("GET", "/api/norms?section=tr")).json.items.length, 100);
});
