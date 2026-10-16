import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";
import { openDb } from "@idk/server/db";
import { seedSbdAov1 } from "@idk/server/seed/sbdAov1";
import { join } from "node:path";
import { bundleFromDb } from "@idk/server/print/fromDb";

test("pdf: нет браузера → 503, сервер жив", async () => {
  process.env.IDK_BROWSER = "/nonexistent/browser";
  const s = await startTestServer();
  const { actId } = seedSbdAov1(openDb(join(s.dataDir, "db.sqlite")));
  const r = await s.req("POST", "/api/print/aosr", bundleFromDb(openDb(join(s.dataDir, "db.sqlite")), actId));
  assert.equal(r.status, 503);
  assert.equal(r.json.error, "Не найден браузер для печати: установите Microsoft Edge или укажите IDK_BROWSER");
  assert.equal((await s.req("GET", "/api/export")).status, 200);
});
