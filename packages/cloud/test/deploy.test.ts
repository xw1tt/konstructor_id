// План 25, задача 2: файлы развёртывания согласованы с сервером.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { startCloud } from "./helpers/cloud.ts";

const read = (f: string) => readFileSync(new URL(`../../../deploy/${f}`, import.meta.url), "utf8");

test("compose, Caddy, Dockerfile, установка — переменные, порт, команды", () => {
  const compose = read("docker-compose.yml"), caddy = read("Caddyfile"), docker = read("Dockerfile"), install = read("install.sh");
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  for (const v of ["DATABASE_URL", "PUBLIC_URL", "ALLOWED_ORIGINS", "PORT"]) {
    assert.ok(compose.includes(`${v}:`), `compose: ${v}`);
    assert.ok(main.includes(`env.${v}`), `main.ts читает ${v}`);
  }
  assert.match(compose, /PORT: "8080"/);
  assert.match(caddy, /reverse_proxy app:8080/);
  assert.match(compose, /https:\/\/localhost:3443/);
  assert.match(docker, /CMD \["npx", "tsx", "packages\/cloud\/src\/main\.ts"\]/);
  assert.ok(existsSync(new URL("../src/main.ts", import.meta.url)));
  assert.match(install, /create-owner "\$OWNER"/);
  assert.match(install, /sslip\.io/);
  assert.match(install, /\/api\/health/);
  assert.match(read("backup.sh"), /pg_dump -h db -U idk idk/);
});

test("/api/health — сервер и база работают", async () => {
  const c = await startCloud();
  assert.deepEqual((await c.req("GET", "/api/health")).json, { ok: true });
});

test("Облако.cmd — только латиница (cmd путает метки в UTF-8); логика в cloud.ps1: UTF-8 с BOM, меню, права ключа, команды", () => {
  const cmd = readFileSync(new URL("../../../deploy/windows/Облако.cmd", import.meta.url));
  assert.ok([...cmd].every((b) => b < 128), "в Облако.cmd нет не-ASCII символов");
  assert.match(cmd.toString(), /powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cloud\.ps1"/);
  const ps = readFileSync(new URL("../../../deploy/windows/cloud.ps1", import.meta.url));
  assert.deepEqual([...ps.subarray(0, 3)], [0xef, 0xbb, 0xbf], "BOM — иначе Windows PowerShell 5.1 прочитает кириллицу неверно");
  const s = ps.toString("utf8");
  assert.ok(!/[^\r]\n/.test(s), "строки — CRLF");
  assert.match(s, /icacls \$Key \/inheritance:r/);
  assert.match(s, /StrictHostKeyChecking=accept-new/);
  assert.match(s, /sudo bash deploy\/install\.sh '\$\(\$s\.Email\)' '\$\(\$s\.Domain\)'/);
  assert.match(s, /sudo bash deploy\/update\.sh/);
  assert.match(s, /create-owner '\$\(\$s\.Email\)'/);
  assert.match(s, /konstruktor-cloud-\*\.tar\.gz/);
  for (const m of ["1", "2", "3", "4", "5", "6"]) assert.ok(s.includes(`  ${m} — `), `пункт ${m}`);
});
