// 0.52: сервер сканов — скан, загруженный на одном компьютере, открывается на другом без ручного копирования.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startTestServer } from "./helpers/server.ts";
import { makePdf } from "./helpers/pdf.ts";

const wait = async (cond: () => Promise<boolean>, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("не дождались");
};

test("скан с компьютера А попадает на сервер и открывается на компьютере Б по ссылке книги", async () => {
  const hub = await startTestServer({ hubToken: "secret-123" });
  const via =
    (base: string): typeof fetch =>
    (url, init) =>
      fetch(String(url).replace("https://hub.example", base), init);
  const a = await startTestServer({ fetchImpl: via(hub.url) });
  const b = await startTestServer({ fetchImpl: via(hub.url) });
  for (const pc of [a, b]) assert.equal((await pc.req("PUT", "/api/hub/config", { url: "https://hub.example/", token: "secret-123" })).status, 200);
  assert.equal((await a.req("POST", "/api/hub/test")).json.ok, true);

  const pdf = await makePdf(2);
  const sha = createHash("sha256").update(pdf).digest("hex");
  const up = await a.raw("POST", "/api/files", {
    headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent("Паспорт.pdf") },
    body: Buffer.from(pdf),
  });
  assert.equal(up.status, 201);
  await wait(async () => (await hub.req("GET", "/api/hub/status")).status === 200 && (await a.req("GET", "/api/hub/status")).json.pushed === 1);

  // Компьютер Б: такого файла нет — ссылка из книги скачивает его с сервера.
  const got = await b.raw("GET", `/api/files/1?sha=${sha}`);
  assert.equal(got.status, 200);
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(await got.arrayBuffer()))
      .digest("hex"),
    sha,
  );
  assert.match(decodeURIComponent(got.headers.get("content-disposition") ?? ""), /Паспорт\.pdf/);
  assert.equal((await b.req("GET", `/api/files/1/pages?sha=${sha}`)).json.pages, 2);

  // Фоновая сверка: неизвестный скан — «нет ни здесь, ни на сервере».
  const other = "a".repeat(64);
  await b.req("POST", "/api/hub/sync", { shas: [sha, other] });
  await wait(async () => !(await b.req("GET", "/api/hub/status")).json.running);
  assert.equal((await b.req("GET", "/api/hub/status")).json.missing, 1);
});

test("сервер сканов: без ключа — отказ; без IDK_HUB_TOKEN — выключен; адрес только https", async () => {
  const hub = await startTestServer({ hubToken: "k" });
  assert.equal((await hub.raw("GET", "/api/hub/ping")).status, 401);
  assert.equal((await hub.raw("GET", "/api/hub/ping", { headers: { authorization: "Bearer wrong" } })).status, 401);
  assert.equal((await hub.raw("GET", "/api/hub/ping", { headers: { authorization: "Bearer k" } })).status, 200);
  const plain = await startTestServer();
  assert.equal((await plain.raw("GET", "/api/hub/ping", { headers: { authorization: "Bearer k" } })).status, 404);
  assert.equal((await plain.req("PUT", "/api/hub/config", { url: "http://1.2.3.4", token: "k" })).status, 400);
  assert.deepEqual((await plain.req("GET", "/api/hub/config")).json, { url: "", hasToken: false });
});
