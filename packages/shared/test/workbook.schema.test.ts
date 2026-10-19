import { test } from "node:test";
import assert from "node:assert/strict";
import { TABLES, SHEETS, keyColumn, column, roleFromBook, docTypeFromBook, OBJECT_FIELDS } from "@idk/shared/workbook/schema";
import {
  excelSerialToIso, isoToExcelSerial, parseDateCell, parseNumberCell, splitRefs, joinRefs, cellText,
} from "@idk/shared/workbook/values";

test("заголовки таблиц — как в спецификации", () => {
  assert.deepEqual(TABLES["Материалы"].columns.map((c) => c.header), ["Наименование", "Марка", "Артикул", "Завод-изготовитель", "Ед. изм."]);
  assert.deepEqual(TABLES["ДокументыКачества"].columns.map((c) => c.header),
    ["Материалы", "Тип", "Номер", "Дата", "Действует до", "Листов", "Наименование для реестра", "Скан"]);
  assert.deepEqual(TABLES["МатериалыАктов"].columns.map((c) => c.header), ["Акт", "Материал", "№ поз. по УСР", "Кол-во", "Сумма ВОР"]);
  assert.deepEqual(TABLES["Объект"].columns.map((c) => c.header), ["Поле", "Значение"]);
  assert.equal(TABLES["Акты"].columns.length, 19);
  assert.equal(TABLES["КабельныйЖурнал"].columns.length, 11);
  assert.equal(OBJECT_FIELDS[0].label, "Наименование объекта");
});

test("листы и таблицы", () => {
  assert.deepEqual(SHEETS.map((s) => s.name), ["Реквизиты", "Представители", "Материалы", "Документы качества", "База актов",
    "Исполнительные схемы", "Материалы в актах", "ВОР", "Кабельный журнал", "Изоляция", "Комплекты", "Реестр ИД"]);
  assert.deepEqual(SHEETS[0].tables, ["Объект", "Организации", "Шифры"]);
  for (const s of SHEETS) for (const t of s.tables) assert.equal(TABLES[t].sheet, s.name);
});

test("ключи и ссылки", () => {
  assert.equal(keyColumn("Материалы")?.header, "Наименование");
  assert.equal(keyColumn("Акты")?.header, "Номер акта");
  assert.equal(column("ВОР", "material").ref, "Материалы");
  assert.equal(column("ДокументыКачества", "materials").type, "refs");
  assert.equal(keyColumn("Объект"), undefined);
  assert.equal(column("МатериалыАктов", "vorSum").type, "formula");
});

test("роли и типы документов", () => {
  assert.equal(roleFromBook("Технадзор застройщика"), "developer_control");
  assert.equal(roleFromBook(" Выполнивший работы "), "performer");
  assert.equal(roleFromBook("Прораб"), null);
  assert.equal(docTypeFromBook("Паспорт качества"), "passport");
  assert.equal(docTypeFromBook("паспорт"), null);
});

test("даты и числа", () => {
  assert.equal(excelSerialToIso(46231), "2026-07-28");
  assert.equal(isoToExcelSerial("2026-06-05"), 46178);
  assert.deepEqual(parseDateCell(46231), { ok: true, value: "2026-07-28" });
  assert.deepEqual(parseDateCell("28.07.2026"), { ok: true, value: "2026-07-28" });
  assert.deepEqual(parseDateCell("09.05.2025 г."), { ok: true, value: "2025-05-09" });
  assert.deepEqual(parseDateCell("2025-05-09"), { ok: true, value: "2025-05-09" });
  assert.deepEqual(parseDateCell(""), { ok: true, value: null });
  assert.deepEqual(parseDateCell(null), { ok: true, value: null });
  assert.deepEqual(parseDateCell("завтра"), { ok: false, message: "Дата в формате ДД.ММ.ГГГГ" });
  assert.deepEqual(parseDateCell("31.02.2026"), { ok: false, message: "Дата в формате ДД.ММ.ГГГГ" });
  assert.deepEqual(parseNumberCell("1 618,9"), { ok: true, value: 1618.9 });
  assert.deepEqual(parseNumberCell(436), { ok: true, value: 436 });
  assert.deepEqual(parseNumberCell(" "), { ok: true, value: null });
  assert.deepEqual(parseNumberCell("много"), { ok: false, message: "Нужно число" });
  assert.deepEqual(splitRefs(" А ; Б;; "), ["А", "Б"]);
  assert.deepEqual(splitRefs(null), []);
  assert.equal(joinRefs(["А", "Б"]), "А; Б");
  assert.equal(cellText("  x "), "x");
  assert.equal(cellText(null), "");
  assert.equal(cellText(4), "4");
});
