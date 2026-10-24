import { test, after } from "node:test";
import { closeBrowser } from "@idk/server/print/browser";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { startTestServer } from "./helpers/server.ts";

after(() => closeBrowser());

const bundle = async () => buildBundle(await readBook(aov1Book()), AOV1, defaultImportant()).bundle!;

test("шаблон пользователя или неизвестный — встроенные документы печатаются по формам СБД", async () => {
  const s = await startTestServer();
  const r = await s.req("POST", "/api/print-jobs", { ...(await bundle()), template: "t-00000000-0000-0000-0000-000000000000" });
  assert.equal(r.status, 201);
  const p = await s.raw("POST", "/api/print/aosr", { headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(await bundle()), template: "abc" }) });
  assert.equal(p.status, 200);
  await p.arrayBuffer();
});

test("без поля template — задание создаётся (СБД)", async () => {
  const s = await startTestServer();
  assert.equal((await s.req("POST", "/api/print-jobs", await bundle())).status, 201);
});

test("template: sbd — задание создаётся", async () => {
  const s = await startTestServer();
  assert.equal((await s.req("POST", "/api/print-jobs", { ...(await bundle()), template: "sbd" })).status, 201);
});
