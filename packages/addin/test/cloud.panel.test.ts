// План 25: облако в панели — режимы доступа, вход, работа без связи 24 часа, ограничение работы.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCloud, cloudLogin, blockReason, emptyCache, normUrl, OFFLINE_MS } from "@idk/addin/panel/cloud";
import { assertAccess, setAccessBlock } from "@idk/addin/panel/access";

const me = (access: string) => ({ user: { id: "u", email: "e@x.ru", name: "Иванов", role: "engineer" }, tenant: { id: "t", name: "ООО Монтаж", balanceRub: 100, access, accessLabel: "" } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("режимы: без адреса — как раньше; без входа — вход; доступ по ответу облака; 401 — вход заново", async () => {
  assert.equal((await checkCloud(emptyCache(), async () => { throw new Error("не должен"); }, 0)).mode.kind, "off");
  const c = { ...emptyCache(), url: "https://id.example.ru" };
  assert.equal((await checkCloud(c, async () => json(200, {}), 0)).mode.kind, "login");
  const withToken = { ...c, token: "T" };
  let seen = "";
  for (const [a, kind] of [["active", "ok"], ["readonly", "readonly"], ["suspended", "suspended"]] as const) {
    const r = await checkCloud(withToken, async (u, init) => { seen = `${u} ${(init?.headers as any).authorization}`; return json(200, me(a)); }, 1000);
    assert.equal(r.mode.kind, kind);
    assert.equal(r.cache.checkedAt, 1000);
  }
  assert.equal(seen, "https://id.example.ru/api/me Bearer T");
  const r401 = await checkCloud(withToken, async () => json(401, { error: "Войдите заново" }), 0);
  assert.equal(r401.mode.kind, "login");
  assert.equal(r401.cache.token, "");
  assert.equal(normUrl(" id.example.ru/ "), "https://id.example.ru");
});

test("нет связи: последний статус ещё сутки, потом — ограничение", async () => {
  const c = { ...emptyCache(), url: "https://id.example.ru", token: "T", me: me("active") as any, checkedAt: 0 };
  const down = async () => { throw new TypeError("Failed to fetch"); };
  const a = await checkCloud(c, down, OFFLINE_MS - 1);
  assert.deepEqual([a.mode.kind, (a.mode as any).offline], ["ok", true]);
  assert.equal((await checkCloud(c, async () => json(502, {}), 1000)).mode.kind, "ok", "сбой сервера — как нет связи");
  const b = await checkCloud(c, down, OFFLINE_MS + 1);
  assert.equal(b.mode.kind, "expired");
  assert.match(blockReason(b.mode)!, /больше суток/);
});

test("вход: ошибка облака, нет связи, успех; ограничение работы — печать и помощник", async () => {
  const c = { ...emptyCache(), url: "https://id.example.ru" };
  const bad = await cloudLogin(c, "e@x.ru", "x", async () => json(401, { error: "Неверная почта или пароль" }), 0);
  assert.deepEqual(bad.mode, { kind: "login", error: "Неверная почта или пароль" });
  assert.match((await cloudLogin(c, "e", "p", async () => { throw new Error(); }, 0)).mode.kind === "login" ? "ok" : "", /ok/);
  const ok = await cloudLogin(c, "e@x.ru", "пароль", async (u) => (u.endsWith("/login") ? json(200, { token: "NEW" }) : json(200, me("readonly"))), 5);
  assert.equal(ok.cache.token, "NEW");
  assert.equal(ok.mode.kind, "readonly");
  setAccessBlock(blockReason(ok.mode));
  assert.throws(() => assertAccess("/api/print-jobs"), /Баланс компании исчерпан/);
  assert.throws(() => assertAccess("/api/ai/chat"), /Баланс/);
  assert.throws(() => assertAccess("/api/kit-jobs"), /Баланс/);
  assert.doesNotThrow(() => assertAccess("/api/templates"), "шаблоны, сканы, справочник — можно");
  setAccessBlock(null);
  assert.doesNotThrow(() => assertAccess("/api/print-jobs"));
});
