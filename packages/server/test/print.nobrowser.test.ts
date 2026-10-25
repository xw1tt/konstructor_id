import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";
import { aov1Bundle } from "./helpers/aov1.ts";

test("pdf: нет браузера → 503, сервер жив", async () => {
  process.env.IDK_BROWSER = "/nonexistent/browser";
  const s = await startTestServer();
  const r = await s.req("POST", "/api/print/aosr", await aov1Bundle());
  assert.equal(r.status, 503);
  assert.equal(r.json.error, "Не найден браузер для печати: установите Microsoft Edge или укажите IDK_BROWSER");
  assert.equal((await s.req("GET", "/api/templates")).status, 200);
});
