import { test, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { openDb } from "@idk/server/db";
import { seedSbdAov1 } from "@idk/server/seed/sbdAov1";
import { buildDocDataFromBundle } from "@idk/server/print/fromBundle";
import { bundleFromDb } from "@idk/server/print/fromDb";
import { DOC_KINDS } from "@idk/shared/acts/schemas";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { ExportData, exportToBook, exportLinks, writeBook, isEmptyExport } from "@idk/shared/workbook/migrate";
import { startTestServer } from "./helpers/server.ts";

const ORIGIN = "https://localhost:3443";

test("база → выгрузка → книга → пакет даёт те же документы, что база", async () => {
  const s = await startTestServer();
  const db = openDb(join(s.dataDir, "db.sqlite"));
  after(() => db.close());
  const { actId } = seedSbdAov1(db);
  const r = await s.req("GET", "/api/export");
  assert.equal(r.status, 200);
  const exp = ExportData.parse(r.json);
  assert.equal(exp.acts.length, 1);
  const wb = new MemoryWorkbook();
  await writeBook(wb, exportToBook(exp, ORIGIN), exportLinks(exp, ORIGIN));
  const { bundle, issues } = buildBundle(await readBook(wb), "К32.В.СТ.АОВ1.01.00.1", defaultImportant());
  assert.deepEqual(issues, []);
  for (const k of DOC_KINDS) assert.deepEqual(buildDocDataFromBundle(bundle!, k), buildDocDataFromBundle(bundleFromDb(db, actId), k), k);
});

test("пустая база — пустая выгрузка", async () => {
  const s = await startTestServer();
  const r = await s.req("GET", "/api/export");
  assert.equal(r.status, 200);
  assert.equal(isEmptyExport(ExportData.parse(r.json)), true);
});
