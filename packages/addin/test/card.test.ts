import { test } from "node:test";
import assert from "node:assert/strict";
import { column } from "@idk/shared/workbook/schema";
import { readBook } from "@idk/shared/workbook/records";
import { fromCell, toCell } from "@idk/addin/panel/card/editValue";
import { newRowDefaults } from "@idk/addin/book/defaults";
import { issueLines, previewJobUrl } from "@idk/addin/panel/print";
import { aov1Book } from "../../shared/test/fixtures/aov1Book.ts";

test("fromCell/toCell: дата и число", () => {
  assert.equal(fromCell(column("Акты", "date"), 46231), "28.07.2026");
  assert.equal(fromCell(column("Акты", "date"), "28.07.2026"), "28.07.2026");
  assert.equal(fromCell(column("ВОР", "quantity"), 1618.9), "1618,9");
  assert.equal(fromCell(column("Материалы", "name"), null), "");
  assert.deepEqual(toCell(column("Акты", "date"), "28.07.2026"), { ok: true, value: 46231 });
  assert.deepEqual(toCell(column("Акты", "date"), ""), { ok: true, value: null });
  assert.deepEqual(toCell(column("Акты", "date"), "вчера"), { ok: false, message: "Дата в формате ДД.ММ.ГГГГ" });
  assert.deepEqual(toCell(column("ВОР", "quantity"), "1618,9"), { ok: true, value: 1618.9 });
  assert.deepEqual(toCell(column("Акты", "copies"), "4,5"), { ok: false, message: "Нужно целое число" });
  assert.deepEqual(toCell(column("ДокументыКачества", "materials"), ["А", "Б"]), { ok: true, value: "А; Б" });
  assert.deepEqual(toCell(column("Материалы", "name"), "  Кабель "), { ok: true, value: "Кабель" });
});

test("значения нового акта", async () => {
  const d = newRowDefaults("Акты", await readBook(aov1Book()), "2026-10-16");
  assert.equal(d["Номер акта"], "К32.В.СТ.АОВ1.01.00.2");
  assert.equal(d["Дата акта"], 46311);
  assert.equal(d["ВОР: от заказчика"], "Валерьянов А.А.");
  assert.equal(d["ВОР: от монтажников"], "Востров В.П.");
  assert.equal(d["Выполнивший работы"], 'ООО "Велесстрой"');
  assert.equal(d["Экз."], 4);
  assert.equal(d["Доп. сведения"], "нет");
});

test("значения новой строки других таблиц — умолчания схемы", async () => {
  const b = await readBook(aov1Book());
  assert.deepEqual(newRowDefaults("МатериалыАктов", b, "2026-10-16"), { "№ поз. по УСР": "б/н" });
  assert.deepEqual(newRowDefaults("Материалы", b, "2026-10-16"), {});
});

test("ошибки проверки — понятные строки с номером строки листа", () => {
  const lines = issueLines([
    { table: "ДокументыКачества", row: 3, column: "Дата", message: "Не заполнено" },
    { table: "Акты", row: null, column: "Номер акта", message: "Акт «X» не найден на листе «База актов»" },
  ], { "ДокументыКачества": 5 });
  assert.deepEqual(lines.map((l) => l.text), [
    "Материалы, строка 8, «Дата»: Не заполнено",
    "База актов, «Номер акта»: Акт «X» не найден на листе «База актов»",
  ]);
});

test("адрес предпросмотра задания печати", () => {
  assert.equal(previewJobUrl("abc", "rim", "https://localhost:3443"),
    "https://localhost:3443/addin/preview.html?src=%2Fapi%2Fprint-jobs%2Fabc%2Frim");
});

test("несколько новых актов — номера по порядку", async () => {
  const { newRowsDefaults } = await import("@idk/addin/book/defaults");
  const list = newRowsDefaults("Акты", await readBook(aov1Book()), 3, "2026-10-16");
  assert.deepEqual(list.map((d) => d["Номер акта"]), ["К32.В.СТ.АОВ1.01.00.2", "К32.В.СТ.АОВ1.01.00.3", "К32.В.СТ.АОВ1.01.00.4"]);
  assert.equal(newRowsDefaults("Материалы", await readBook(aov1Book()), 2, "2026-10-16").length, 2);
});

test("ошибка документа качества (план 31) — на ячейку «Док.N» строки материала", async () => {
  const { sheetIssueLines } = await import("@idk/addin/panel/print");
  const port = {
    isVirtual: async (t: string) => t === "ДокументыКачества",
    physical: async (_t: string, row: number, header: string | null) => ({ table: "Материалы" as const, row: row + 2, column: header === "Дата" ? "Док.2: дата" : header }),
    tableSheetOffset: async () => 5,
  };
  const lines = await sheetIssueLines(port as any, [{ table: "ДокументыКачества", row: 1, column: "Дата", message: "Не заполнено" }] as any);
  assert.deepEqual(lines.map((l) => [l.text, l.table, l.row, l.column]), [["Материалы, строка 8, «Док.2: дата»: Не заполнено", "Материалы", 3, "Док.2: дата"]]);
});
