// План 16, задача 2: хранилище библиотеки и маршруты.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync, readdirSync } from "node:fs";
import { LibraryStore } from "@idk/server/library/store";
import { startTestServer } from "./helpers/server.ts";
import { makePdf } from "./helpers/pdf.ts";
import { tmpDir } from "./helpers/tmp.ts";

test("настройки: по умолчанию <dataDir>/library; смена папки; недоступная папка — 400 с путём", async () => {
  const s = await startTestServer();
  let r = await s.req("GET", "/api/library/settings");
  assert.deepEqual(r.json, { dir: join(s.dataDir, "library"), isDefault: true });
  const shared = tmpDir();
  r = await s.req("PUT", "/api/library/settings", { dir: shared });
  assert.deepEqual(r.json, { dir: shared, isDefault: false });
  const file = join(tmpDir(), "это-файл");
  writeFileSync(file, "");
  r = await s.req("PUT", "/api/library/settings", { dir: join(file, "внутри") });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, `Папка библиотеки недоступна: ${join(file, "внутри")}`);
  assert.equal((await s.req("GET", "/api/library/settings")).json.dir, shared, "неудачная смена не меняет папку");
  r = await s.req("PUT", "/api/library/settings", { dir: null });
  assert.equal(r.json.isDefault, true);
});

test("добавление и обновление по ключу; поиск; удаление; неизвестный раздел — 404", async () => {
  const s = await startTestServer();
  let r = await s.req("POST", "/api/library/material", { values: { name: "Кабель КПСнг", mark: "1х2х0,75", unit: "м.", rkc: "1.1" } });
  assert.equal(r.status, 201);
  assert.equal(r.json.created, true);
  const id = r.json.id;
  r = await s.req("POST", "/api/library/material", { values: { name: "кабель кпснг ", mark: "1х2х0,75", unit: "м", manufacturer: "Завод" } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { id, created: false });
  await s.req("POST", "/api/library/material", { values: { name: "Труба гофрированная", unit: "м." } });
  const all = (await s.req("GET", "/api/library/material")).json;
  assert.equal(all.length, 2);
  const cable = all.find((x: any) => x.id === id);
  assert.equal(cable.values.manufacturer, "Завод");
  assert.ok(!("rkc" in cable.values), "строка РКЦ объекта в библиотеку не идёт");
  assert.deepEqual((await s.req("GET", "/api/library/material?q=ГОФР")).json.map((x: any) => x.values.name), ["Труба гофрированная"]);
  assert.equal((await s.req("POST", "/api/library/material", { values: { unit: "м." } })).status, 400);
  assert.equal((await s.req("DELETE", `/api/library/material/${id}`)).status, 204);
  assert.equal((await s.req("DELETE", `/api/library/material/${id}`)).status, 404);
  assert.equal((await s.req("GET", "/api/library/xxx")).status, 404);
});

test("два хранилища на одной папке — одна запись на ключ; организация с ИНН заменяет запись по наименованию", () => {
  const dir = tmpDir();
  const a = new LibraryStore(tmpDir()), b = new LibraryStore(tmpDir());
  a.setDir(dir);
  b.setDir(dir);
  a.upsert("org", { shortName: "ООО А" });
  b.upsert("org", { shortName: "ооо а", address: "Москва" });
  assert.equal(a.list("org").length, 1);
  assert.equal(a.list("org")[0].values.address, "Москва");
  b.upsert("org", { shortName: "ООО А", inn: "7700000000" });
  assert.deepEqual(a.list("org").map((o) => o.values.inn), ["7700000000"]);
  writeFileSync(join(dir, "org", "0".repeat(32) + ".json"), "{битый");
  assert.equal(a.list("org").length, 1, "недописанный файл не ломает список");
});

test("скан: из локального файла в библиотеку и обратно в хранилище другого ПК", async () => {
  const dir = tmpDir();
  const s1 = await startTestServer();
  const s2 = await startTestServer();
  for (const s of [s1, s2]) await s.req("PUT", "/api/library/settings", { dir });
  const pdf = await makePdf(2);
  const f = await (await s1.raw("POST", "/api/files", { body: pdf as unknown as BodyInit, headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent("паспорт.pdf") } })).json();
  let r = await s1.req("POST", "/api/library/doc", { values: { materials: "Кабель", type: "Паспорт качества", number: "№1", sheets: 2 }, fileId: f.id });
  assert.equal(r.status, 201);
  const [doc] = (await s2.req("GET", "/api/library/doc")).json;
  assert.equal(doc.scan.sha256, f.sha256);
  assert.equal(doc.scan.name, "паспорт.pdf");
  r = await s2.req("POST", `/api/library/files/${doc.scan.sha256}/import`, { name: doc.scan.name, mime: doc.scan.mime });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const got = new Uint8Array(await (await s2.raw("GET", `/api/files/${r.json.fileId}`)).arrayBuffer());
  assert.deepEqual(got, new Uint8Array(pdf));
  r = await s1.req("POST", "/api/library/doc", { values: { materials: "Кабель", type: "Паспорт качества", number: "№1", sheets: 3 } });
  assert.equal((await s1.req("GET", "/api/library/doc")).json[0].scan.sha256, f.sha256, "без нового скана — прежний");
  assert.equal(readdirSync(join(dir, "files")).length, 1);
  assert.equal((await s2.req("POST", `/api/library/files/${"0".repeat(64)}/import`, {})).status, 404);
});
