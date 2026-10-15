import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";

const mat = (name: string, mark = "") => ({ name, mark, article: "", manufacturer: "DKC", unit: "шт." });

test("materials: CRUD", async () => {
  const s = await startTestServer();
  const c = await s.req("POST", "/api/materials", mat("Труба ПВХ жёсткая гладкая, d20 мм", "63920"));
  assert.equal(c.status, 201);
  const u = await s.req("PUT", `/api/materials/${c.json.id}`, { ...mat("Труба ПВХ"), unit: "м." });
  assert.equal(u.json.unit, "м.");
  assert.equal((await s.req("GET", "/api/materials")).json.length, 1);
});

test("quality-docs: один документ на два материала", async () => {
  const s = await startTestServer();
  const m1 = (await s.req("POST", "/api/materials", mat("Муфта труба-труба с ограничителем IP40, d20 мм", "54920"))).json;
  const m2 = (await s.req("POST", "/api/materials", mat("Муфта труба-коробка, IP67, М20х1.5, д.20мм", "50220"))).json;
  const d = await s.req("POST", "/api/quality-docs", {
    type: "info_letter", number: "№2448", issueDate: "2023-02-17", sheets: 2, materialIds: [m1.id, m2.id],
  });
  assert.equal(d.status, 201);
  assert.deepEqual(d.json.materialIds.sort(), [m1.id, m2.id].sort());
  for (const m of [m1, m2]) {
    const list = (await s.req("GET", `/api/materials/${m.id}/quality-docs`)).json;
    assert.equal(list.length, 1);
    assert.equal(list[0].number, "№2448");
  }
});

test("quality-docs: sheets по умолчанию = pages файла", async () => {
  const s = await startTestServer();
  const { makePdf } = await import("./helpers/pdf.ts");
  const f = await (await s.raw("POST", "/api/files", {
    body: (await makePdf(3)) as unknown as BodyInit, headers: { "content-type": "application/pdf", "x-file-name": "c.pdf" },
  })).json();
  const d = await s.req("POST", "/api/quality-docs", { type: "certificate", number: "ЕАЭС RU C-RU.АД38.В.00024/21", fileId: f.id });
  assert.equal(d.json.sheets, 3);
  const d2 = await s.req("POST", "/api/quality-docs", { type: "certificate", number: "x", fileId: f.id, sheets: 2 });
  assert.equal(d2.json.sheets, 2);
});

test("materials: удаление материала не удаляет документ, только связь", async () => {
  const s = await startTestServer();
  const m1 = (await s.req("POST", "/api/materials", mat("A"))).json;
  const m2 = (await s.req("POST", "/api/materials", mat("B"))).json;
  const d = (await s.req("POST", "/api/quality-docs", { type: "passport", number: "1", materialIds: [m1.id, m2.id] })).json;
  assert.equal((await s.req("DELETE", `/api/materials/${m1.id}`)).status, 204);
  const doc = (await s.req("GET", `/api/quality-docs/${d.id}`)).json;
  assert.deepEqual(doc.materialIds, [m2.id]);
});

test("quality-docs: несуществующий материал → 400", async () => {
  const s = await startTestServer();
  const r = await s.req("POST", "/api/quality-docs", { type: "passport", number: "1", materialIds: [999] });
  assert.equal(r.status, 400);
});
