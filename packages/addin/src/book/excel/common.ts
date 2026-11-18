// 0.31: общие части слоя Office.js (excelPort.ts разбит на модули): типы выделения и событий, поиск таблицы под
// ячейкой, настройки документа, константы разметки.
import { TABLES, TABLE_NAMES, sheetOfTable, type TableName } from "@idk/shared/workbook/schema";
import type { CellValue } from "@idk/shared/workbook/values";
import type { TableData } from "@idk/shared/workbook/store";

declare const Office: any;

export const TABLE_TITLES: Partial<Record<TableName, string>> = {
  Шифры: "Шифры рабочей документации",
  АктыКомплектов: "Акты комплектов",
};
/** Таблица на листе «рядом» (план 30): строки вставляются и удаляются только в её столбцах — соседняя не задевается. */
export const sideBySide = (name: TableName) => !!sheetOfTable(name)?.side;

export interface Selection {
  sheet: string;
  table: TableName | null;
  /** Индекс строки данных таблицы под активной ячейкой. */
  row: number | null;
  /** Индексы строк данных, попавших в выделение. */
  rows: number[];
  column: string | null;
  /** Строка и столбец листа (с 0) активной ячейки. */
  sheetRow: number;
  sheetCol: number;
  /** Строки листа (с 0), попавшие в выделение. */
  sheetRows: number[];
}

export interface ChangeEvent {
  table: TableName | null;
  row: number | null;
  column: string | null;
  before: CellValue;
  after: CellValue;
  multi: boolean;
}

export const isOurs = (name: string): name is TableName => (TABLE_NAMES as string[]).includes(name);
export const VERSION_SETTING = "idk.version";
export const LAST_RULE_ROW = 5000;

export interface Located {
  table: TableName | null;
  row: number | null;
  column: string | null;
  rows: number[];
}

/** Какой нашей таблице принадлежит ячейка листа (rowIndex/columnIndex с 0). */
export async function locate(ctx: any, ws: any, rowIndex: number, colIndex: number, rowCount = 1): Promise<Located> {
  ws.tables.load("items/name");
  await ctx.sync();
  const ours = (ws.tables.items as any[]).filter((t) => isOurs(t.name));
  const parts = ours.map((t) => {
    const body = t.getDataBodyRange().load("rowIndex,columnIndex,rowCount,columnCount");
    const head = t.getHeaderRowRange().load("values");
    return { t, body, head };
  });
  await ctx.sync();
  for (const { t, body, head } of parts) {
    const inCols = colIndex >= body.columnIndex && colIndex < body.columnIndex + body.columnCount;
    const inRows = rowIndex >= body.rowIndex - 1 && rowIndex < body.rowIndex + body.rowCount;
    if (!inCols || !inRows) continue;
    const row = rowIndex >= body.rowIndex ? rowIndex - body.rowIndex : null;
    const rows: number[] = [];
    for (let r = rowIndex; r < rowIndex + rowCount; r++) if (r >= body.rowIndex && r < body.rowIndex + body.rowCount) rows.push(r - body.rowIndex);
    return { table: t.name, row, column: String(head.values[0][colIndex - body.columnIndex]), rows };
  }
  return { table: null, row: null, column: null, rows: [] };
}

export const settings = () => Office.context.document.settings;
export const saveSettings = () =>
  new Promise<void>((resolve, reject) =>
    settings().saveAsync((r: any) => (r.status === "succeeded" ? resolve() : reject(new Error(r.error?.message ?? "Не удалось сохранить настройки")))),
  );

/** Таблицы со своими столбцами в Excel (виртуальные — план 31 — строятся из «Материалов»). */
export const REAL_TABLES = TABLE_NAMES.filter((t) => !TABLES[t].virtual);
/** Столбец «ВидыРабот» на листе «Списки» — через один пустой после перечислений. */
export const workListColumn = () => REAL_TABLES.reduce((n, t) => n + TABLES[t].columns.filter((c) => c.type === "enum").length, 0) + 1;

/** План 31: старые таблицы «Спецификация» и «ДокументыКачества», прочитанные перед сведением в «Материалы». */
export interface OldTables {
  spec: TableData | null;
  docs: TableData | null;
  sheets: string[];
}
/** Итог переноса книги прежней версии — для экрана «Обновить разметку». */
export interface MergeReport {
  docs: number;
  positions: number;
  problems: string[];
  backup: string;
}
export const BACKUP_SHEET = "Архив до 0.27";
