import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { startTestServer } from "./helpers/server.ts";

const bundle = async () => buildBundle(await readBook(aov1Book()), AOV1, defaultImportant()).bundle!;

test("неизвестный шаблон — 400 с текстом", async () => {
  const s = await startTestServer();
  const r = await s.req("POST", "/api/print-jobs", { ...(await bundle()), template: "abc" });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, "Неизвестный шаблон: abc");
  const p = await s.req("POST", "/api/print/aosr", { ...(await bundle()), template: "abc" });
  assert.equal(p.status, 400);
  assert.equal(p.json.error, "Неизвестный шаблон: abc");
});

test("без поля template — задание создаётся (СБД)", async () => {
  const s = await startTestServer();
  assert.equal((await s.req("POST", "/api/print-jobs", await bundle())).status, 201);
});

test("template: sbd — задание создаётся", async () => {
  const s = await startTestServer();
  assert.equal((await s.req("POST", "/api/print-jobs", { ...(await bundle()), template: "sbd" })).status, 201);
});
