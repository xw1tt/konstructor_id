// План 8: акт входного контроля — номер, строки, пакет, реестр.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { avkDefaultNumber, avkRows } from "@idk/shared/acts/rows";
import { registryRows } from "@idk/shared/kit/registry";
import { REGISTRY_KINDS } from "@idk/shared/workbook/schema";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";
import { kitRecords } from "./fixtures/kitBook.ts";

const book = (patch: (r: any) => void = () => {}) => { const r: any = aov1Records(); patch(r); return readBook(new MemoryWorkbook(r)); };

test("номер АВК по умолчанию", () => {
  assert.equal(avkDefaultNumber(AOV1, "КУТ03-Р-ПИР-2-26-100-АОВ1.01.00"), "01/АОВ1.01.00");
  assert.equal(avkDefaultNumber("К32.В.СТ.АОВ2.01.00.5", "КУТ03-Р-ПИР-2-26-100-АОВ2.01.00"), "05/АОВ2.01.00");
  assert.equal(avkDefaultNumber("А-12", "ЭМ"), "12/ЭМ");
  assert.equal(avkDefaultNumber("Акт", ""), "01");
});

test("пакет АОВ1: номер и дата АВК — по умолчанию и из столбцов", async () => {
  const b = buildBundle(await book(), AOV1, defaultImportant()).bundle!;
  assert.deepEqual(b.avk, { number: "01/АОВ1.01.00", date: "2026-06-05" });
  const b2 = buildBundle(await book((r) => { r["Акты"][0]["АВК: номер"] = "7/X"; r["Акты"][0]["АВК: дата"] = 46200; }), AOV1, defaultImportant()).bundle!;
  assert.equal(b2.avk!.number, "7/X");
  assert.match(b2.avk!.date!, /^\d{4}-\d\d-\d\d$/);
});

test("строки АВК: наименование с маркой, количество как в ВД, документы строкой", async () => {
  const b = buildBundle(await book(), AOV1, defaultImportant()).bundle!;
  const byMat = new Map(b.actMaterials.map((m) => [m.materialId, b.qualityDocs.filter((d) => d.materialIds.includes(m.materialId))]));
  const rows = avkRows(b.actMaterials, b.materials, byMat, b.vor);
  assert.equal(rows.length, 20);
  assert.match(rows[0].name, /^Кабель .*СегментКИ-485-ПсЭнг\(А\)-HF 1х2х0,78-300 В$/);
  assert.equal(rows[0].quantity, "1618,9 м.");
  assert.equal(rows[0].docs, "паспорт качества: №3/405 от 09.05.2025 г. сертификат соответствия: №ЕАЭС RU C-RU.АД38.В.00024/21 от 11.06.2021 г. до 10.06.2026 г.");
  assert.ok(rows[0].manufacturer.includes("СегментЭНЕРГО"));
});

test("реестр: строка АВК перед документами качества", async () => {
  assert.ok(REGISTRY_KINDS.includes("АВК"));
  const b = await readBook(new MemoryWorkbook(kitRecords()));
  const rows = registryRows(b, "1").rows;
  const i = rows.findIndex((r) => r.values["Вид"] === "АВК");
  assert.equal(rows[i - 1].values["Вид"], "Лаборатория");
  assert.equal(rows[i + 1].values["Вид"], "Документ качества");
  assert.deepEqual([rows[i].values["Номер документа"], rows[i].values["Наименование"], rows[i].values["Дата / период"], rows[i].values["Акт"]],
    ["№01/АОВ1.01.00", "Акт входного контроля, технических средств и материалов", "05.06.2026 г.", AOV1]);
});
