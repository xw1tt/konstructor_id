import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";

test("старые маршруты базы удалены, выгрузка и печать на месте", async () => {
  const s = await startTestServer();
  for (const p of ["/api/acts", "/api/materials", "/api/object", "/api/organizations", "/api/quality-docs"])
    assert.equal((await s.req("GET", p)).status, 404, p);
  assert.equal((await s.req("GET", "/api/export")).status, 200);
  assert.equal((await s.req("GET", "/api/print-jobs/x/aosr")).status, 404);
});
