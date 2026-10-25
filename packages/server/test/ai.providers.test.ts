// План 18, задача 2: адаптеры OpenAI-совместимый и GigaChat на подставном сервере.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatRequest, Provider } from "@idk/shared/ai/model";
import { chat, resetGigaTokens } from "@idk/server/ai/providers";
import { post } from "@idk/server/ai/http";
import { createCa, createLeaf } from "@idk/server/tls/x509";
import { fakeAi } from "./helpers/fakeAi.ts";
import { tmpDir } from "./helpers/tmp.ts";

const prov = (x: Partial<Provider>): Provider => ({
  id: "p1", name: "Тест", kind: "openai", baseUrl: "", model: "", key: "", folderId: "", scope: "", authUrl: "", caFile: "", maskNames: null, ...x,
});
const TOOLS = [{ name: "read_rows", description: "Строки таблицы", parameters: { type: "object", properties: { table: { type: "string" } }, required: ["table"] } }];
const REQ: ChatRequest = {
  messages: [
    { role: "system", content: "Ты помощник" },
    { role: "user", content: "Покажи акты" },
    { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_rows", arguments: { table: "Акты" } }] },
    { role: "tool", toolCallId: "c1", name: "read_rows", content: '{"total":1}' },
  ],
  tools: TOOLS,
};

test("OpenAI-совместимый (YandexGPT): заголовки, tools, история с результатом; ответ вызовом инструмента и текстом", async () => {
  const ai = await fakeAi({ "/v1/chat/completions": [
    { json: { choices: [{ message: { content: null, tool_calls: [{ id: "c2", type: "function", function: { name: "read_rows", arguments: '{"table":"Материалы"}' } }] } }], usage: { prompt_tokens: 120, completion_tokens: 7 } } },
    { json: { choices: [{ message: { content: "Готово" } }], usage: { prompt_tokens: 150, completion_tokens: 3 } } },
  ] });
  const p = prov({ kind: "yandex", baseUrl: `${ai.url}/v1`, key: "AQVN", folderId: "b1gfolder" });
  const r = await chat(p, REQ);
  const s = ai.seen[0];
  assert.equal(s.headers.authorization, "Bearer AQVN");
  assert.equal(s.headers["openai-project"], "b1gfolder");
  assert.equal(s.body.model, "gpt://b1gfolder/yandexgpt/latest");
  assert.equal(s.body.tool_choice, "auto");
  assert.deepEqual(s.body.tools[0], { type: "function", function: TOOLS[0] });
  assert.deepEqual(s.body.messages[2].tool_calls, [{ id: "c1", type: "function", function: { name: "read_rows", arguments: '{"table":"Акты"}' } }]);
  assert.deepEqual(s.body.messages[3], { role: "tool", tool_call_id: "c1", content: '{"total":1}' });
  assert.deepEqual(r, { message: { role: "assistant", content: "", toolCalls: [{ id: "c2", name: "read_rows", arguments: { table: "Материалы" } }] }, usage: { prompt: 120, completion: 7 } });
  assert.equal((await chat(p, { messages: [{ role: "user", content: "Привет" }], tools: [] })).message.content, "Готово");
  assert.equal(ai.seen[1].body.tools, undefined, "без инструментов — без tools");
});

test("локальная модель: без ключа — без Authorization", async () => {
  const ai = await fakeAi({ "/v1/chat/completions": [{ json: { choices: [{ message: { content: "ok" } }] } }] });
  await chat(prov({ kind: "local", baseUrl: `${ai.url}/v1`, model: "qwen2.5:14b" }), { messages: [{ role: "user", content: "?" }], tools: [] });
  assert.equal(ai.seen[0].headers.authorization, undefined);
  assert.equal(ai.seen[0].body.model, "qwen2.5:14b");
});

test("GigaChat: токен (Basic, RqUID, scope), кеш, 401 → новый токен; functions и role: function", async () => {
  resetGigaTokens();
  let n = 0;
  const ai = await fakeAi({
    "/oauth": [() => ({ json: { access_token: `tok${++n}`, expires_at: Date.now() + 30 * 60_000 } })],
    "/api/v1/chat/completions": [
      { json: { choices: [{ finish_reason: "function_call", message: { role: "assistant", content: "", function_call: { name: "read_rows", arguments: { table: "Акты" } }, functions_state_id: "fs1" } }], usage: { prompt_tokens: 50, completion_tokens: 5 } } },
      { status: 401, json: { message: "Token has expired" } },
      { json: { choices: [{ message: { role: "assistant", content: "Ответ" } }] } },
    ],
  });
  const p = prov({ kind: "gigachat", baseUrl: `${ai.url}/api/v1`, authUrl: `${ai.url}/oauth`, key: "QXV0aEtleQ==" });
  const r = await chat(p, REQ);
  const auth = ai.seen[0];
  assert.equal(auth.headers.authorization, "Basic QXV0aEtleQ==");
  assert.match(String(auth.headers.rquid), /^[0-9a-f-]{36}$/);
  assert.equal(auth.raw, "scope=GIGACHAT_API_PERS");
  const c = ai.seen[1];
  assert.equal(c.headers.authorization, "Bearer tok1");
  assert.equal(c.body.model, "GigaChat-2-Pro");
  assert.deepEqual(c.body.functions, TOOLS);
  assert.deepEqual(c.body.messages[2], { role: "assistant", content: "", function_call: { name: "read_rows", arguments: { table: "Акты" } } });
  assert.deepEqual(c.body.messages[3], { role: "function", name: "read_rows", content: '{"total":1}' });
  assert.deepEqual(r.message.toolCalls, [{ id: "fs1", name: "read_rows", arguments: { table: "Акты" } }]);
  const r2 = await chat(p, { messages: [{ role: "user", content: "?" }], tools: [] });
  assert.equal(r2.message.content, "Ответ");
  assert.deepEqual(ai.seen.map((s) => s.path), ["/oauth", "/api/v1/chat/completions", "/api/v1/chat/completions", "/oauth", "/api/v1/chat/completions"], "кеш токена, 401 → новый");
  assert.equal(ai.seen[4].headers.authorization, "Bearer tok2");
});

test("ошибки: ответ провайдера с кодом, нет связи, сертификат (GigaChat — подсказка), таймаут", async () => {
  const ai = await fakeAi({ "/v1/chat/completions": [{ status: 429, json: { error: { message: "Rate limit" } } }] });
  await assert.rejects(chat(prov({ kind: "openai", name: "Сервис", baseUrl: `${ai.url}/v1`, model: "m", key: "k" }), REQ), /Сервис: ошибка 429 — Rate limit/);
  await assert.rejects(chat(prov({ kind: "openai", baseUrl: "http://127.0.0.1:1/v1", model: "m", key: "k" }), REQ), (e: any) => e.status === 502 && /нет связи/.test(e.message));
  const ca = createCa();
  const leaf = createLeaf(ca);
  resetGigaTokens();
  const sec = await fakeAi({ "/oauth": [{ json: { access_token: "t", expires_at: Date.now() + 1e6 } }], "/api/v1/chat/completions": [{ json: { choices: [{ message: { content: "ок" } }] } }] },
    { key: leaf.keyPem, cert: leaf.certPem });
  const g = prov({ kind: "gigachat", name: "Гига", baseUrl: `${sec.url}/api/v1`, authUrl: `${sec.url}/oauth`, key: "k" });
  await assert.rejects(chat(g, REQ), /Гига: сертификат сервера не принят.*сертификата Минцифры/);
  const caFile = join(tmpDir(), "russian_trusted_root_ca.cer");
  writeFileSync(caFile, ca.certPem);
  assert.equal((await chat({ ...g, caFile }, REQ)).message.content, "ок", "с файлом корневого сертификата — работает");
  const slow = await fakeAi({ "/x": [{ json: {}, delayMs: 300 }] });
  await assert.rejects(post(`${slow.url}/x`, {}, { timeoutMs: 50 }), /не ответила вовремя/);
});

test("YandexGPT: в «ID каталога» не тот идентификатор — подсказка с нужным каталогом; нет роли — подсказка про роль", async () => {
  const { yandexHint } = await import("@idk/server/ai/providers");
  const p = prov({ kind: "yandex", name: "YandexGPT", folderId: "ajen1vav06fpt69018ru" });
  const h = yandexHint(p, "rpc error: code = InvalidArgument desc = Specified folder ID 'ajen1vav06fpt69018ru' does not match with service account folder ID 'b1g72v5lagsvoubhp07k'");
  assert.match(h, /В поле «ID каталога» указан «ajen1vav06fpt69018ru».*впишите b1g72v5lagsvoubhp07k/);
  assert.match(yandexHint(p, "Permission denied"), /ai\.languageModels\.user/);
  assert.equal(yandexHint(prov({ kind: "openai" }), "Permission denied"), "");
});
