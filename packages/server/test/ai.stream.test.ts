// 0.31: потоковый ответ помощника — POST /api/ai/chat/stream (Server-Sent Events), отмена, обрыв, GigaChat, ошибки.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";
import { fakeAi } from "./helpers/fakeAi.ts";
import { sseLines, estimateTokens } from "@idk/server/ai/providers";

const delta = (content: string) => JSON.stringify({ choices: [{ delta: { content } }] });
const FAST = { aiRetry: { sleep: async () => {}, log: () => {} } };

type Ev = { type: string; [k: string]: any };

/** Читает события потока; stopAfter — оборвать соединение после N-го события token. */
async function events(s: Awaited<ReturnType<typeof startTestServer>>, body: unknown, stopAfter?: number): Promise<{ list: Ev[]; firstMs: number }> {
  const ac = new AbortController();
  const t0 = Date.now();
  const res = await s.raw("POST", "/api/ai/chat/stream", { headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
  assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const list: Ev[] = [];
  let firstMs = -1;
  const feed = sseLines((d) => {
    const e = JSON.parse(d);
    if (firstMs < 0) firstMs = Date.now() - t0;
    list.push(e);
  });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      feed(dec.decode(value, { stream: true }));
      if (stopAfter !== undefined && list.filter((e) => e.type === "token").length >= stopAfter) {
        ac.abort();
        break;
      }
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") throw e;
  }
  return { list, firstMs };
}

async function withProvider(routes: Parameters<typeof fakeAi>[0], kind = "openai") {
  const ai = await fakeAi(routes);
  const s = await startTestServer(FAST);
  const body =
    kind === "gigachat"
      ? { name: "Гига", kind, baseUrl: `${ai.url}/api/v1`, authUrl: `${ai.url}/oauth`, model: "GigaChat", key: "k" }
      : { name: "YandexGPT", kind: "openai", baseUrl: `${ai.url}/v1`, model: "m", key: "k" };
  const r = await s.req("PUT", "/api/ai/providers/new", body);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return { ai, s };
}
const usage = async (s: Awaited<ReturnType<typeof startTestServer>>) =>
  (await s.req("GET", "/api/ai/usage")).json.totals.map((t: any) => [t.name, t.requests, t.prompt, t.completion]);
const Q = { messages: [{ role: "user", content: "Проверь акт АОВ1" }], tools: [] };

test("поток: текст кусками сразу, в конце done с сообщением и расходом; запрос к провайдеру — stream", async () => {
  const { ai, s } = await withProvider({
    "/v1/chat/completions": [
      {
        json: null,
        chunkMs: 150,
        sse: [delta("Провер"), delta("яю акт…"), JSON.stringify({ choices: [], usage: { prompt_tokens: 1200, completion_tokens: 48 } }), "[DONE]"],
      },
    ],
  });
  const { list, firstMs } = await events(s, Q);
  assert.deepEqual(
    list.filter((e) => e.type === "token").map((e) => e.text),
    ["Провер", "яю акт…"],
  );
  const done = list.at(-1)!;
  assert.equal(done.type, "done");
  assert.equal(done.message.content, "Проверяю акт…");
  assert.deepEqual(done.usage, { prompt: 1200, completion: 48 });
  assert.equal(done.provider, "YandexGPT");
  assert.ok(firstMs < 300, `первый кусок через ${firstMs} мс — до конца генерации (≈450 мс)`);
  assert.equal(ai.seen[0].body.stream, true);
  assert.equal(ai.seen[0].headers.accept, "text/event-stream");
  assert.deepEqual(await usage(s), [["YandexGPT", 1, 1200, 48]]);
});

test("поток: вызов инструмента — событие tool, аргументы собираются из кусков", async () => {
  const tc = (o: unknown) => JSON.stringify({ choices: [{ delta: { tool_calls: [o] } }] });
  const { s } = await withProvider({
    "/v1/chat/completions": [
      {
        json: null,
        sse: [
          tc({ index: 0, id: "c1", function: { name: "read_rows", arguments: '{"tab' } }),
          tc({ index: 0, function: { arguments: 'le":"Акты"}' } }),
          "[DONE]",
        ],
      },
    ],
  });
  const { list } = await events(s, Q);
  assert.deepEqual(list[0], { type: "tool", name: "read_rows" });
  const done = list.at(-1)!;
  assert.deepEqual(done.message.toolCalls, [{ id: "c1", name: "read_rows", arguments: { table: "Акты" } }]);
  assert.ok(done.usage.prompt > 0, "провайдер не прислал расход — оценка");
});

test("«Остановить»: соединение закрыто — запрос к провайдеру прерван, расход записан один раз, по полученному", async () => {
  const words = Array.from({ length: 40 }, (_, i) => delta(`слово${i} `));
  const { s } = await withProvider({ "/v1/chat/completions": [{ json: null, chunkMs: 40, sse: [...words, "[DONE]"] }] });
  const { list } = await events(s, Q, 2);
  assert.equal(list.filter((e) => e.type === "token").length, 2);
  // Сервер узнаёт об отмене асинхронно — ждём записи расхода.
  let u: any[] = [];
  for (let i = 0; i < 50 && !u.length; i++) {
    await new Promise((r) => setTimeout(r, 40));
    u = await usage(s);
  }
  assert.equal(u.length, 1);
  assert.equal(u[0][1], 1, "одна запись");
  assert.ok(u[0][3] > 0 && u[0][3] < estimateTokens(words.join("")), "расход — по полученной части, не по всему ответу");
});

test("обрыв связи посреди ответа — событие error «interrupted» с полученной частью; расход записан", async () => {
  const { s } = await withProvider({ "/v1/chat/completions": [{ json: null, cut: 2, chunkMs: 30, sse: [delta("Часть "), delta("ответа"), delta(" и ещё")] }] });
  const { list } = await events(s, Q);
  const err = list.at(-1)!;
  assert.equal(err.type, "error");
  assert.equal(err.code, "interrupted");
  assert.equal(err.partial, "Часть ответа");
  assert.equal((await usage(s))[0][1], 1);
});

test("провайдер недоступен все попытки — событие error с числом попыток и названием подключения; сервер живёт", async () => {
  const s = await startTestServer(FAST);
  await s.req("PUT", "/api/ai/providers/new", { name: "YandexGPT", kind: "openai", baseUrl: "http://127.0.0.1:1/v1", model: "m", key: "k" });
  const { list } = await events(s, Q);
  assert.equal(list.length, 1);
  assert.equal(list[0].type, "error");
  assert.equal(list[0].code, "provider");
  assert.equal(list[0].attempts, 3);
  assert.match(list[0].message, /^YandexGPT: нет связи .*\(попыток: 3\)$/);
  assert.equal((await s.req("GET", "/api/ai/usage")).status, 200);
});

test("GigaChat — буферизованно: один кусок с полным текстом и done; интерфейс тот же", async () => {
  const { s } = await withProvider(
    {
      "/oauth": [{ json: { access_token: "t", expires_at: Date.now() + 1e6 } }],
      "/api/v1/chat/completions": [{ json: { choices: [{ message: { content: "Акт в порядке." } }], usage: { prompt_tokens: 50, completion_tokens: 5 } } }],
    },
    "gigachat",
  );
  const { list } = await events(s, Q);
  assert.deepEqual(
    list.map((e) => e.type),
    ["token", "done"],
  );
  assert.equal(list[0].text, "Акт в порядке.");
  assert.deepEqual(list[1].usage, { prompt: 50, completion: 5 });
});

test("нет активной нейросети — обычная ошибка 400 до начала потока", async () => {
  const s = await startTestServer(FAST);
  const r = await s.req("POST", "/api/ai/chat/stream", Q);
  assert.equal(r.status, 400);
  assert.match(r.json.error, /Не выбрана нейросеть/);
});
