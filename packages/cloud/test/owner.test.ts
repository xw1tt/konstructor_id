// План 23, задача 2: API владельца и администратора компании.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOwner } from "@idk/cloud/cli";
import { startCloud, type TestCloud } from "./helpers/cloud.ts";

const tokenOf = (link: string) => link.split("/invite/")[1];
async function login(c: TestCloud, link: string, password = "пароль-12345") {
  return (await c.req("POST", `/api/invites/${tokenOf(link)}`, { name: "Имя", password })).json.token as string;
}

test("владелец: тариф, компания, пополнение, корректировка, приостановка, приглашения; администратор — сотрудники в пределах мест", async () => {
  const c = await startCloud();
  const owner = await login(c, await createOwner(c.db, "owner@x.ru", "https://id.example.ru"));
  const o = { token: owner };
  const tariff = await c.req("POST", "/api/owner/tariffs", { name: "Базовый", seatMonthRub: 3100, aiPer1kRub: 0.5 }, o);
  assert.equal(tariff.status, 201);
  const t = await c.req("POST", "/api/owner/tenants", { name: "ООО Монтаж", inn: "7700000000", seats: 2, tariffId: tariff.json.id }, o);
  const tid = t.json.id;
  assert.equal((await c.req("POST", `/api/owner/tenants/${tid}/ledger`, { kind: "topup", amountRub: -5, reason: "x" }, o)).status, 400);
  assert.equal((await c.req("POST", `/api/owner/tenants/${tid}/ledger`, { kind: "topup", amountRub: 10000, reason: "" }, o)).status, 400, "причина обязательна");
  let st = await c.req("POST", `/api/owner/tenants/${tid}/ledger`, { kind: "topup", amountRub: 10000, reason: "Счёт №15 от 25.10.2026" }, o);
  assert.equal(st.json.balanceRub, 10000);
  st = await c.req("POST", `/api/owner/tenants/${tid}/ledger`, { kind: "adjust", amountRub: -250.5, reason: "Возврат за сбой" }, o);
  assert.equal(st.json.balanceRub, 9749.5);
  const adminLink = (await c.req("POST", `/api/owner/tenants/${tid}/invites`, { email: "admin@montazh.ru", role: "admin" }, o)).json.link;
  assert.match(adminLink, /^https:\/\/id\.example\.ru\/console\/#\/invite\//);
  const admin = await login(c, adminLink);
  const a = { token: admin };

  // Администратор: свои сотрудники и баланс; владельческие действия — 403.
  assert.equal((await c.req("GET", "/api/owner/tenants", undefined, a)).status, 403);
  assert.equal((await c.req("POST", `/api/owner/tenants/${tid}/ledger`, { kind: "topup", amountRub: 1e6, reason: "сам себе" }, a)).status, 403);
  const eng = await c.req("POST", "/api/company/invites", { email: "eng@montazh.ru", role: "engineer" }, a);
  assert.equal(eng.status, 201);
  const third = await c.req("POST", "/api/company/invites", { email: "eng2@montazh.ru", role: "engineer" }, a);
  assert.equal(third.status, 409, "мест 2: администратор + приглашённый инженер");
  assert.match(third.json.error, /Все рабочие места заняты \(2\)/);
  assert.equal((await c.req("POST", "/api/company/invites", { email: "tn@zakazchik.ru", role: "reviewer" }, a)).status, 201, "проверяющий — бесплатно");
  const engineer = await login(c, eng.json.link);
  assert.equal((await c.req("GET", "/api/company", undefined, { token: engineer })).status, 403);
  const me = await c.req("GET", "/api/me", undefined, { token: engineer });
  assert.equal(me.json.tenant.name, "ООО Монтаж");
  assert.equal(me.json.tenant.access, "active");
  assert.equal(me.json.tenant.balanceRub, 9749.5);
  const comp = await c.req("GET", "/api/company", undefined, a);
  assert.equal(comp.json.users.length, 2);
  assert.deepEqual(comp.json.ledger.map((l: any) => l.amountRub), [-250.5, 10000]);
  const engId = comp.json.users.find((u: any) => u.email === "eng@montazh.ru").id;
  assert.equal((await c.req("PUT", `/api/company/users/${engId}`, { status: "blocked" }, a)).status, 204);
  assert.equal((await c.req("GET", "/api/me", undefined, { token: engineer })).status, 401, "заблокированный выходит");

  // Чужая компания: администратор не видит, владелец приостанавливает.
  const other = (await c.req("POST", "/api/owner/tenants", { name: "ООО Другое" }, o)).json.id;
  assert.equal((await c.req("PUT", `/api/company/users/${engId}`, { status: "active" }, a)).status, 204);
  const otherAdmin = await login(c, (await c.req("POST", `/api/owner/tenants/${other}/invites`, { email: "a@other.ru", role: "admin" }, o)).json.link);
  assert.equal((await c.req("PUT", `/api/company/users/${engId}`, { status: "blocked" }, { token: otherAdmin })).status, 404);
  st = await c.req("POST", `/api/owner/tenants/${tid}/suspend`, { reason: "Неоплата" }, o);
  assert.equal(st.json.access, "suspended");
  assert.equal((await c.req("GET", "/api/me", undefined, a)).json.tenant.accessLabel, "приостановлен владельцем сервиса");
  await c.req("POST", `/api/owner/tenants/${tid}/resume`, {}, o);
  const list = await c.req("GET", "/api/owner/tenants", undefined, o);
  assert.deepEqual(list.json.map((x: any) => [x.name, x.access]), [["ООО Другое", "active"], ["ООО Монтаж", "active"]]);
  const audit = await c.req("GET", `/api/owner/audit?tenant=${tid}`, undefined, o);
  const actions = audit.json.map((x: any) => x.action);
  for (const act of ["tenant.create", "ledger.topup", "ledger.adjust", "tenant.suspend", "tenant.resume", "user.update"]) assert.ok(actions.includes(act), act);
});
