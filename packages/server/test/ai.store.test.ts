// План 18, задача 1: подключения нейросетей и журнал расхода.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveProvider, providerProblems, ProviderInput } from "@idk/shared/ai/model";
import { AiStore } from "@idk/server/ai/store";
import { tmpDir } from "./helpers/tmp.ts";

const inp = (x: Record<string, unknown>) => ProviderInput.parse(x);

test("значения по умолчанию и обязательные поля по видам", () => {
  const y = resolveProvider({ ...inp({ name: "Я", kind: "yandex", folderId: "b1g", key: "k" }), id: "1" });
  assert.equal(y.baseUrl, "https://llm.api.cloud.yandex.net/v1");
  assert.equal(y.model, "gpt://b1g/yandexgpt/latest");
  assert.equal(y.maskNames, false);
  const g = resolveProvider({ ...inp({ name: "Г", kind: "gigachat", key: "k" }), id: "2" });
  assert.equal(g.scope, "GIGACHAT_API_PERS");
  assert.equal(g.authUrl, "https://ngw.devices.sberbank.ru:9443/api/v2/oauth");
  assert.equal(resolveProvider({ ...inp({ name: "О", kind: "openai", baseUrl: "https://api.x.com/v1/", model: "m", key: "k" }), id: "3" }).maskNames, true);
  assert.equal(resolveProvider({ ...inp({ name: "О", kind: "openai", baseUrl: "http://localhost:8000/v1", model: "m" }), id: "3" }).maskNames, false);
  assert.deepEqual(providerProblems({ ...inp({ name: "Л", kind: "local" }), id: "4" }), ["Укажите модель"]);
  assert.deepEqual(providerProblems({ ...inp({ name: "О", kind: "openai" }), id: "5" }), ["Укажите адрес API", "Укажите модель", "Укажите ключ API"]);
  assert.deepEqual(providerProblems({ ...inp({ name: "Я", kind: "yandex" }), id: "6" }), ["Укажите ID каталога или модель", "Укажите ключ API"]);
});

test("хранилище: без ключей наружу, ключ не стирается, активное, удаление", () => {
  const dir = tmpDir();
  const s = new AiStore(dir);
  assert.throws(() => s.active(), /Не выбрана нейросеть/);
  const a = s.save("new", inp({ name: "Яндекс", kind: "yandex", folderId: "b1g", key: "s3cret" }));
  assert.equal(a.hasKey, true);
  assert.ok(!("key" in a));
  assert.equal(s.list().active, a.id, "первое подключение — активное");
  assert.ok(!JSON.stringify(s.list()).includes("s3cret"));
  s.save(a.id, inp({ name: "Яндекс 2", kind: "yandex", folderId: "b1g" }));
  assert.equal(s.get(a.id).key, "s3cret", "сохранение без ключа оставляет прежний");
  assert.equal(s.get(a.id).name, "Яндекс 2");
  assert.throws(() => s.save("new", inp({ name: "Плохое", kind: "openai" })), /Укажите адрес API/);
  const b = s.save("new", inp({ name: "Ollama", kind: "local", model: "qwen2.5" }));
  s.setActive(b.id);
  assert.equal(s.active().id, b.id);
  s.remove(b.id);
  assert.equal(s.list().active, null);
  assert.throws(() => s.remove("нет"), /не найдено/);
  assert.ok(readFileSync(join(dir, "ai.json"), "utf8").includes("s3cret"), "ключ хранится в файле на ПК");
});

test("журнал расхода: итоги текущего месяца по подключениям", () => {
  let now = new Date("2026-09-30T10:00:00Z");
  const s = new AiStore(tmpDir(), () => now);
  const p = s.get(s.save("new", inp({ name: "Г", kind: "gigachat", key: "k" })).id);
  s.logUsage(p, { prompt: 100, completion: 10 });
  now = new Date("2026-10-25T10:00:00Z");
  s.logUsage(p, { prompt: 1000, completion: 50 });
  s.logUsage(p, { prompt: 500, completion: 5 });
  assert.deepEqual(s.usage(), { month: "2026-10", totals: [{ provider: p.id, name: "Г", requests: 2, prompt: 1500, completion: 55 }] });
});
