// План 13, задача 5: протоколы и акты в реестре ИД и задании сборки комплекта.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { registryRows } from "@idk/shared/kit/registry";
import { buildKitRequest } from "@idk/shared/kit/request";
import { BUILTIN_SBD, type UserTemplate } from "@idk/shared/forms/template";
import { protoRecords, AOV1 } from "./fixtures/protoBook.ts";

const tpl: UserTemplate = {
  id: "t-1", name: "Протоколы", print: { schemeEach: false },
  docs: [
    { kind: "builtin", doc: "aosr", form: null }, { kind: "builtin", doc: "kj", form: null }, { kind: "builtin", doc: "ip", form: null },
    { kind: "builtin", doc: "pkl", form: null }, { kind: "builtin", doc: "pav", form: null }, { kind: "builtin", doc: "puzo", form: null },
  ],
};
const rowsOf = async (t?: UserTemplate, patch?: Parameters<typeof protoRecords>[0]) =>
  registryRows(await readBook(new MemoryWorkbook(protoRecords(patch) as any)), "1", t).rows.map((r) => r.values);

test("реестр: ПКЛ — строка акта после протокола изоляции и лаборатории, ПАВ — одна строка комплекта в конце; ПУЗО без шапки — нет", async () => {
  const rows = await rowsOf(tpl);
  const kinds = rows.map((r) => r["Вид"]);
  const pkl = kinds.indexOf("Акт/протокол");
  assert.deepEqual(rows.filter((r) => r["Вид"] === "Акт/протокол").map((r) => [r["Номер документа"], r["Акт"], r["Наименование"]]), [
    ["№ПКЛ-1", AOV1, "Протокол испытания силовой кабельной линии"],
    ["№ПАВ-1", null, "Протокол проверки действия автоматических выключателей"],
  ]);
  assert.equal(kinds[pkl - 1], "Лаборатория", "после поверок и свидетельства лаборатории");
  assert.equal(kinds.at(-1), "Акт/протокол");
  assert.equal(rows.at(-1)!["Дата / период"], "15.07.2026 г.");
});

test("лабораторный протокол без ПСИ в шаблоне — строки «Поверка» и «Лаборатория» всё равно добавляются один раз", async () => {
  const t = { ...tpl, docs: tpl.docs.filter((d) => d.kind === "builtin" && d.doc !== "ip" && d.doc !== "kj") };
  const kinds = (await rowsOf(t)).map((r) => r["Вид"]);
  assert.equal(kinds.filter((k) => k === "Лаборатория").length, 1);
  assert.ok(kinds.includes("Поверка"));
});

test("«СБД» и книга без «Протоколов» — реестр как раньше", async () => {
  const sbd = await rowsOf(BUILTIN_SBD);
  assert.ok(!sbd.some((r) => r["Вид"] === "Акт/протокол"));
  const none = await rowsOf(tpl, (r) => { r["Протоколы"] = []; });
  assert.ok(!none.some((r) => r["Вид"] === "Акт/протокол"));
});

test("задание комплекта: строки «Акт/протокол» → пакеты документов; неизвестный номер — ошибка строки", async () => {
  const recs = protoRecords();
  recs["РеестрИД"] = registryRows(await readBook(new MemoryWorkbook(protoRecords() as any)), "1", tpl).rows.map((r) => r.values)
    .filter((v) => ["АОСР", "КЖ", "Протокол", "Акт/протокол"].includes(String(v["Вид"]))); // печатаемые строки — без сканов
  const { request, issues } = buildKitRequest(await readBook(new MemoryWorkbook(recs as any)), "1", defaultImportant(), "sbd", undefined, new Date("2026-10-25"), tpl);
  assert.deepEqual(issues, []);
  const docs = request!.rows.filter((r) => r.kind === "Акт/протокол").map((r) => r.doc);
  assert.deepEqual(docs, [{ act: AOV1, kind: "pkl", proto: "ПКЛ-1" }, { act: AOV1, kind: "pav", proto: "ПАВ-1" }]);
  assert.deepEqual(request!.protos.map((b) => b.proto!.number), ["ПКЛ-1", "ПАВ-1"]);

  const bad = structuredClone(recs);
  bad["РеестрИД"].find((v) => v["Вид"] === "Акт/протокол")!["Номер документа"] = "№ПКЛ-9";
  const r = buildKitRequest(await readBook(new MemoryWorkbook(bad as any)), "1", defaultImportant(), "sbd", undefined, new Date(), tpl);
  assert.equal(r.request, null);
  assert.ok(r.issues.some((i) => i.table === "РеестрИД" && i.column === "Номер документа" && i.message === "Документ «ПКЛ-9» не найден в таблице «Протоколы»"),
    JSON.stringify(r.issues));
});
