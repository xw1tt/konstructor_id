import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { openDb } from "@idk/server/db";
import { loadConfig } from "@idk/server/config";
import { tmpDir } from "./helpers/tmp.ts";

test("db: миграции применяются один раз", () => {
  const p = join(tmpDir(), "db.sqlite");
  openDb(p).close();
  const db = openDb(p);
  const rows = db.prepare("SELECT name FROM schema_migrations").all();
  assert.equal(rows.length, 1);
  db.close();
});

test("db: внешние ключи включены", () => {
  const db = openDb(join(tmpDir(), "db.sqlite"));
  assert.throws(() =>
    db.prepare("INSERT INTO representatives (role, full_name, org_id) VALUES ('builder','X',999)").run(),
  );
});

test("config: значения по умолчанию и переопределение", () => {
  assert.equal(loadConfig({}).port, 3443);
  assert.equal(loadConfig({ IDK_DATA_DIR: "/x" }).dataDir, "/x");
  assert.equal(loadConfig({ LOCALAPPDATA: "C:\\L" }).dataDir.replaceAll("\\", "/"), "C:/L/KonstruktorID");
});
