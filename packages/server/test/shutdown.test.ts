import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { join } from "node:path";
import { openDb } from "@idk/server/db";
import { installShutdown } from "@idk/server/shutdown";
import { tmpDir } from "./helpers/tmp.ts";

test("shutdown: по сигналу база закрывается (WAL сбрасывается в файл)", async () => {
  const db = openDb(join(tmpDir(), "db.sqlite"));
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const proc = new EventEmitter() as EventEmitter & { exit: (c?: number) => void };
  let exitCode: number | undefined;
  proc.exit = (c) => { exitCode = c; };
  installShutdown(db, server, proc);
  proc.emit("SIGINT");
  await new Promise((r) => setTimeout(r, 50));
  assert.throws(() => db.prepare("SELECT 1").get(), /not open/i);
  assert.equal(exitCode, 0);
  assert.equal(server.listening, false);
});
