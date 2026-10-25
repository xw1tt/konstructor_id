// План 11: шаблоны пользователя — хранение и API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";
import { makeDocx, p, r } from "./helpers/docx.ts";
import { makePdf } from "./helpers/pdf.ts";

const upload = (s: Awaited<ReturnType<typeof startTestServer>>, id: string, buf: Uint8Array, name: string) =>
  s.raw("POST", `/api/templates/${id}/forms`, { body: buf as unknown as BodyInit, headers: { "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(name) } });

test("список, копия «СБД», переименование, свой документ, удаление", async () => {
  const s = await startTestServer();
  const list = await s.req("GET", "/api/templates");
  assert.equal(list.json[0].id, "sbd");
  const c = await s.req("POST", "/api/templates", { name: "ПИК", from: "sbd" });
  assert.equal(c.status, 201);
  assert.equal(c.json.name, "ПИК");
  assert.deepEqual(c.json.docs, list.json[0].docs);
  const docs = [...c.json.docs, { kind: "custom", code: "АГИ", name: "Акт гидр. испытаний", form: null }];
  const put = await s.req("PUT", `/api/templates/${c.json.id}`, { name: "ПИК-2", docs });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  assert.equal((await s.req("GET", "/api/templates")).json[2].name, "ПИК-2");
  const bad = await s.req("PUT", `/api/templates/${c.json.id}`, { name: "ПИК-2", docs: [{ kind: "custom", code: "АОСР", name: "x", form: null }] });
  assert.equal(bad.status, 422);
  assert.equal(bad.json.error, "Код «АОСР» занят встроенным документом");
  assert.equal((await s.req("PUT", "/api/templates/sbd", { name: "X", docs: [] })).status, 400);
  const del = await s.req("DELETE", "/api/templates/sbd");
  assert.equal(del.status, 400);
  assert.equal(del.json.error, "Встроенный шаблон «СБД» не удаляется");
  assert.equal((await s.req("DELETE", `/api/templates/${c.json.id}`)).status, 204);
  assert.equal((await s.req("GET", "/api/templates")).json.length, 2, "встроенные «СБД» и «ТИ»");
});

test("формы: .docx принимается, PDF и .doc — 422; скачивание", async () => {
  const s = await startTestServer();
  const { json: t } = await s.req("POST", "/api/templates", { name: "Т" });
  assert.deepEqual(t.docs, []);
  const docx = makeDocx(p(r("{Акт.Номер}")));
  const res = await upload(s, t.id, docx, "АОСР ПИК.docx");
  assert.equal(res.status, 201);
  const form = await res.json();
  assert.equal(form.type, "docx");
  assert.equal(form.original, "АОСР ПИК.docx");
  const get = await s.raw("GET", `/api/templates/${t.id}/forms/${form.file}`);
  assert.equal(Buffer.compare(Buffer.from(await get.arrayBuffer()), docx), 0);
  const pdf = await upload(s, t.id, await makePdf(1), "a.pdf");
  assert.equal(pdf.status, 422);
  assert.equal((await pdf.json()).error, "Нужен файл Word (.docx) или Excel (.xlsx). Старые .doc/.xls сохраните в новом формате");
});

test("выгрузка и загрузка шаблона; шаблоны переживают перезапуск", async () => {
  const s = await startTestServer();
  const { json: t } = await s.req("POST", "/api/templates", { name: "Свой" });
  const form = await (await upload(s, t.id, makeDocx(p(r("{Акт.Номер}"))), "f.docx")).json();
  await s.req("PUT", `/api/templates/${t.id}`, { name: "Свой", docs: [{ kind: "custom", code: "АГИ", name: "Акт", form }] });
  const exp = await s.raw("GET", `/api/templates/${t.id}/export`);
  assert.match(decodeURIComponent(exp.headers.get("content-disposition") ?? ""), /Свой\.idk-template/);
  const zip = new Uint8Array(await exp.arrayBuffer());
  const s2 = await startTestServer();
  const imp = await s2.raw("POST", "/api/templates/import", { body: zip as unknown as BodyInit, headers: { "content-type": "application/octet-stream" } });
  assert.equal(imp.status, 201);
  const t2 = await imp.json();
  assert.notEqual(t2.id, t.id);
  assert.equal(t2.docs[0].code, "АГИ");
  assert.equal((await s2.raw("GET", `/api/templates/${t2.id}/forms/${t2.docs[0].form.file}`)).status, 200);
  const again = await startTestServer({ dataDir: s.dataDir });
  assert.equal((await again.req("GET", "/api/templates")).json[2].name, "Свой");
});

test("п.4 АОСР сохраняется в шаблоне", async () => {
  const s = await startTestServer();
  const { json: t } = await s.req("POST", "/api/templates", { name: "П4", from: "sbd" });
  assert.deepEqual(t.print, { schemeEach: false, formSet: "sbd", forms: {}, kjReserve: 2 });
  const put = await s.req("PUT", `/api/templates/${t.id}`, { name: "П4", docs: t.docs, print: { schemeEach: true } });
  assert.equal(put.status, 200);
  assert.deepEqual((await s.req("GET", "/api/templates")).json.find((x: any) => x.id === t.id).print, { schemeEach: true, formSet: "sbd", forms: {}, kjReserve: 2 });
  const copy = await s.req("POST", "/api/templates", { name: "Копия", from: t.id });
  assert.deepEqual(copy.json.print, { schemeEach: true, formSet: "sbd", forms: {}, kjReserve: 2 }, "копия наследует настройку");
});
