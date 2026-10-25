// План 13, задача 2: книга v9 — таблицы протоколов и актов.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHEMA_VERSION, SHEETS, TABLES, REGISTRY_KINDS, column, keyColumn, type TableName } from "../src/workbook/schema.ts";
import { PROTO_DEFS, PROTO_KINDS, PROTO_ROW_TABLES } from "../src/protocols/defs.ts";

const NEW_SHEETS = ["Протоколы и акты", "Замеры электрики", "Барабаны и трубы", "Замеры СКС и ВОЛС"];

test("схема v9: новые листы в конце, прежние на месте", () => {
  assert.ok(SCHEMA_VERSION >= 9);
  assert.deepEqual(SHEETS.slice(-4).map((s) => s.name), NEW_SHEETS);
  assert.equal(SHEETS[0].name, "Реквизиты");
  assert.deepEqual(SHEETS.find((s) => s.name === "Протоколы и акты")!.tables, ["Протоколы", "ПереченьОборудования"]);
  assert.deepEqual(SHEETS.find((s) => s.name === "Замеры электрики")!.tables,
    ["ИспытанияКЛ", "ЗамерыАвтоматов", "ЗамерыУЗО", "ЗамерыФазаНуль", "ЗамерыМеталлосвязи", "ЗамерыЗаземления"]);
  assert.deepEqual(SHEETS.find((s) => s.name === "Барабаны и трубы")!.tables, ["ОсмотрБарабанов", "ПрогревБарабанов", "ТрубныеПроводки"]);
  assert.deepEqual(SHEETS.find((s) => s.name === "Замеры СКС и ВОЛС")!.tables, ["ЗамерыВолокон", "ЗамерыСКС"]);
});

test("«Протоколы»: ключ «№ документа», «Документ» — коды 16 документов, ссылки на акт и комплект", () => {
  assert.equal(keyColumn("Протоколы")!.header, "№ документа");
  assert.deepEqual(column("Протоколы", "doc").values, PROTO_KINDS.map((k) => PROTO_DEFS[k].code));
  assert.equal(column("Протоколы", "act").ref, "Акты");
  assert.equal(column("Протоколы", "kit").ref, "Комплекты");
  assert.deepEqual(TABLES["Протоколы"].columns.map((c) => c.header), [
    "Документ", "№ документа", "Акт", "Комплект", "Дата / начало", "Окончание", "Предмет (что проверено)", "Температура, °C",
    "Влажность, %", "Давление, мм рт. ст.", "Цель", "Нормативы", "Заключение",
  ]);
});

test("таблицы строк: первый столбец «№ документа» → «Протоколы»; столбцы печати есть в таблице", () => {
  for (const t of PROTO_ROW_TABLES) {
    const first = TABLES[t as TableName].columns[0];
    assert.equal(first.key, "doc", t);
    assert.equal(first.header, "№ документа", t);
    assert.equal(first.ref, "Протоколы", t);
    assert.ok(first.important, t);
  }
  for (const k of PROTO_KINDS) {
    const d = PROTO_DEFS[k];
    for (const c of d.columns.filter((x) => !x.computed)) assert.doesNotThrow(() => column(d.table, c.key), `${d.code}: ${c.key}`);
  }
});

test("значения по умолчанию и важные столбцы — по спецификации §5.2", () => {
  assert.equal(column("ЗамерыУЗО", "timeNorm").default, 300);
  assert.equal(column("ЗамерыМеталлосвязи", "allowed").default, 0.05);
  assert.equal(column("ЗамерыЗаземления", "allowed").default, 4);
  assert.equal(column("ЗамерыЗаземления", "season").default, 1);
  assert.equal(column("ИспытанияКЛ", "duration").default, 10);
  assert.equal(column("ЗамерыВолокон", "wave").default, 1550);
  assert.equal(column("ЗамерыСКС", "cat").default, "5e");
  assert.deepEqual(column("ЗамерыФазаНуль", "curve").values, ["B", "C", "D", "—"]);
  assert.ok(column("ИспытанияКЛ", "result").important);
  assert.ok(!column("ЗамерыАвтоматов", "result").important, "вычисляемый результат не обязателен");
});

test("реестр: вид «Акт/протокол» перед «Прочее»", () => {
  assert.deepEqual(REGISTRY_KINDS.slice(-2), ["Акт/протокол", "Прочее"]);
});
