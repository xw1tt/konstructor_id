// 0.31: оформление таблиц — форматы столбцов, цвета заголовков, правила «пусто в важном» и «повтор ключа».
import { TABLES, OBJECT_REQUIRED_LABELS, keyColumn, type TableName, type ColumnDef } from "@idk/shared/workbook/schema";
import type { ImportantMap } from "@idk/shared/workbook/important";
import { exampleColumn } from "@idk/shared/workbook/examples";
import {
  COLORS,
  applyValidation,
  colLetter as colLetterAt,
  duplicateRule,
  exampleRule,
  importantRule,
  objectImportantRule,
  textFormatted,
  negativeRule,
} from "../layout.ts";
import { isOurs, LAST_RULE_ROW } from "./common.ts";

declare const Excel: any;

export function formatColumn(t: any, def: (typeof TABLES)[TableName], col: ColumnDef, i: number, bodyRows: number) {
  const fill = (v: string) => Array.from({ length: Math.max(bodyRows, 1) }, () => [v]);
  const body = t.columns.getItemAt(i).getDataBodyRange();
  body.format.columnWidth = (col.width ?? 16) * 7;
  body.format.wrapText = col.type === "longtext" || (col.width ?? 16) >= 40;
  if (bodyRows > 0) {
    if (col.type === "date") body.numberFormat = fill("dd.mm.yyyy");
    if (textFormatted(col)) body.numberFormat = fill("@");
    if (col.type === "formula" && col.formula) {
      body.numberFormat = fill("General");
      body.formulas = fill(col.formula);
    }
  }
  if (def.name !== "Объект" || col.key !== "value") applyValidation(body, col, def.name);
}

export function formatTable(t: any, def: (typeof TABLES)[TableName], important: string[], firstRow: number, bodyRows: number, headers: string[], left = 0) {
  def.columns.forEach((col) => {
    const i = headers.indexOf(col.header);
    if (i >= 0) formatColumn(t, def, col, i, bodyRows);
  });
  const head = t.getHeaderRowRange();
  head.format.font.bold = true;
  head.format.font.color = COLORS.headerText;
  head.format.wrapText = true;
  head.format.rowHeight = 42;
  paint(t, def, important, firstRow, headers, left);
}

/** Цвета заголовков и правила «пусто в важном столбце» / «повтор ключа». headers — порядок столбцов в книге
 *  (в книге прежней версии дописанные столбцы стоят в конце); left — столбец листа, с которого начинается таблица. */
export function paint(t: any, def: (typeof TABLES)[TableName], important: string[], firstRow: number, headers: string[], left = 0) {
  const body = t.getDataBodyRange();
  body.conditionalFormats.clearAll();
  // Формулы правил пишутся для первой ячейки диапазона; столбцы — с поправкой на начало таблицы; firstRow — с 1.
  const last = headers.length - 1;
  const colLetter = (i: number) => colLetterAt(left + i);
  const exIdx = headers.indexOf(exampleColumn(def.name).header);
  if (exIdx >= 0) {
    const ex = body.conditionalFormats.add("Custom");
    ex.custom.rule.formula = exampleRule(colLetter(exIdx), firstRow);
    ex.custom.format.font.color = COLORS.example;
    ex.custom.format.font.italic = true;
  }
  def.columns.forEach((col: ColumnDef) => {
    const i = headers.indexOf(col.header);
    if (i < 0) return;
    const headCell = t.getHeaderRowRange().getCell(0, i);
    headCell.format.fill.color = important.includes(col.header) ? COLORS.important : col.service ? COLORS.service : COLORS.header;
    const range = t.columns.getItemAt(i).getDataBodyRange();
    if (important.includes(col.header) && col.type !== "formula") {
      const cf = range.conditionalFormats.add("Custom");
      cf.custom.rule.formula =
        def.name === "Объект" && col.key === "value"
          ? objectImportantRule(colLetter(headers.indexOf("Поле")), colLetter(i), firstRow, OBJECT_REQUIRED_LABELS)
          : importantRule(colLetter(0), colLetter(last), colLetter(i), firstRow);
      cf.custom.format.fill.color = COLORS.empty;
    }
    if (def.name === "Материалы" && col.key === "rest") {
      const cf = range.conditionalFormats.add("Custom");
      cf.custom.rule.formula = negativeRule(colLetter(i), firstRow);
      cf.custom.format.fill.color = COLORS.duplicate;
    }
    if (keyColumn(def.name)?.header === col.header && !def.allowDuplicates) {
      const cf = range.conditionalFormats.add("Custom");
      cf.custom.rule.formula = duplicateRule(colLetter(i), firstRow, LAST_RULE_ROW);
      cf.custom.format.fill.color = COLORS.duplicate;
    }
  });
}

/** Перекраска заголовков и правил по карте важных столбцов (для всех таблиц книги). */
export async function applyImportant(map: ImportantMap) {
  await Excel.run(async (ctx: any) => {
    ctx.workbook.tables.load("items/name");
    await ctx.sync();
    const ours = (ctx.workbook.tables.items as any[])
      .filter((t) => isOurs(t.name) && !TABLES[t.name as TableName].virtual)
      .map((t) => ({ t, body: t.getDataBodyRange().load("rowIndex,columnIndex"), head: t.getHeaderRowRange().load("values") }));
    await ctx.sync();
    for (const { t, body, head } of ours)
      paint(t, TABLES[t.name as TableName], map[t.name as TableName] ?? [], body.rowIndex + 1, (head.values[0] as unknown[]).map(String), body.columnIndex);
    await ctx.sync();
  });
}
