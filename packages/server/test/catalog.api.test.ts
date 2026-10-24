// План 12, задача 2: API справочника — итоговый справочник, дополнения, перенос с шаблоном.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.ts";

const pik = { code: "ПИК", name: "Протокол испытания кабеля повышенным напряжением", clause344: 7, source: "", make: "scan", scope: "act" };
const emWork = { code: "Прокладка лотков", name: "Монтаж кабельных лотков", docs: ["ПИК", "АОСР"] };
const emSection = { code: "ЭМ", name: "Электромонтажные работы", works: [emWork] };

test("API: встроенный справочник, дополнения сохраняются и отдаются", async () => {
  const s = await startTestServer();
  const base = await s.req("GET", "/api/catalog");
  assert.equal(base.status, 200);
  assert.deepEqual(base.json.own, []);
  assert.deepEqual(base.json.hidden, []);
  assert.ok(base.json.catalog.docs.some((d: any) => d.code === "АОСР"));
  assert.ok(base.json.catalog.sections.some((x: any) => x.code === "ЭМ"));

  const put = await s.req("PUT", "/api/catalog/user", { docs: [pik], sections: [emSection], hidden: [] });
  assert.equal(put.status, 200, JSON.stringify(put.json));

  const got = await s.req("GET", "/api/catalog");
  assert.ok(got.json.catalog.docs.some((d: any) => d.code === "ПИК"));
  assert.deepEqual(got.json.own, ["ПИК", "Прокладка лотков"]);
  const em = got.json.catalog.sections.find((x: any) => x.code === "ЭМ");
  assert.ok(em.works.some((w: any) => w.code === "Прокладка лотков"));
});

test("API: конфликт кода и битые ссылки — 422, дополнения не сохраняются", async () => {
  const s = await startTestServer();
  const bad = await s.req("PUT", "/api/catalog/user", { docs: [{ ...pik, code: "АОСР" }], sections: [], hidden: [] });
  assert.equal(bad.status, 422);
  assert.equal(bad.json.error, "Код «АОСР» занят встроенным документом");
  assert.deepEqual((await s.req("GET", "/api/catalog")).json.own, []);

  const bad2 = await s.req("PUT", "/api/catalog/user", { docs: [], sections: [{ code: "ЭМ", name: "x", works: [{ code: "w", name: "w", docs: ["НЕТ"] }] }], hidden: [] });
  assert.equal(bad2.status, 422);
  assert.equal(bad2.json.error, "Вид работ «w» ссылается на неизвестный документ «НЕТ»");
});

test("API: скрытый документ не в выборе, но находится по коду", async () => {
  const s = await startTestServer();
  const put = await s.req("PUT", "/api/catalog/user", { docs: [], sections: [], hidden: ["ВОР"] });
  assert.equal(put.status, 200);
  const { json } = await s.req("GET", "/api/catalog");
  assert.deepEqual(json.hidden, ["ВОР"]);
  assert.ok(json.catalog.docs.some((d: any) => d.code === "ВОР"));
  const refs = json.catalog.sections.flatMap((sec: any) => sec.works.flatMap((w: any) => w.docs));
  assert.ok(!refs.includes("ВОР"));
});

test("шаблон: выгрузка со своим документом справочника — загрузка на чистом сервере даёт его", async () => {
  const s = await startTestServer();
  const put = await s.req("PUT", "/api/catalog/user", { docs: [pik], sections: [emSection], hidden: [] });
  assert.equal(put.status, 200);
  const t = await s.req("POST", "/api/templates", { name: "СЭЛ" });
  const save = await s.req("PUT", `/api/templates/${t.json.id}`, {
    name: "СЭЛ", docs: [{ kind: "custom", code: "ПИК", name: "Протокол испытания кабеля", form: null }],
  });
  assert.equal(save.status, 200, JSON.stringify(save.json));
  const exp = await s.raw("GET", `/api/templates/${t.json.id}/export`);
  const zip = new Uint8Array(await exp.arrayBuffer());

  const s2 = await startTestServer();
  const imp = await s2.raw("POST", "/api/templates/import", { body: zip as unknown as BodyInit, headers: { "content-type": "application/octet-stream" } });
  assert.equal(imp.status, 201);
  const got = await s2.req("GET", "/api/catalog");
  assert.ok(got.json.catalog.docs.some((d: any) => d.code === "ПИК"));
  assert.ok(got.json.own.includes("ПИК"));
});

test("шаблон: свой вид работ переживает выгрузку и загрузку", async () => {
  const s = await startTestServer();
  await s.req("PUT", "/api/catalog/user", {
    docs: [pik],
    sections: [{ code: "ЭМ", name: "Электромонтажные работы", works: [{ code: "w1", name: "w1", docs: ["ПИК", "АОСР"] }] }],
    hidden: [],
  });
  const t = await s.req("POST", "/api/templates", { name: "Т" });
  const save = await s.req("PUT", `/api/templates/${t.json.id}`, {
    name: "Т", docs: [{ kind: "custom", code: "ПИК", name: "Протокол", form: null, catalog: "ПИК", works: ["w1"] }],
  });
  assert.equal(save.status, 200, JSON.stringify(save.json));
  const exp = await s.raw("GET", `/api/templates/${t.json.id}/export`);
  const zip = new Uint8Array(await exp.arrayBuffer());

  const s2 = await startTestServer();
  const imp = await s2.raw("POST", "/api/templates/import", { body: zip as unknown as BodyInit, headers: { "content-type": "application/octet-stream" } });
  assert.equal(imp.status, 201);
  const got = await s2.req("GET", "/api/catalog");
  assert.ok(got.json.own.includes("w1"));
  assert.ok(got.json.catalog.docs.some((d: any) => d.code === "ПИК"));
  const em = got.json.catalog.sections.find((x: any) => x.code === "ЭМ");
  assert.ok(em.works.some((w: any) => w.code === "w1"));
});

test("шаблон: конфликтный catalog.json пропускается, шаблон загружается", async () => {
  const { openZip, writeZip } = await import("@idk/server/zip/zip");
  const s = await startTestServer();
  const t = await s.req("POST", "/api/templates", { name: "Т" });
  const exp = await s.raw("GET", `/api/templates/${t.json.id}/export`);
  const files = [...openZip(new Uint8Array(await exp.arrayBuffer()))].map(([k, fn]) => [k, fn()] as [string, Buffer]);
  files.push(["catalog.json", JSON.stringify({
    docs: [{ code: "АОСР", name: "Конфликт", clause344: 3, source: "", make: "form", scope: "act" }],
    sections: [], hidden: [],
  })]);
  const bad = writeZip(files);

  const s2 = await startTestServer();
  const imp = await s2.raw("POST", "/api/templates/import", { body: bad as unknown as BodyInit, headers: { "content-type": "application/octet-stream" } });
  assert.equal(imp.status, 201);
  const got = await s2.req("GET", "/api/catalog");
  assert.deepEqual(got.json.own, []);
  assert.equal(got.json.catalog.docs.filter((d: any) => d.name === "Конфликт").length, 0);
});
