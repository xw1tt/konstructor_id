import { test, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { openDb } from "@idk/server/db";
import { seedSbdAov1 } from "@idk/server/seed/sbdAov1";
import { buildDocDataFromBundle } from "@idk/server/print/fromBundle";
import { bundleFromDb } from "@idk/server/print/fromDb";
import { createPrintJobs } from "@idk/server/routes/print";
import { closeBrowser } from "@idk/server/print/browser";
import { DOC_KINDS } from "@idk/shared/acts/schemas";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { startTestServer } from "./helpers/server.ts";
import { pdfPages } from "./helpers/pdftext.ts";
import { tmpDir } from "./helpers/tmp.ts";

after(() => closeBrowser());

const bookBundle = async () => buildBundle(await readBook(aov1Book()), AOV1, defaultImportant()).bundle!;

test("пакет из книги даёт те же данные документов, что база", async () => {
  const db = openDb(join(tmpDir(), "db.sqlite"));
  const { actId } = seedSbdAov1(db);
  const fromBook = await bookBundle();
  for (const k of DOC_KINDS) assert.deepEqual(buildDocDataFromBundle(fromBook, k), buildDocDataFromBundle(bundleFromDb(db, actId), k), k);
});

test("POST /api/print/aosr → PDF с номером акта", async () => {
  const s = await startTestServer();
  const r = await s.raw("POST", "/api/print/aosr", {
    headers: { "content-type": "application/json" }, body: JSON.stringify(await bookBundle()),
  });
  assert.equal(r.status, 200, await r.clone().text());
  assert.ok((r.headers.get("content-disposition") ?? "").includes(encodeURIComponent(`${AOV1}.АОСР.pdf`)));
  assert.ok((await pdfPages(new Uint8Array(await r.arrayBuffer()))).join(" ").includes(`${AOV1}.АОСР`));
});

test("POST /api/print-jobs → id; GET …/:id/vd → PDF", async () => {
  const s = await startTestServer();
  const created = await s.req("POST", "/api/print-jobs", await bookBundle());
  assert.equal(created.status, 201);
  assert.match(created.json.id, /^[0-9a-f-]{36}$/);
  const r = await s.raw("GET", `/api/print-jobs/${created.json.id}/vd`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/pdf");
  const bad = await s.req("GET", `/api/print-jobs/${created.json.id}/xyz`);
  assert.equal(bad.status, 400);
});

test("неизвестное задание — 404 с текстом", async () => {
  const s = await startTestServer();
  const r = await s.req("GET", "/api/print-jobs/00000000-0000-0000-0000-000000000000/aosr");
  assert.equal(r.status, 404);
  assert.equal(r.json.error, "Задание печати не найдено или устарело");
});

test("задание живёт 30 минут, хранится не больше 50", async () => {
  let now = 0;
  const jobs = createPrintJobs(() => now);
  const b = await bookBundle();
  const id = jobs.add(b);
  now = 29 * 60_000;
  assert.ok(jobs.get(id));
  now = 31 * 60_000;
  assert.equal(jobs.get(id), undefined);
  const first = jobs.add(b);
  for (let i = 0; i < 50; i++) jobs.add(b);
  assert.equal(jobs.get(first), undefined);
});

test("кривой пакет — 400", async () => {
  const s = await startTestServer();
  assert.equal((await s.req("POST", "/api/print-jobs", { act: {} })).status, 400);
});
