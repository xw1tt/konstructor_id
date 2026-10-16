import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { tableRows } from "@idk/shared/workbook/store";
import { addRows, moveRow, duplicateRow } from "@idk/shared/workbook/rowOps";
import { writeBook, exportToBook, exportLinks, type ExportData } from "@idk/shared/workbook/migrate";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

const ORIGIN = "https://localhost:3443";
const exp = (): ExportData => ({
  object: { name: "К", address: "", contractNumber: "", contractDate: "2026-01-02", city: "", roles: { developer: null, builder: null, designer: null, performer: null } },
  organizations: [], sections: [], representatives: [],
  materials: [{ id: 5, name: "Кабель", mark: "", article: "", manufacturer: "З", unit: "м." }],
  qualityDocs: [
    { id: 1, type: "passport", number: "№1", issueDate: "2025-05-09", validUntil: null, sheets: 1, fileId: 11, materialIds: [5], registryName: "" },
    { id: 2, type: "certificate", number: "№2", issueDate: "2025-05-09", validUntil: null, sheets: 1, fileId: 12, materialIds: [5], registryName: "" },
  ],
  acts: [],
  files: [{ id: 11, sha256: "a", name: "паспорт.pdf", mime: "application/pdf", size: 1, pages: 1 },
    { id: 12, sha256: "b", name: "сертификат.pdf", mime: "application/pdf", size: 1, pages: 1 }],
});

test("перенос в свежую таблицу Excel (одна пустая строка): ссылки на своих строках, имена файлов целы", async () => {
  const wb = new MemoryWorkbook({}, { placeholder: true });
  await writeBook(wb, exportToBook(exp(), ORIGIN), exportLinks(exp(), ORIGIN));
  const docs = (await readBook(wb)).tables["ДокументыКачества"]!;
  assert.deepEqual(docs.map((d) => [d.row, d.v.number, d.v.file, d.link.file]), [
    [0, "№1", "паспорт.pdf", `${ORIGIN}/api/files/11`],
    [1, "№2", "сертификат.pdf", `${ORIGIN}/api/files/12`],
  ]);
});

test("«+1» в свежей таблице занимает пустую строку и возвращает её индекс", async () => {
  const wb = new MemoryWorkbook({}, { placeholder: true });
  const t = tableRows(wb, "Акты");
  assert.equal(await addRows(t, null, 1), 0);
  assert.equal(await t.count(), 1);
  await t.write(0, { values: ["А1"], links: [] });
  assert.equal(await addRows(t, 0, 1), 1);
  assert.equal(await t.count(), 2);
});

test("↑/↓ и «Дублировать» переносят ссылку на скан вместе со строкой", async () => {
  const wb = new MemoryWorkbook({ "Схемы": [{ "Акт": "1", "Номер": "1", "Скан": "a.pdf" }, { "Акт": "1", "Номер": "2", "Скан": "b.pdf" }] });
  await wb.write("Схемы", 0, {}, { "Скан": "u/a" });
  await wb.write("Схемы", 1, {}, { "Скан": "u/b" });
  const t = tableRows(wb, "Схемы");
  await moveRow(t, 1, -1);
  let rows = (await readBook(wb)).tables["Схемы"]!;
  assert.deepEqual(rows.map((r) => [r.v.file, r.link.file]), [["b.pdf", "u/b"], ["a.pdf", "u/a"]]);
  await duplicateRow(t, 0);
  rows = (await readBook(wb)).tables["Схемы"]!;
  assert.deepEqual(rows[1].link.file, "u/b");
});

test("строка только со значениями по умолчанию не считается данными", async () => {
  const wb = new MemoryWorkbook({ ...aov1Records() as any, "Схемы": [{ "Вид": "Схема" }] });
  await wb.insert("Представители", 6, [{ "Порядок": 1 }, { "Порядок": 1 }]);
  const b = await readBook(wb);
  assert.equal(b.tables["Представители"]!.length, 6);
  assert.equal(b.tables["Схемы"]!.length, 0);
  assert.deepEqual(buildBundle(b, AOV1, defaultImportant()).issues, []);
});

test("пустой материал в ВОР/МатериалахАктов — ошибка проверки, а не падение", async () => {
  const r = aov1Records() as any;
  r["ВОР"][0]["Материал"] = null;
  r["МатериалыАктов"][0]["Материал"] = null;
  const imp = { ...defaultImportant(), "ВОР": ["Акт"], "МатериалыАктов": ["Акт"] };
  const { bundle, issues } = buildBundle(await readBook(new MemoryWorkbook(r)), AOV1, imp);
  assert.equal(bundle, null);
  assert.ok(issues.some((i) => i.table === "ВОР" && i.row === 0 && i.column === "Материал" && i.message === "Не заполнено"));
  assert.ok(issues.some((i) => i.table === "МатериалыАктов" && i.row === 0 && i.message === "Не заполнено"));
});

test("перенос: одинаковые наименования и «;» разводятся, ссылки остаются однозначными", async () => {
  const e = exp();
  e.materials.push({ id: 6, name: "Кабель", mark: "ВВГ 3х2,5", article: "", manufacturer: "З", unit: "м." });
  e.materials.push({ id: 7, name: "Труба; серая", mark: "", article: "", manufacturer: "З", unit: "м." });
  e.qualityDocs[1].materialIds = [6, 7];
  e.organizations = [{ id: 1, shortName: "ООО А", fullName: "", ogrn: "", inn: "", address: "", phone: "", sroName: "", sroOgrn: "", sroInn: "" },
    { id: 2, shortName: "ООО А", fullName: "", ogrn: "", inn: "", address: "", phone: "", sroName: "", sroOgrn: "", sroInn: "" }];
  const rows = exportToBook(e, ORIGIN);
  const names = rows["Материалы"]!.map((m) => m["Наименование"]);
  assert.deepEqual(names, ["Кабель", "Кабель (ВВГ 3х2,5)", "Труба, серая"]);
  assert.equal(rows["ДокументыКачества"]![1]["Материалы"], "Кабель (ВВГ 3х2,5); Труба, серая");
  assert.deepEqual(rows["Организации"]!.map((o) => o["Краткое наименование"]), ["ООО А", "ООО А (2)"]);
});

test("перенос: дата договора — текстом ДД.ММ.ГГГГ (столбец «Значение» текстовый)", () => {
  const v = exportToBook(exp(), ORIGIN)["Объект"]!.find((r) => r["Поле"] === "Дата договора")!["Значение"];
  assert.equal(v, "02.01.2026");
});
