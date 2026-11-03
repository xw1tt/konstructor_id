// «Сообщить о проблеме»: архив с описанием, сведениями панели и сервера, ошибками; копия в папке отчётов; без ключей нейросетей.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { startTestServer } from "./helpers/server.ts";
import { tmpDir } from "./helpers/tmp.ts";
import { openZip } from "@idk/server/zip/zip";
import { logError, recentErrors } from "@idk/server/diag/log";

test("отчёт: архив (описание, панель, сервер, ошибки, помощник), копия в папке отчётов, ключей нет", async () => {
  const reports = tmpDir();
  const s = await startTestServer({ reportsDir: reports });
  const saved = await s.req("PUT", "/api/ai/providers/new", { name: "Яндекс", kind: "openai", baseUrl: "https://api.example.ru/v1", key: "sk-secret-report-7", model: "m1" });
  assert.equal(saved.status, 200, "сохранение подключения: " + JSON.stringify(saved.json));
  logError("GET /api/test", new Error("проверочная ошибка"));
  assert.ok(recentErrors().some((e) => e.message === "проверочная ошибка"));
  const r = await s.req("POST", "/api/report", {
    description: "Окно предпросмотра пустое", panel: { excel: { version: "16.0.19000" }, book: { rows: { "Акты": 3 } } },
    assistant: [{ kind: "user", text: "убери сборки из протокола" }, { kind: "assistant", text: "Предлагаю…" }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.ok(r.json.path && existsSync(r.json.path) && r.json.path.startsWith(reports));
  const z = openZip(new Uint8Array(readFileSync(r.json.path)));
  assert.deepEqual([...z.keys()].sort(), ["Отчёт.txt", "ошибки.json", "панель.json", "помощник.json", "сервер.json"].sort());
  const text = z.get("Отчёт.txt")!().toString("utf8");
  assert.match(text, /Окно предпросмотра пустое/);
  assert.match(text, /проверочная ошибка/);
  assert.match(text, /\[user\] убери сборки из протокола/);
  assert.match(z.get("панель.json")!().toString("utf8"), /16\.0\.19000/);
  const all = [...z.values()].map((f) => f().toString("utf8")).join("\n");
  assert.ok(!all.includes("sk-secret-report-7"), "ключи нейросетей в отчёт не попадают");
  const dl = await s.raw("GET", `/api/report/${r.json.id}`);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get("content-type"), "application/zip");
  assert.equal((await s.req("GET", "/api/report/нет")).status, 404);
  // Без разговора — без файла помощника.
  const r2 = await s.req("POST", "/api/report", { description: "" });
  assert.ok(!openZip(new Uint8Array(readFileSync(r2.json.path))).has("помощник.json"));
});

test("0.29.2: установленная версия для «Настроек»", async () => {
  const { startTestServer } = await import("./helpers/server.ts");
  const s = await startTestServer();
  const r = await s.req("GET", "/api/version");
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.version, "string");
  assert.ok(r.json.version.length > 0);
});

test("0.29.3: отчёт сразу уходит в Телеграм (сообщение и архив); ошибка — архив остаётся, причина в ответе", async () => {
  const { startTestServer } = await import("./helpers/server.ts");
  const calls: { url: string; body: unknown }[] = [];
  const ok: typeof fetch = async (url, init) => { calls.push({ url: String(url), body: init?.body }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); };
  const { tmpDir } = await import("./helpers/tmp.ts");
  const s = await startTestServer({ telegram: { token: "123:abc", chatId: "42" }, fetchImpl: ok, reportsDir: tmpDir() });
  const r = await s.req("POST", "/api/report", { description: "КЖ не печатается" });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.sent, true);
  assert.deepEqual(calls.map((c) => c.url), ["https://api.telegram.org/bot123:abc/sendMessage", "https://api.telegram.org/bot123:abc/sendDocument"]);
  assert.match(String(calls[0].body), /КЖ не печатается/);
  assert.equal(JSON.parse(String(calls[0].body)).chat_id, "42");
  const form = calls[1].body as FormData;
  assert.equal(form.get("chat_id"), "42");
  assert.match((form.get("document") as File).name, /^Отчёт .*\.zip$/);
  const bad: typeof fetch = async () => { throw new Error("connect ETIMEDOUT"); };
  const s2 = await startTestServer({ telegram: { token: "1:x", chatId: "1" }, fetchImpl: bad, reportsDir: tmpDir() });
  const r2 = await s2.req("POST", "/api/report", { description: "x" });
  assert.equal(r2.status, 201);
  assert.equal(r2.json.sent, false);
  assert.match(r2.json.sendError, /нет связи с Телеграмом/);
  assert.ok(r2.json.path);
  const s3 = await startTestServer({ telegram: null, reportsDir: tmpDir() });
  assert.equal((await s3.req("POST", "/api/report", { description: "x" })).json.sent, null, "бот не настроен — без отправки");
});
