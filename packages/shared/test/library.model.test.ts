// План 16, задача 1: модель библиотеки — ключи, значения из книги, план добавления, строки книги.
import { test } from "node:test";
import assert from "node:assert/strict";
import { libKey, libKeyFilled, libValues, planAdd, toBookRows, fileIdOf, type LibRecord } from "@idk/shared/library/model";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { writeBook } from "@idk/shared/workbook/write";

const rec = (kind: LibRecord["kind"], values: Record<string, any>, id = `${kind}-${JSON.stringify(values)}`, scan: LibRecord["scan"] = null): LibRecord =>
  ({ id, kind, values, scan, updatedAt: "2026-10-25T00:00:00Z", updatedBy: "" });

test("ключи: без учёта регистра и пробелов; ИНН важнее наименования", () => {
  assert.equal(libKey("org", { inn: " 7736323532 ", shortName: "ООО А" }), libKey("org", { inn: "7736323532", shortName: "другое" }));
  assert.notEqual(libKey("org", { shortName: "ООО А" }), libKey("org", { shortName: "ООО Б" }));
  assert.equal(libKey("rep", { fullName: "Иванов  И.И.", org: "ООО А" }), libKey("rep", { fullName: "иванов и.и.", org: "ооо а" }));
  assert.notEqual(libKey("material", { name: "Кабель", mark: "А" }), libKey("material", { name: "Кабель", mark: "Б" }));
  assert.equal(libKey("doc", { type: "Паспорт качества", number: "№1" }), libKey("doc", { type: "паспорт качества", number: "№1 " }));
  assert.equal(libKeyFilled("doc", { type: "Паспорт качества", number: "" }), false);
  assert.equal(libKeyFilled("org", { inn: "1" }), true);
});

test("значения из строки книги: без порядка подписей, строки РКЦ, логотипа и скана", () => {
  const v = libValues("material", { row: 0, v: { name: "Кабель", mark: "М", rkc: "1.2", unit: "м." }, link: {} });
  assert.ok(!("rkc" in v));
  assert.equal(v.name, "Кабель");
  assert.ok(!("sortOrder" in libValues("rep", { row: 0, v: { fullName: "И", sortOrder: 2 }, link: {} })));
  assert.ok(!("file" in libValues("doc", { row: 0, v: { number: "1", file: "a.pdf" }, link: {} })));
});

test("план добавления: материал тянет документы, представитель — организацию; что уже в книге — пропуск", async () => {
  const org = rec("org", { shortName: "ООО А", inn: "1" });
  const org2 = rec("org", { shortName: "ООО Б", inn: "2" });
  const rep = rec("rep", { fullName: "Иванов И.И.", org: "ООО А" });
  const mat = rec("material", { name: "Кабель", mark: "М" });
  const d1 = rec("doc", { materials: "Кабель; Труба", type: "Паспорт качества", number: "1" });
  const d2 = rec("doc", { materials: "Труба", type: "Паспорт качества", number: "2" });
  const all = [org, org2, rep, mat, d1, d2];
  const empty = await readBook(new MemoryWorkbook({}));
  const p = planAdd(empty, [mat, rep], all);
  assert.deepEqual(p.add.map((r) => r.id), [org.id, rep.id, mat.id, d1.id], "порядок: организации, представители, материалы, документы");
  assert.deepEqual(p.skipped, []);
  const book = await readBook(new MemoryWorkbook({ "Организации": [{ "Краткое наименование": "ООО А", "ИНН": "1" }], "Материалы": [{ "Наименование": "кабель", "Марка": "м" }] } as any));
  const p2 = planAdd(book, [mat, rep], all);
  assert.deepEqual(p2.add.map((r) => r.id), [rep.id, d1.id]);
  assert.deepEqual(p2.skipped.map((r) => r.id).sort(), [org.id, mat.id].sort());
  assert.deepEqual(planAdd(empty, [mat, mat, d1], all).add.map((r) => r.id), [mat.id, d1.id], "без повторов в выборе");
});

test("записи → строки книги по заголовкам, скан — ссылкой на своей строке", async () => {
  const scan = { sha256: "a".repeat(64), name: "паспорт.pdf", mime: "application/pdf" };
  const recs = [rec("material", { name: "Кабель", unit: "м." }), rec("doc", { materials: "Кабель", type: "Паспорт качества", number: "1" }, "d1", scan),
    rec("doc", { materials: "Кабель", type: "Сертификат соответствия", number: "2" })];
  const { rows, links } = toBookRows(recs, (r) => (r.scan ? "https://localhost:3443/api/files/7" : null));
  assert.equal(rows["Материалы"]![0]["Наименование"], "Кабель");
  assert.equal(rows["ДокументыКачества"]![0]["Скан"], "паспорт.pdf");
  assert.deepEqual(links["ДокументыКачества"], [{ "Скан": "https://localhost:3443/api/files/7" }, {}]);
  const wb = new MemoryWorkbook({}, { placeholder: true });
  await writeBook(wb, rows, links);
  const docs = (await readBook(wb)).tables["ДокументыКачества"]!;
  assert.deepEqual(docs.map((d) => [d.v.number, d.link.file]), [["1", "https://localhost:3443/api/files/7"], ["2", null]]);
  assert.equal(fileIdOf("https://localhost:3443/api/files/12"), 12);
  assert.equal(fileIdOf("https://x/y.pdf"), null);
});
