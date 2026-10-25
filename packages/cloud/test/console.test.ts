// План 24: консоль раздаётся сервером; корень ведёт в неё.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extendCloud } from "@idk/cloud/extend";
import { startCloud } from "./helpers/cloud.ts";

test("консоль: /console/ — страница, / — переход в консоль, чужие пути — 404", async () => {
  const dir = mkdtempSync(join(tmpdir(), "console-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Консоль</title>");
  writeFileSync(join(dir, "console.js"), "console.log(1)");
  const c = await startCloud({ extend: extendCloud("https://id.example.ru", () => new Date(), dir) });
  const page = await fetch(`${c.url}/console/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await page.text(), /Консоль/);
  assert.equal((await fetch(`${c.url}/console/console.js`)).status, 200);
  const root = await fetch(`${c.url}/`, { redirect: "manual" });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get("location"), "/console/");
  assert.equal((await fetch(`${c.url}/console/../package.json`)).status, 404);
});
