import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";

async function setup() {
  const s = await startTestServer();
  const org = (await s.req("POST", "/api/organizations", { shortName: 'ООО "Велесстрой"', fullName: "x" })).json;
  const obj = (await s.req("GET", "/api/object")).json;
  await s.req("PUT", "/api/object", { ...obj, roles: { ...obj.roles, performer: org.id } });
  const sec = (await s.req("POST", "/api/sections", { code: "КУТ03-Р-ПИР-2-26-100-АОВ1.01.00", name: "АОВ" })).json;
  const m1 = (await s.req("POST", "/api/materials", { name: "Кабель", unit: "м." })).json;
  const m2 = (await s.req("POST", "/api/materials", { name: "Труба", unit: "м." })).json;
  return { s, org, sec, m1, m2 };
}

test("acts: создать и прочитать с умолчаниями", async () => {
  const { s, org, sec } = await setup();
  const c = await s.req("POST", "/api/acts", { baseNumber: "К32.В.СТ.АОВ1.01.00.1", date: "2026-07-28" });
  assert.equal(c.status, 201);
  assert.equal(c.json.sectionId, sec.id);
  assert.equal(c.json.performerOrgId, org.id);
  assert.equal(c.json.copies, 4);
  assert.equal(c.json.vorTitle, "АОВ");
  const u = await s.req("PUT", `/api/acts/${c.json.id}`, { ...c.json, works: "Монтаж кабельных линий" });
  assert.equal(u.json.works, "Монтаж кабельных линий");
  assert.equal((await s.req("GET", "/api/acts")).json.length, 1);
});

test("acts: замена материалов — порядок сохраняется", async () => {
  const { s, m1, m2 } = await setup();
  const a = (await s.req("POST", "/api/acts", { baseNumber: "A1", date: "2026-07-28" })).json;
  const r = await s.req("PUT", `/api/acts/${a.id}/materials`, [
    { materialId: m2.id, sortOrder: 1, quantity: 5 },
    { materialId: m1.id, sortOrder: 0 },
  ]);
  assert.equal(r.status, 200);
  const full = (await s.req("GET", `/api/acts/${a.id}/full`)).json;
  assert.deepEqual(full.materials.map((m: any) => [m.materialId, m.quantity, m.position]), [[m1.id, null, "б/н"], [m2.id, 5, "б/н"]]);
});

test("acts: ВОР — строки с группами; документы п.4", async () => {
  const { s, m1 } = await setup();
  const a = (await s.req("POST", "/api/acts", { baseNumber: "A1", date: "2026-07-28" })).json;
  await s.req("PUT", `/api/acts/${a.id}/vor`, [
    { group: "Этаж П5", materialId: m1.id, quantity: 430, sortOrder: 0 },
    { group: "Этаж П4", materialId: m1.id, quantity: 436.6, sortOrder: 1 },
  ]);
  await s.req("PUT", `/api/acts/${a.id}/documents`, [{ kind: "scheme", number: "A1.1", name: "Схема", sortOrder: 0 }]);
  const full = (await s.req("GET", `/api/acts/${a.id}/full`)).json;
  assert.deepEqual(full.vor.map((v: any) => [v.group, v.quantity]), [["Этаж П5", 430], ["Этаж П4", 436.6]]);
  assert.equal(full.documents[0].kind, "scheme");
});

test("acts: удаление акта удаляет его строки, но не материалы", async () => {
  const { s, m1 } = await setup();
  const a = (await s.req("POST", "/api/acts", { baseNumber: "A1", date: "2026-07-28" })).json;
  await s.req("PUT", `/api/acts/${a.id}/materials`, [{ materialId: m1.id }]);
  assert.equal((await s.req("DELETE", `/api/acts/${a.id}`)).status, 204);
  assert.equal((await s.req("GET", "/api/materials")).json.length, 2);
  assert.equal((await s.req("DELETE", `/api/materials/${m1.id}`)).status, 204);
});

test("materials: удаление используемого → 409", async () => {
  const { s, m1 } = await setup();
  const a = (await s.req("POST", "/api/acts", { baseNumber: "К32.В.СТ.АОВ1.01.00.1", date: "2026-07-28" })).json;
  await s.req("PUT", `/api/acts/${a.id}/vor`, [{ group: "", materialId: m1.id, quantity: 1 }]);
  const d = await s.req("DELETE", `/api/materials/${m1.id}`);
  assert.equal(d.status, 409);
  assert.match(d.json.error, /К32\.В\.СТ\.АОВ1\.01\.00\.1/);
});

test("acts: несуществующий материал в строках → 400, прежние строки целы", async () => {
  const { s, m1 } = await setup();
  const a = (await s.req("POST", "/api/acts", { baseNumber: "A1", date: "2026-07-28" })).json;
  await s.req("PUT", `/api/acts/${a.id}/materials`, [{ materialId: m1.id }]);
  const r = await s.req("PUT", `/api/acts/${a.id}/materials`, [{ materialId: 999 }]);
  assert.equal(r.status, 400);
  assert.equal((await s.req("GET", `/api/acts/${a.id}/full`)).json.materials.length, 1);
});

test("acts: несуществующий акт → 404", async () => {
  const { s } = await setup();
  const a = await s.req("GET", "/api/acts/999/full");
  assert.equal(a.status, 404);
  assert.equal(a.json.error, "Акт не найден");
  const b = await s.req("PUT", "/api/acts/999/vor", []);
  assert.equal(b.status, 404);
  assert.equal(b.json.error, "Акт не найден");
});
