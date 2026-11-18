// 0.31: повторы запросов к нейросети — обрыв, 5xx, 429/Retry-After, без повторов на 4xx и сертификат, GigaChat 401.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChatRequest, Provider } from "@idk/shared/ai/model";
import { chat, resetGigaTokens } from "@idk/server/ai/providers";
import { NetError, type PostResult } from "@idk/server/ai/http";
import { postWithRetry, retryAfterMs, RATE_LIMIT_DEFAULT_MS } from "@idk/server/ai/retry";
import { fakeAi } from "./helpers/fakeAi.ts";

const prov = (x: Partial<Provider>): Provider => ({
  id: "p1",
  name: "YandexGPT",
  kind: "openai",
  baseUrl: "",
  model: "m",
  key: "k",
  folderId: "",
  authUrl: "",
  scope: "",
  caFile: "",
  maskNames: null,
  ...x,
});
const REQ: ChatRequest = { messages: [{ role: "user", content: "Проверь акт" }], tools: [] };
const OK = { json: { choices: [{ message: { content: "готово" } }], usage: { prompt_tokens: 10, completion_tokens: 2 } } };

/** Без пауз; паузы и журнал записываются. */
const rec = () => {
  const sleeps: number[] = [];
  const lines: string[] = [];
  return { sleeps, lines, retry: { sleep: async (ms: number) => void sleeps.push(ms), log: (t: string) => void lines.push(t), now: () => 1_000_000 } };
};

test("обрыв соединения на первой попытке — ответ со второй, ошибки пользователь не видит, в журнале две попытки с одним id", async () => {
  const ai = await fakeAi({ "/v1/chat/completions": [{ json: null, drop: true }, OK] });
  const r = rec();
  const out = await chat(prov({ baseUrl: `${ai.url}/v1` }), REQ, { retry: r.retry });
  assert.equal(out.message.content, "готово");
  assert.deepEqual(out.usage, { prompt: 10, completion: 2 }, "расход — один раз, по успешному ответу");
  assert.deepEqual(r.sleeps, [1000]);
  assert.equal(r.lines.length, 2);
  const ids = r.lines.map((l) => /запрос (\w+)/.exec(l)?.[1]);
  assert.ok(ids[0] && ids[0] === ids[1], r.lines.join("\n"));
  assert.match(r.lines[0], /попытка 1 .*нет связи|попытка 1 .*прервалась/);
  assert.match(r.lines[1], /попытка 2 .*ответ 200/);
});

test("ответ 5xx — два повтора через 1 и 3 с; всё время 5xx — ошибка с числом попыток и названием подключения", async () => {
  const ai = await fakeAi({ "/v1/chat/completions": [{ status: 503, json: { error: { message: "busy" } } }] });
  const r = rec();
  await assert.rejects(chat(prov({ baseUrl: `${ai.url}/v1` }), REQ, { retry: r.retry }), /YandexGPT: ошибка 503 — busy \(попыток: 3\)/);
  assert.deepEqual(r.sleeps, [1000, 3000]);
  assert.equal(ai.seen.length, 3);
});

test("нет связи все попытки — понятная ошибка: подключение, причина, число попыток", async () => {
  const r = rec();
  await assert.rejects(chat(prov({ baseUrl: "http://127.0.0.1:1/v1" }), REQ, { retry: r.retry }), (e: Error & { status?: number }) => {
    assert.equal(e.status, 502);
    assert.match(e.message, /^YandexGPT: нет связи \(ECONNREFUSED\) \(попыток: 3\)$/);
    return true;
  });
  assert.equal(r.lines.length, 3);
});

test("429 — один повтор после Retry-After; без заголовка — 60 с; срок в прошлом — 1 с", async () => {
  const ai = await fakeAi({ "/v1/chat/completions": [{ status: 429, json: {}, headers: { "retry-after": "7" } }, OK] });
  const r = rec();
  assert.equal((await chat(prov({ baseUrl: `${ai.url}/v1` }), REQ, { retry: r.retry })).message.content, "готово");
  assert.deepEqual(r.sleeps, [7000]);
  assert.equal(retryAfterMs(undefined, 0), RATE_LIMIT_DEFAULT_MS);
  assert.equal(retryAfterMs({ "retry-after": new Date(500).toUTCString() }, 1_000_000), 1000, "дата в прошлом");
  assert.equal(retryAfterMs({ "retry-after": new Date(1_000_000 + 5000).toUTCString() }, 1_000_000), 5000);
  assert.equal(retryAfterMs({ "retry-after": "0" }, 0), 1000);
});

test("429 дважды — только один повтор, затем ошибка", async () => {
  const ai = await fakeAi({ "/v1/chat/completions": [{ status: 429, json: { error: { message: "Rate limit" } } }] });
  const r = rec();
  await assert.rejects(chat(prov({ baseUrl: `${ai.url}/v1` }), REQ, { retry: r.retry }), /ошибка 429 — Rate limit \(попыток: 2\)/);
  assert.equal(ai.seen.length, 2);
  assert.deepEqual(r.sleeps, [RATE_LIMIT_DEFAULT_MS]);
});

test("4xx (кроме 429) не повторяются", async () => {
  const ai = await fakeAi({ "/v1/chat/completions": [{ status: 400, json: { error: { message: "bad" } } }] });
  const r = rec();
  await assert.rejects(chat(prov({ baseUrl: `${ai.url}/v1` }), REQ, { retry: r.retry }), /ошибка 400 — bad$/);
  assert.equal(ai.seen.length, 1);
  assert.deepEqual(r.sleeps, []);
});

test("таймаут — как сетевая ошибка; ответ, начавший приходить, не повторяется (токены уже потрачены)", async () => {
  const calls: string[] = [];
  const r = rec();
  const post = async (): Promise<PostResult> => {
    calls.push("x");
    throw new NetError("нейросеть не ответила вовремя", false, calls.length > 1, "TIMEOUT");
  };
  await assert.rejects(postWithRetry(post, "http://h/x", {}, {}, r.retry), /не ответила вовремя \(попыток: 2\)/);
  assert.equal(calls.length, 2, "первый таймаут до ответа — повтор; второй после начала ответа — без повтора");
  const cert = async (): Promise<PostResult> => {
    throw new NetError("сертификат сервера не принят", true);
  };
  await assert.rejects(postWithRetry(cert, "http://h/x", {}, {}, r.retry), (e: Error) => !/попыток/.test(e.message));
});

test("GigaChat: 401 — один повтор с новым токеном, как раньше; повторы на сеть не задевают токен", async () => {
  resetGigaTokens();
  let n = 0;
  const ai = await fakeAi({
    "/oauth": [(s) => ({ json: { access_token: `t${++n}`, expires_at: Date.now() + 1e6 }, s })],
    "/api/v1/chat/completions": [
      { json: null, drop: true },
      { status: 401, json: { message: "expired" } },
      { json: { choices: [{ message: { content: "ок" } }] } },
    ],
  });
  const g = prov({ kind: "gigachat", name: "Гига", baseUrl: `${ai.url}/api/v1`, authUrl: `${ai.url}/oauth` });
  const r = rec();
  assert.equal((await chat(g, REQ, { retry: r.retry })).message.content, "ок");
  const chats = ai.seen.filter((s) => s.path === "/api/v1/chat/completions");
  assert.equal(chats.length, 3);
  assert.equal(chats[0].headers.authorization, "Bearer t1");
  assert.equal(chats[1].headers.authorization, "Bearer t1", "повтор после обрыва — с тем же токеном");
  assert.equal(chats[2].headers.authorization, "Bearer t2", "после 401 — новый токен");
});
