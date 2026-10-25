import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { startTestServer } from "./helpers/server.ts";
import { makePdf } from "./helpers/pdf.ts";
import { serialBytes } from "@idk/server/tls/x509";

test("hardening: битая %-кодировка в пути → 400, сервер жив", async () => {
  const s = await startTestServer();
  const r = await s.raw("GET", "/api/files/%E0");
  assert.equal(r.status, 400);
  const r2 = await s.raw("GET", "/addin/%E0");
  assert.ok(r2.status === 400 || r2.status === 404);
  assert.equal((await s.req("GET", "/api/templates")).status, 200);
});

test("hardening: скан удалён с диска → 404, сервер жив", async () => {
  const s = await startTestServer();
  const f = await (await s.raw("POST", "/api/files", {
    body: (await makePdf(1)) as unknown as BodyInit, headers: { "content-type": "application/pdf", "x-file-name": "a.pdf" },
  })).json();
  const dir = join(s.dataDir, "files", f.sha256.slice(0, 2));
  for (const n of readdirSync(dir)) rmSync(join(dir, n));
  const r = await s.raw("GET", `/api/files/${f.id}`);
  assert.equal(r.status, 404);
  assert.equal((await s.req("GET", "/api/templates")).status, 200);
});

test("csrf: тело не JSON (text/plain) → 415", async () => {
  const s = await startTestServer();
  const r = await s.raw("POST", "/api/print-jobs", {
    headers: { "content-type": "text/plain" }, body: JSON.stringify({ act: {} }),
  });
  assert.equal(r.status, 415);
});

test("csrf: чужой Origin на изменение → 403, свой — проходит", async () => {
  const s = await startTestServer();
  const body = JSON.stringify({ act: {} });
  const evil = await s.raw("POST", "/api/print-jobs", {
    headers: { "content-type": "application/json", origin: "https://evil.example" }, body,
  });
  assert.equal(evil.status, 403);
  const evilUpload = await s.raw("POST", "/api/files", {
    headers: { "content-type": "application/pdf", origin: "https://evil.example" }, body: (await makePdf(1)) as unknown as BodyInit,
  });
  assert.equal(evilUpload.status, 403);
  const own = await s.raw("POST", "/api/print-jobs", {
    headers: { "content-type": "application/json", origin: "https://localhost:3443" }, body,
  });
  assert.equal(own.status, 400, "свой Origin проходит до проверки тела");
});

test("ответ загрузки не раскрывает внутренний путь", async () => {
  const s = await startTestServer();
  const f = await (await s.raw("POST", "/api/files", {
    body: (await makePdf(1, "p")) as unknown as BodyInit, headers: { "content-type": "application/pdf", "x-file-name": "a.pdf" },
  })).json();
  assert.equal(f.path, undefined);
});

test("tls: серийный номер — минимальный положительный DER INTEGER", () => {
  for (let i = 0; i < 2000; i++) {
    const b = serialBytes();
    assert.ok(b[0] >= 0x40 && b[0] <= 0x7f, `первый байт ${b[0]}`);
  }
});

test("скрипты Windows: .ps1 с BOM, .cmd только ASCII", () => {
  const root = join(import.meta.dirname, "..", "..", "..", "scripts");
  for (const n of readdirSync(root)) {
    const buf = readFileSync(join(root, n));
    if (n.endsWith(".ps1")) assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], n);
    if (n.endsWith(".cmd")) assert.ok([...buf].every((c) => c < 0x80), `${n} содержит не-ASCII`);
  }
});
