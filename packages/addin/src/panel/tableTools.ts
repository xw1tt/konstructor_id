// «Функционал таблицы»: столбцы текущей таблицы и их состояние в текущей строке.
import { SHEETS, type TableName } from "@idk/shared/workbook/schema";
import { cellText, type CellValue } from "@idk/shared/workbook/values";

export interface ColumnStatus { header: string; important: boolean; empty: boolean }

export function columnStatus(headers: string[], important: string[], row: CellValue[] | null): ColumnStatus[] {
  return headers.map((header, i) => ({
    header,
    important: important.includes(header),
    empty: row !== null && cellText(row[i] ?? null) === "",
  }));
}

export const tablesOnSheet = (sheet: string): TableName[] => SHEETS.find((s) => s.name === sheet)?.tables ?? [];
