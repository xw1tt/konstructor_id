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

test("Облако.cmd: строки CRLF, кодировка UTF-8, права ключа, пункты меню, команды сервера", () => {
  const buf = readFileSync(new URL("../../../deploy/windows/Облако.cmd", import.meta.url));
  const s = buf.toString("utf8");
  assert.ok(!/[^\r]\n/.test(s), "строки — CRLF");
  assert.match(s, /^@echo off\r\nchcp 65001/);
  assert.match(s, /icacls "%KEY%" \/inheritance:r/);
  assert.match(s, /StrictHostKeyChecking=accept-new/);
  assert.match(s, /sudo bash deploy\/install\.sh '!EMAIL!' '!DOMAIN!'/);
  assert.match(s, /sudo bash deploy\/update\.sh/);
  assert.match(s, /create-owner '!EMAIL!'/);
  assert.match(s, /konstruktor-cloud-\*\.tar\.gz/);
  // В блоках if ( … ) скобки в тексте экранированы, иначе cmd закроет блок раньше.
  for (const line of s.split("\r\n").filter((l) => /^\s{2,}echo /.test(l))) assert.ok(!/[^^][()]/.test(line.replace(/^\s+echo /, "")), line);
});
