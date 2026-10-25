// План 18, задача 3: маршруты /api/ai/*.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";
import { fakeAi } from "./helpers/fakeAi.ts";

test("подключения без ключей, активное, «Проверить», чат, расход", async () => {
  const ai = await fakeAi({ "/v1/chat/completions": [
    { json: { choices: [{ message: { content: "ОК" } }], usage: { prompt_tokens: 10, completion_tokens: 1 } } },
    { json: { choices: [{ message: { content: "", tool_calls: [{ id: "x", function: { name: "list_tables", arguments: "{}" } }] } }], usage: { prompt_tokens: 300, completion_tokens: 9 } } },
  ] });
  const s = await startTestServer();
  assert.equal((await s.req("POST", "/api/ai/chat", { messages: [{ role: "user", content: "?" }] })).json.error, "Не выбрана нейросеть: «Настройки» → «Нейросети»");
  let r = await s.req("PUT", "/api/ai/providers/new", { name: "Своя", kind: "openai", baseUrl: `${ai.url}/v1`, model: "m", key: "sk-secret-1" });
  assert.equal(r.status, 200);
  const id = r.json.id;
  r = await s.req("GET", "/api/ai/providers");
  assert.equal(r.json.active, id);
  assert.ok(!JSON.stringify(r.json).includes("sk-secret-1"));
  assert.equal(r.json.providers[0].hasKey, true);
  r = await s.req("POST", `/api/ai/providers/${id}/test`);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.text, "ОК");
  r = await s.req("POST", "/api/ai/chat", { messages: [{ role: "user", content: "Какие таблицы?" }], tools: [{ name: "list_tables", description: "Таблицы", parameters: { type: "object", properties: {} } }] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.message.toolCalls, [{ id: "x", name: "list_tables", arguments: {} }]);
  assert.equal(r.json.provider, "Своя");
  assert.equal(ai.seen[1].headers.authorization, "Bearer sk-secret-1");
  const u = (await s.req("GET", "/api/ai/usage")).json;
  assert.deepEqual(u.totals.map((t: any) => [t.name, t.requests, t.prompt, t.completion]), [["Своя", 2, 310, 10]]);
  assert.equal((await s.req("PUT", "/api/ai/active", { id: null })).json.active, null);
  assert.equal((await s.req("PUT", "/api/ai/providers/new", { name: "Плохое", kind: "openai" })).status, 400);
  assert.match((await s.req("PUT", "/api/ai/providers/new", { name: "Рус", kind: "openai", baseUrl: "https://x/v1", model: "m", key: "ключ" })).json.error, /недопустимые символы/);
  assert.equal((await s.req("DELETE", `/api/ai/providers/${id}`)).status, 204);
  assert.equal((await s.req("POST", "/api/ai/chat", { messages: [] })).status, 400, "пустая история");
});
