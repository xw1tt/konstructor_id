// План 14, задача 2: книга v10, нумерация набора в реестре, п.3 АОСР; строка РП.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { registryRows } from "@idk/shared/kit/registry";
import { point3Lines } from "@idk/shared/acts/rows";
import { SCHEMA_VERSION, TABLES, REGISTRY_KINDS } from "@idk/shared/workbook/schema";
import { BUILTIN_TI, BUILTIN_SBD } from "@idk/shared/forms/template";
import { FIELD_TREE } from "@idk/shared/forms/fields";
import { PRINTED_KINDS } from "@idk/shared/kit/request";
import { kitRecords } from "./fixtures/kitBook.ts";
import { AOV1 } from "./fixtures/aov1Book.ts";

const rows = async (t = BUILTIN_TI) => registryRows(await readBook(new MemoryWorkbook(kitRecords())), "1", t).rows.map((r) => r.values);

test("книга v10: столбцы КЖ в конце, вид реестра «РП» после «РИМ»", () => {
  assert.equal(SCHEMA_VERSION, 11);
  assert.deepEqual(TABLES["КабельныйЖурнал"].columns.slice(-4).map((c) => [c.key, c.header, c.type]), [
    ["projectLength", "Длина по проекту, м", "number"], ["tray", "Лоток, м", "number"],
    ["smoothPipe", "Труба гладкая, м", "number"], ["corrugatedPipe", "Труба гофрированная, м", "number"],
  ]);
  assert.equal(REGISTRY_KINDS[REGISTRY_KINDS.indexOf("РИМ") + 1], "РП");
  assert.equal(PRINTED_KINDS["РП"], "rp");
});

test("реестр по шаблону «ТИ»: номера и наименования набора, РП после РИМ", async () => {
  const r = await rows();
  const by = (k: string) => r.filter((x) => x["Вид"] === k);
  assert.deepEqual(r.map((x) => x["Вид"]).slice(0, 4), ["АОСР", "РИМ", "РП", "ВД"]);
  assert.deepEqual([by("АОСР")[0]["Номер документа"], by("АОСР")[0]["Наименование"]], [`№${AOV1}`, "Акт освидетельствования скрытых работ"]);
  assert.deepEqual([by("РИМ")[0]["Номер документа"], by("РИМ")[0]["Наименование"]],
    [`№${AOV1}.РМ`, `Реестр используемых материалов и документов, подтверждающих их качество, к АОСР №${AOV1} от 28.07.2026 г.`]);
  assert.deepEqual([by("РП")[0]["Номер документа"], by("РП")[0]["Наименование"]], [`№${AOV1}.РП`, `Реестр приложений к АОСР №${AOV1} от 28.07.2026 г.`]);
  assert.deepEqual([by("ВД")[0]["Номер документа"], by("ВД")[0]["Наименование"]], [`№${AOV1}.ВД`, "Ведомость смонтированного электрооборудования и материалов"]);
  assert.deepEqual([by("КЖ")[0]["Номер документа"], by("КЖ")[0]["Наименование"]], [`№${AOV1}.КЖ`, "Кабельный журнал"]);
  assert.deepEqual([by("Протокол")[0]["Номер документа"], by("Протокол")[0]["Наименование"]], [`№${AOV1}.П`, "Протокол сопротивления изоляции"]);
  const q = by("Документ качества")[0];
  assert.ok(!String(q["Номер документа"]).startsWith("№"), "номер документа качества без «№»");
  assert.match(String(q["Наименование"]), /^(Паспорт качества|Сертификат соответствия|Декларация о соответствии|Информационное письмо|Отказное письмо|Свидетельство о государственной регистрации)$/);
});

test("реестр «СБД» без изменений: нет РП, номера с .АОСР", async () => {
  const r = await rows(BUILTIN_SBD);
  assert.ok(!r.some((x) => x["Вид"] === "РП"));
  assert.equal(r.find((x) => x["Вид"] === "АОСР")!["Номер документа"], `№${AOV1}.АОСР`);
});

test("п.3 АОСР по набору: «.РМ» и «.ВД» у «ТИ», «.РИМ» у «СБД»", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ materialId: i + 1, position: "", quantity: null, sortOrder: i }));
  assert.match(point3Lines(many, [], new Map(), "1", "ti")[0], /№1\.РМ .*№1\.ВД/);
  assert.match(point3Lines(many, [], new Map(), "1")[0], /№1\.РИМ /);
});

test("метки: дата по частям, подрядчик, номер РП", () => {
  const f = (g: string) => FIELD_TREE.find((x) => x.group === g)!.fields;
  for (const k of ["День", "Месяц", "Год", "Номер РП"]) assert.ok(f("Акт").includes(k), k);
  assert.ok(f("Объект").includes("Подрядчик"));
});
