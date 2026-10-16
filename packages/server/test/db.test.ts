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
  assert.equal(rows.length, 3);
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

test("db: миграция 002 применяется к базе плана 1", async () => {
  const { readFileSync } = await import("node:fs");
  const { DatabaseSync } = await import("node:sqlite");
  const p = join(tmpDir(), "old.sqlite");
  // база в состоянии плана 1: только 001
  const raw = new DatabaseSync(p);
  raw.exec("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY)");
  raw.exec(readFileSync(new URL("../src/migrations/001_init.sql", import.meta.url), "utf8"));
  raw.prepare("INSERT INTO schema_migrations VALUES ('001_init.sql')").run();
  raw.prepare("INSERT INTO organizations (short_name, full_name) VALUES ('ООО \"СБД\"', 'x')").run();
  raw.close();
  const db = openDb(p);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM schema_migrations").get() as any).n, 3);
  assert.equal((db.prepare("SELECT short_name FROM organizations").get() as any).short_name, 'ООО "СБД"');
  db.prepare("SELECT registry_name FROM quality_docs").all();
  db.prepare("SELECT act_text FROM representatives").all();
  db.prepare("SELECT * FROM acts").all();
});
