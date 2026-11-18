// 0.31: клиент потока панели (aiApi.chatStream) против настоящего сервера и подставной нейросети.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { StreamStopped } from "@idk/shared/ai/model";
import { chatStream } from "@idk/addin/panel/aiApi";
import { startTestServer } from "../../server/test/helpers/server.ts";
import { fakeAi } from "../../server/test/helpers/fakeAi.ts";

const delta = (content: string) => JSON.stringify({ choices: [{ delta: { content } }] });
const orig = globalThis.fetch;
let base = "";
// Панель обращается к серверу относительными адресами — в тесте к ним подставляется адрес сервера.
globalThis.fetch = ((u: string | URL | Request, i?: RequestInit) => orig(typeof u === "string" && u.startsWith("/") ? base + u : u, i)) as typeof fetch;
after(() => {
  globalThis.fetch = orig;
});

async function setup(sse: string[], chunkMs = 0) {
  const ai = await fakeAi({ "/v1/chat/completions": [{ json: null, sse, chunkMs }] });
  const s = await startTestServer({ aiRetry: { sleep: async () => {}, log: () => {} } });
  await s.req("PUT", "/api/ai/providers/new", { name: "YandexGPT", kind: "openai", baseUrl: `${ai.url}/v1`, model: "m", key: "k" });
  base = s.url;
  return s;
}
const Q = [{ role: "user" as const, content: "Проверь" }];

test("поток: куски по мере прихода и итоговый ответ", async () => {
  await setup([delta("Акт "), delta("в порядке."), "[DONE]"]);
  const parts: string[] = [];
  const r = await chatStream(Q, [], { onToken: (t) => parts.push(t) });
  assert.deepEqual(parts, ["Акт ", "в порядке."]);
  assert.equal(r.message.content, "Акт в порядке.");
  assert.equal(r.provider, "YandexGPT");
});

test("остановка: StreamStopped с полученной частью", async () => {
  await setup(
    Array.from({ length: 30 }, (_, i) => delta(`к${i} `)),
    30,
  );
  const ac = new AbortController();
  const parts: string[] = [];
  await assert.rejects(
    chatStream(Q, [], { onToken: (t) => (parts.push(t), parts.length === 2 && ac.abort()) }, ac.signal),
    (e: unknown) => e instanceof StreamStopped && e.byUser && e.partial === "к0 к1 ",
  );
});

test("ошибка провайдера — обычная ошибка с текстом сервера", async () => {
  const s = await startTestServer({ aiRetry: { sleep: async () => {}, log: () => {} } });
  await s.req("PUT", "/api/ai/providers/new", { name: "YandexGPT", kind: "openai", baseUrl: "http://127.0.0.1:1/v1", model: "m", key: "k" });
  base = s.url;
  await assert.rejects(chatStream(Q, [], { onToken: () => {} }), /YandexGPT: нет связи.*\(попыток: 3\)/);
});
