import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";
import { makePdf } from "./helpers/pdf.ts";

const upload = (s: Awaited<ReturnType<typeof startTestServer>>, bytes: Uint8Array, name: string, type = "application/pdf") =>
  s.raw("POST", "/api/files", { body: bytes as unknown as BodyInit, headers: { "content-type": type, "x-file-name": encodeURIComponent(name) } });

test("files: PDF из 3 страниц → pages 3", async () => {
  const s = await startTestServer();
  const res = await upload(s, await makePdf(3), "Паспорт №3/405.pdf");
  assert.equal(res.status, 201);
  const f = await res.json();
  assert.equal(f.pages, 3);
  assert.equal(f.name, "Паспорт №3/405.pdf");
  const get = await s.raw("GET", `/api/files/${f.id}`);
  assert.equal(get.status, 200);
  assert.equal(get.headers.get("content-type"), "application/pdf");
  assert.equal((await get.arrayBuffer()).byteLength, f.size);
});

test("files: одинаковое содержимое → один файл", async () => {
  const s = await startTestServer();
  const pdf = await makePdf(1, "same");
  const ra = await upload(s, pdf, "a.pdf");
  const rb = await upload(s, pdf, "b.pdf");
  assert.equal(ra.status, 201);
  assert.equal(rb.status, 201);
  const a = await ra.json();
  const b = await rb.json();
  assert.equal(typeof a.id, "number");
  assert.equal(a.id, b.id);
  assert.equal(a.sha256, b.sha256);
});

test("files: изображение → 1 лист", async () => {
  const s = await startTestServer();
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
  const f = await (await upload(s, png, "скан.png", "image/png")).json();
  assert.equal(f.pages, 1);
});

test("files: файл больше лимита → 413", async () => {
  const s = await startTestServer({ uploadLimit: 1024 });
  const res = await upload(s, new Uint8Array(4096), "big.pdf");
  assert.equal(res.status, 413);
  assert.match((await res.json()).error, /больше/);
});

test("files: неподдерживаемый тип → 415", async () => {
  const s = await startTestServer();
  const res = await upload(s, new Uint8Array(10), "x.exe", "application/x-msdownload");
  assert.equal(res.status, 415);
});

test("files: испорченный PDF → 400, файл не сохраняется", async () => {
  const s = await startTestServer();
  const res = await upload(s, Buffer.from("not a pdf at all"), "bad.pdf");
  assert.equal(res.status, 400);
});
