// 0.45: переход к месту исправления. В окне программы Excel обычно позади окна, поэтому замечание открывает
// «Книгу» на нужной строке и поле (и выделяет ячейку в Excel); в панели — только ячейка в Excel.
import { createContext } from "react";
import type { TableName } from "@idk/shared/workbook/schema";

export interface CellTarget {
  table: TableName;
  row: number | null;
  column: string;
}

export const CellNavContext = createContext<((t: CellTarget) => void) | null>(null);
