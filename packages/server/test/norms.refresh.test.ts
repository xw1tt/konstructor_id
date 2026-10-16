import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { openDb } from "@idk/server/db";
import { normCatalog } from "@idk/server/repo/normCatalog";
import { createRefresher } from "@idk/server/norms/refresh";
import { NORM_SECTIONS } from "@idk/shared/normCatalog";
import { startTestServer } from "./helpers/server.ts";
import { tmpDir } from "./helpers/tmp.ts";

const tr = (section: string, d: string, uuid: string) =>
  `<tr><td><a href="/${section === "foundational" ? "gost" : section}/details/${uuid}">${d}</a></td><td>Наименование ${d}</td><td>5</td><td>Действует</td></tr>`;
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const html = (body: string) => new Response(`<html><body><table>${body}</table></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

/** Портал-заглушка: sp — 2 страницы (2 + 1 строка, «Стр. 1 из 2»), остальные — по одной строке на первой странице. */
function portal(tag = "", overrides: Record<string, () => Promise<Response>> = {}) {
  let n = 0;
  const calls: string[] = [];
  const f = (async (input: any) => {
    const url = String(input);
    calls.push(url);
    if (overrides[url]) return overrides[url]();
    const sec = NORM_SECTIONS.find((s) => url.startsWith(s.url + "?"))!;
    const page = Number(new URL(url).searchParams.get("page"));
    if (sec.code === "sp") {
      if (page === 1) return html(`<p>Стр. 1 из 2</p>` + tr("sp", `СП 1${tag}`, uuid(++n)) + tr("sp", `СП 2${tag}`, uuid(++n)));
      return html(tr("sp", `СП 3${tag}`, uuid(++n)));
    }
    return page === 1 ? html(tr(sec.code, `${sec.label} 1${tag}`, uuid(++n))) : html("");
  }) as typeof fetch;
  return { f, calls };
}

const fresh = () => openDb(join(tmpDir(), "db.sqlite"));
const now = () => new Date("2026-10-17T00:00:00.000Z");

test("обход всех разделов и страниц", async () => {
  const db = fresh();
  const { f, calls } = portal();
  const r = createRefresher(db, { fetchImpl: f, sleep: async () => {}, now });
  assert.equal(r.start(), true);
  await r.done();
  assert.equal(r.state().error, null);
  assert.equal(r.state().running, false);
  assert.equal(r.state().finishedAt, "2026-10-17T00:00:00.000Z");
  assert.equal(normCatalog(db).search({ section: "sp" }).total, 3);
  assert.equal(normCatalog(db).search({}).total, 8);
  assert.ok(calls.includes("https://protect.gost.ru/sp?page=2"));
  assert.ok(!calls.includes("https://protect.gost.ru/sp?page=3"));
});

test("сбой на середине раздела — раздел не меняется, ранее обновлённые остаются", async () => {
  const db = fresh();
  await (async () => { const r = createRefresher(db, { fetchImpl: portal().f, sleep: async () => {}, now }); r.start(); await r.done(); })();
  const { f } = portal(" нов", { "https://protect.gost.ru/gost?page=2": async () => { throw new TypeError("fetch failed"); } });
  const r = createRefresher(db, { fetchImpl: f, sleep: async () => {}, now });
  r.start(); await r.done();
  assert.equal(r.state().error, "Нет связи с порталом protect.gost.ru");
  const N = normCatalog(db);
  assert.deepEqual(N.search({ section: "sp" }).items.map((i) => i.designation), ["СП 1 нов", "СП 2 нов", "СП 3 нов"]);
  assert.deepEqual(N.search({ section: "gost" }).items.map((i) => i.designation), ["ГОСТ 1"]);
  assert.equal(N.search({ section: "rst" }).items[0].designation, "Правила 1");
});

test("первая страница раздела без строк — ошибка разбора; ответ не HTML — тоже", async () => {
  const db = fresh();
  const { f } = portal("", { "https://protect.gost.ru/sp?page=1": async () => html("<p>Войдите</p>") });
  const r = createRefresher(db, { fetchImpl: f, sleep: async () => {}, now });
  r.start(); await r.done();
  assert.equal(r.state().error, "Не удалось разобрать список раздела «СП» — возможно, портал изменил вёрстку");
  assert.equal(normCatalog(db).search({}).total, 0);
  const json = portal("", { "https://protect.gost.ru/sp?page=1": async () => new Response("{}", { headers: { "content-type": "application/json" } }) });
  const r2 = createRefresher(db, { fetchImpl: json.f, sleep: async () => {}, now });
  r2.start(); await r2.done();
  assert.equal(r2.state().error, "Не удалось разобрать список раздела «СП» — возможно, портал изменил вёрстку");
  const bad = portal("", { "https://protect.gost.ru/sp?page=1": async () => new Response("", { status: 503 }) });
  const r3 = createRefresher(db, { fetchImpl: bad.f, sleep: async () => {}, now });
  r3.start(); await r3.done();
  assert.equal(r3.state().error, "Нет связи с порталом protect.gost.ru");
});

test("заголовок User-Agent и пауза между запросами", async () => {
  const db = fresh();
  const seen: string[] = [];
  const pauses: number[] = [];
  const base = portal();
  const f = (async (u: any, init?: RequestInit) => { seen.push(new Headers(init?.headers).get("user-agent") ?? ""); return base.f(u, init); }) as typeof fetch;
  const r = createRefresher(db, { fetchImpl: f, sleep: async (ms) => { pauses.push(ms); }, now });
  r.start(); await r.done();
  assert.ok(seen.every((h) => h === "Konstruktor-ID (справочник нормативов)"));
  assert.ok(pauses.length >= seen.length - 1 && pauses.every((p) => p === 300));
});

test("повторный запуск во время обхода — 409; GET — состояние", async () => {
  let release!: () => void;
  const gate = new Promise<void>((res) => (release = res));
  const base = portal();
  const f = (async (u: any, i?: RequestInit) => { await gate; return base.f(u, i); }) as typeof fetch;
  const s = await startTestServer({ fetchImpl: f, sleep: async () => {} });
  const a = await s.req("POST", "/api/norms/refresh");
  assert.equal(a.status, 202);
  assert.equal(a.json.running, true);
  const b = await s.req("POST", "/api/norms/refresh");
  assert.equal(b.status, 409);
  assert.equal(b.json.error, "Обновление уже идёт");
  const st = await s.req("GET", "/api/norms/refresh");
  assert.equal(st.json.section, "sp");
  release();
  for (let i = 0; i < 50 && (await s.req("GET", "/api/norms/refresh")).json.running; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal((await s.req("GET", "/api/norms?section=sp")).json.total, 3);
});

test("ревью: страница входа на 2-й из 3 страниц — раздел не меняется, ошибка разбора", async () => {
  const db = fresh();
  normCatalog(db).replaceSection("sp", [{ designation: "СП старый", title: "т", pages: 1, status: "Действует", url: "https://protect.gost.ru/sp/details/old" }], "2026-10-01T00:00:00.000Z");
  const page = (n: number) => html(`<p>Стр. ${n} из 3</p>` + tr("sp", `СП ${n}`, uuid(n)));
  const f = (async (u: any) => {
    const url = String(u);
    if (url === "https://protect.gost.ru/sp?page=1") return page(1);
    if (url === "https://protect.gost.ru/sp?page=2") return html("<p>Войдите</p>");
    return page(3);
  }) as typeof fetch;
  const r = createRefresher(db, { fetchImpl: f, sleep: async () => {}, now });
  r.start(); await r.done();
  assert.equal(r.state().error, "Не удалось разобрать список раздела «СП» — возможно, портал изменил вёрстку");
  assert.deepEqual(normCatalog(db).search({ section: "sp" }).items.map((i) => i.designation), ["СП старый"]);
});

test("ревью: портал игнорирует номер страницы (повторяет последнюю) — обход раздела останавливается", async () => {
  const db = fresh();
  let spCalls = 0;
  const base = portal();
  const f = (async (u: any, i?: RequestInit) => {
    const url = String(u);
    if (url.startsWith("https://protect.gost.ru/sp?")) { spCalls++; return html(tr("sp", "СП 1", uuid(1)) + tr("sp", "СП 2", uuid(2))); }
    return base.f(u, i);
  }) as typeof fetch;
  const r = createRefresher(db, { fetchImpl: f, sleep: async () => {}, now });
  r.start(); await r.done();
  assert.equal(r.state().error, null);
  assert.equal(spCalls, 2);
  assert.equal(normCatalog(db).search({ section: "sp" }).total, 2);
});
