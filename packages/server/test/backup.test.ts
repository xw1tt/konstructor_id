import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "@idk/server/db";
import { runDailyBackup } from "@idk/server/backup";
import { tmpDir } from "./helpers/tmp.ts";

test("backup: одна копия в день, хранится 30", () => {
  const d = tmpDir();
  const db = openDb(join(d, "db.sqlite"));
  db.prepare("INSERT INTO materials (name) VALUES ('Кабель')").run();
  db.close();
  mkdirSync(join(d, "files", "ab"), { recursive: true });
  writeFileSync(join(d, "files", "ab", "x.pdf"), "pdf");
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 32; i++) assert.ok(runDailyBackup(d, new Date(start + i * 86400000)));
  assert.equal(runDailyBackup(d, new Date(start + 31 * 86400000)), null);
  const dirs = readdirSync(join(d, "backups")).sort();
  assert.equal(dirs.length, 30);
  assert.equal(dirs[0], "2026-01-03");
  const last = join(d, "backups", dirs[29]);
  assert.ok(existsSync(join(last, "files", "ab", "x.pdf")));
  const copy = openDb(join(last, "db.sqlite"));
  assert.equal((copy.prepare("SELECT COUNT(*) n FROM materials").get() as any).n, 1);
});
