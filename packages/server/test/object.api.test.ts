import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";

const org = (shortName: string) => ({ shortName, fullName: shortName + " полное" });

test("organizations: создать, прочитать, изменить, удалить", async () => {
  const s = await startTestServer();
  const c = await s.req("POST", "/api/organizations", org("ООО Тест"));
  assert.equal(c.status, 201);
  assert.equal(c.json.shortName, "ООО Тест");
  assert.equal(c.json.inn, "");
  const id = c.json.id;
  assert.equal((await s.req("GET", `/api/organizations/${id}`)).json.shortName, "ООО Тест");
  const u = await s.req("PUT", `/api/organizations/${id}`, { ...org("ООО Тест2"), inn: "7736323532" });
  assert.equal(u.json.inn, "7736323532");
  assert.equal((await s.req("GET", "/api/organizations")).json.length, 1);
  assert.equal((await s.req("DELETE", `/api/organizations/${id}`)).status, 204);
  assert.equal((await s.req("GET", `/api/organizations/${id}`)).status, 404);
});

test("organizations: кириллица и кавычки сохраняются без изменений", async () => {
  const s = await startTestServer();
  for (const name of ["ООО «СБД»", 'ООО "МАРКС ИНЖИНИРИНГ"', "Письмо № 2448 ∅20"]) {
    const c = await s.req("POST", "/api/organizations", org(name));
    assert.equal((await s.req("GET", `/api/organizations/${c.json.id}`)).json.shortName, name);
  }
});

test("organizations: удаление используемой → 409", async () => {
  const s = await startTestServer();
  const { json: o } = await s.req("POST", "/api/organizations", org('ООО "СБД"'));
  const obj = (await s.req("GET", "/api/object")).json;
  await s.req("PUT", "/api/object", { ...obj, roles: { ...obj.roles, developer: o.id } });
  const d = await s.req("DELETE", `/api/organizations/${o.id}`);
  assert.equal(d.status, 409);
  assert.match(d.json.error, /застройщик/i);
  assert.equal((await s.req("GET", `/api/organizations/${o.id}`)).status, 200);
});

test("organizations: удаление при наличии представителей → 409", async () => {
  const s = await startTestServer();
  const { json: o } = await s.req("POST", "/api/organizations", org("ООО Велесстрой"));
  await s.req("POST", "/api/representatives", { role: "performer", fullName: "Востров В.П.", orgId: o.id });
  const d = await s.req("DELETE", `/api/organizations/${o.id}`);
  assert.equal(d.status, 409);
  assert.match(d.json.error, /представител/i);
});

test("object: роли сохраняются, одна организация в двух ролях", async () => {
  const s = await startTestServer();
  const { json: o } = await s.req("POST", "/api/organizations", org('ООО "СБД"'));
  const put = await s.req("PUT", "/api/object", {
    name: "Корпус «В»", address: "г. Москва", contractNumber: "КУТ03-Р-СМР-36-26", contractDate: "2026-01-15",
    city: "Москва", roles: { developer: o.id, builder: o.id, designer: null, performer: null },
  });
  assert.equal(put.status, 200);
  const g = (await s.req("GET", "/api/object")).json;
  assert.equal(g.roles.developer, o.id);
  assert.equal(g.roles.builder, o.id);
  assert.equal(g.roles.designer, null);
  assert.equal(g.contractNumber, "КУТ03-Р-СМР-36-26");
});

test("sections: создать и изменить", async () => {
  const s = await startTestServer();
  const c = await s.req("POST", "/api/sections", { code: "КУТ03-Р-ПИР-2-26-100-АОВ1.01.00", name: "АОВ" });
  assert.equal(c.status, 201);
  const u = await s.req("PUT", `/api/sections/${c.json.id}`, { code: c.json.code, name: "Автоматизация" });
  assert.equal(u.json.name, "Автоматизация");
  assert.equal((await s.req("GET", "/api/sections")).json.length, 1);
});

test("representatives: active по роли и дате", async () => {
  const s = await startTestServer();
  const { json: o } = await s.req("POST", "/api/organizations", org("ООО Велесстрой"));
  await s.req("POST", "/api/representatives", { role: "performer", fullName: "Востров В.П.", orgId: o.id, sortOrder: 2 });
  await s.req("POST", "/api/representatives", {
    role: "performer", fullName: "Королёв А.А.", orgId: o.id, sortOrder: 1, validTo: "2026-07-31",
  });
  const a = await s.req("GET", "/api/representatives/active?role=performer&date=2026-07-31");
  assert.deepEqual(a.json.map((r: any) => r.fullName), ["Королёв А.А.", "Востров В.П."]);
  const b = await s.req("GET", "/api/representatives/active?role=performer&date=2026-08-01");
  assert.deepEqual(b.json.map((r: any) => r.fullName), ["Востров В.П."]);
});

test("api: неверный JSON → 400, ошибка проверки → 400 с полями", async () => {
  const s = await startTestServer();
  const bad = await s.req("POST", "/api/organizations", "{not json");
  assert.equal(bad.status, 400);
  const inv = await s.req("POST", "/api/organizations", { fullName: "x" });
  assert.equal(inv.status, 400);
  assert.match(inv.json.error, /краткое наименование/);
});

test("api: неизвестный путь → 404", async () => {
  const s = await startTestServer();
  const r = await s.req("GET", "/api/nope");
  assert.equal(r.status, 404);
  assert.ok(r.json.error);
});
