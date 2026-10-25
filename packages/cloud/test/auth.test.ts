// План 22, задача 2: учётные записи, вход, приглашения, CORS, журнал.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createOwner } from "@idk/cloud/cli";
import { Auth, tokenHash } from "@idk/cloud/auth";
import { startCloud, PANEL } from "./helpers/cloud.ts";

const tokenOf = (link: string) => link.split("/invite/")[1];

test("владелец: ссылка первого входа → пароль → вход; пароль и токен в базе — только хеши; /api/me; выход", async () => {
  const c = await startCloud();
  const link = await createOwner(c.db, "Owner@Example.ru", "https://id.example.ru/");
  assert.match(link, /^https:\/\/id\.example\.ru\/console\/#\/invite\/.+/);
  const info = await c.req("GET", `/api/invites/${tokenOf(link)}`);
  assert.deepEqual(info.json, { email: "owner@example.ru", role: "owner", tenant: null, existing: false, name: "" });
  assert.equal((await c.req("POST", `/api/invites/${tokenOf(link)}`, { name: "Владелец", password: "123" })).status, 400, "короткий пароль");
  const acc = await c.req("POST", `/api/invites/${tokenOf(link)}`, { name: "Владелец", password: "секретный-пароль" });
  assert.equal(acc.status, 201);
  assert.equal(acc.json.user.role, "owner");
  assert.equal((await c.req("POST", `/api/invites/${tokenOf(link)}`, { password: "другой-пароль" })).status, 410, "использовано");
  const [u] = await c.db.query<{ password_hash: string }>("SELECT password_hash FROM users");
  assert.match(u.password_hash, /^scrypt\$/);
  assert.ok(!u.password_hash.includes("секретный"));
  const [s] = await c.db.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
  assert.equal(s.token_hash, tokenHash(acc.json.token));
  const me = await c.req("GET", "/api/me", undefined, { token: acc.json.token });
  assert.deepEqual(me.json, { user: { id: acc.json.user.id, email: "owner@example.ru", name: "Владелец", role: "owner" }, tenant: null });
  await c.req("POST", "/api/auth/logout", undefined, { token: acc.json.token });
  assert.equal((await c.req("GET", "/api/me", undefined, { token: acc.json.token })).status, 401);
  const audit = await c.db.query<{ action: string }>("SELECT action FROM audit ORDER BY at");
  assert.ok(audit.some((a) => a.action === "invite.create") && audit.some((a) => a.action === "login"));
});

test("вход: неверный пароль — 401; 5 ошибок — пауза; заблокированный — 403; истёкшая сессия; сброс пароля ссылкой", async () => {
  const c = await startCloud();
  const auth = new Auth(c.db, () => c.clock.now);
  const tid = randomUUID();
  await c.db.query("INSERT INTO tenants (id, name) VALUES ($1, 'ООО Монтаж')", [tid]);
  const t = await auth.invite(null, tid, "ivanov@montazh.ru", "engineer");
  await auth.acceptInvite(t, "Иванов И.И.", "пароль-иванова");
  for (let i = 0; i < 5; i++) assert.equal((await c.req("POST", "/api/auth/login", { email: "ivanov@montazh.ru", password: "не тот" })).status, 401);
  const blocked = await c.req("POST", "/api/auth/login", { email: "ivanov@montazh.ru", password: "пароль-иванова" });
  assert.equal(blocked.status, 429);
  assert.match(blocked.json.error, /подождите 10 мин/);
  c.clock.now = new Date(c.clock.now.getTime() + 11 * 60_000);
  const ok = await c.req("POST", "/api/auth/login", { email: "IVANOV@montazh.ru ", password: "пароль-иванова" });
  assert.equal(ok.status, 200);
  const me = await c.req("GET", "/api/me", undefined, { token: ok.json.token });
  assert.equal(me.json.tenant.name, "ООО Монтаж");
  c.clock.now = new Date(c.clock.now.getTime() + 31 * 86400_000);
  assert.equal((await c.req("GET", "/api/me", undefined, { token: ok.json.token })).status, 401, "сессия 30 дней");
  const reset = await auth.invite(null, tid, "ivanov@montazh.ru", "engineer");
  assert.equal((await c.req("GET", `/api/invites/${reset}`)).json.existing, true);
  await c.req("POST", `/api/invites/${reset}`, { password: "новый-пароль-1" });
  assert.equal((await c.req("POST", "/api/auth/login", { email: "ivanov@montazh.ru", password: "новый-пароль-1" })).status, 200);
  await assert.rejects(auth.invite(null, randomUUID(), "ivanov@montazh.ru", "engineer"), /другой компании/);
  await c.db.query("UPDATE users SET status = 'blocked'");
  assert.equal((await c.req("POST", "/api/auth/login", { email: "ivanov@montazh.ru", password: "новый-пароль-1" })).status, 403);
  c.clock.now = new Date(c.clock.now.getTime() + 8 * 86400_000);
  const late = await auth.invite(null, tid, "petrov@montazh.ru", "reviewer");
  c.clock.now = new Date(c.clock.now.getTime() + 8 * 86400_000);
  assert.equal((await c.req("POST", `/api/invites/${late}`, { password: "пароль-петрова" })).status, 410, "срок 7 дней");
});

test("CORS: панель разрешена, чужой сайт — нет; смена пароля", async () => {
  const c = await startCloud();
  const pre = await fetch(`${c.url}/api/me`, { method: "OPTIONS", headers: { origin: PANEL } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), PANEL);
  assert.equal((await fetch(`${c.url}/api/me`, { method: "OPTIONS", headers: { origin: "https://evil.example" } })).status, 403);
  const bad = await c.req("POST", "/api/auth/login", { email: "x@y.ru", password: "x" }, { origin: "https://evil.example" });
  assert.equal(bad.status, 403);
  const link = await createOwner(c.db, "o@o.ru", "https://x");
  const { json } = await c.req("POST", `/api/invites/${tokenOf(link)}`, { password: "пароль-владельца" }, { origin: PANEL });
  assert.equal((await c.req("POST", "/api/auth/password", { old: "не тот", password: "новый-пароль" }, { token: json.token })).status, 400);
  assert.equal((await c.req("POST", "/api/auth/password", { old: "пароль-владельца", password: "новый-пароль" }, { token: json.token })).status, 204);
  assert.equal((await c.req("POST", "/api/auth/login", { email: "o@o.ru", password: "новый-пароль" })).status, 200);
});
