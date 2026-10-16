import { test, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { startTestServer } from "./helpers/server.ts";
import { openDb } from "@idk/server/db";
import { seedSbdAov1 } from "@idk/server/seed/sbdAov1";
import { closeBrowser, htmlToPdf, currentBrowserForTests } from "@idk/server/print/browser";

after(() => closeBrowser());

test("print: после падения браузера печать восстанавливается", async () => {
  await htmlToPdf("<p>1</p>");
  const b = await currentBrowserForTests();
  await b!.close(); // имитация: Edge закрыт обновлением
  const pdf = await htmlToPdf("<p>2</p>");
  assert.ok(pdf.length > 100);
});

test("acts: новый акт — подписанты ВОР по умолчанию", async () => {
  const s = await startTestServer();
  const db = openDb(join(s.dataDir, "db.sqlite"));
  seedSbdAov1(db);
  const a = (await s.req("POST", "/api/acts", { baseNumber: "К32.В.СТ.АОВ1.01.00.2", date: "2026-08-30" })).json;
  const reps = (await s.req("GET", "/api/representatives")).json;
  const name = (id: number) => reps.find((r: any) => r.id === id)?.fullName;
  assert.equal(name(a.vorCustomerRepId), "Валерьянов А.А.");
  assert.equal(name(a.vorContractorRepId), "Востров В.П.");
});

test("acts: материал убран из акта — его строки ВОР удаляются", async () => {
  const s = await startTestServer();
  const m1 = (await s.req("POST", "/api/materials", { name: "Кабель" })).json;
  const m2 = (await s.req("POST", "/api/materials", { name: "Труба" })).json;
  const a = (await s.req("POST", "/api/acts", { baseNumber: "A1", date: "2026-07-28" })).json;
  await s.req("PUT", `/api/acts/${a.id}/materials`, [{ materialId: m1.id }, { materialId: m2.id }]);
  await s.req("PUT", `/api/acts/${a.id}/vor`, [{ group: "П5", materialId: m1.id, quantity: 1 }, { group: "П5", materialId: m2.id, quantity: 2 }]);
  await s.req("PUT", `/api/acts/${a.id}/materials`, [{ materialId: m1.id }]);
  const full = (await s.req("GET", `/api/acts/${a.id}/full`)).json;
  assert.deepEqual(full.vor.map((v: any) => v.materialId), [m1.id]);
});

test("acts: повтор материала в одном запросе → 400, а не 500", async () => {
  const s = await startTestServer();
  const m1 = (await s.req("POST", "/api/materials", { name: "Кабель" })).json;
  const a = (await s.req("POST", "/api/acts", { baseNumber: "A1", date: "2026-07-28" })).json;
  const r = await s.req("PUT", `/api/acts/${a.id}/materials`, [{ materialId: m1.id }, { materialId: m1.id }]);
  assert.equal(r.status, 400);
});

test("acts: строка ВОР с материалом не из акта → 400", async () => {
  const s = await startTestServer();
  const m1 = (await s.req("POST", "/api/materials", { name: "Кабель" })).json;
  const m2 = (await s.req("POST", "/api/materials", { name: "Труба" })).json;
  const a = (await s.req("POST", "/api/acts", { baseNumber: "A1", date: "2026-07-28" })).json;
  await s.req("PUT", `/api/acts/${a.id}/materials`, [{ materialId: m1.id }]);
  const r = await s.req("PUT", `/api/acts/${a.id}/vor`, [{ group: "П5", materialId: m2.id, quantity: 1 }]);
  assert.equal(r.status, 400);
  assert.match(r.json.error, /не входит в акт/);
});
