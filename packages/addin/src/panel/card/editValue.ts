// Значение ячейки ↔ текст поля карточки.
import type { ColumnDef, TableName } from "@idk/shared/workbook/schema";
import {
  cellText, parseDateCell, parseNumberCell, isoToExcelSerial, excelSerialToIso, joinRefs, type CellValue, type Parsed,
} from "@idk/shared/workbook/values";

const ruDate = (iso: string) => iso.split("-").reverse().join(".");

/** Текст для поля карточки: дата — «ДД.ММ.ГГГГ», число — с запятой. */
export function fromCell(col: ColumnDef, v: CellValue): string {
  if (col.type === "date") {
    const p = parseDateCell(v);
    return p.ok ? (p.value ? ruDate(p.value) : "") : cellText(v);
  }
  if ((col.type === "number" || col.type === "int" || col.type === "formula") && typeof v === "number")
    return String(v).replace(".", ",");
  return v === null ? "" : String(v);
}

/** Значение для записи в ячейку: дата — серийное число Excel, число — number, список — через «; ». */
export function toCell(col: ColumnDef, input: string | string[]): Parsed<CellValue> {
  if (Array.isArray(input)) return { ok: true, value: input.length ? joinRefs(input) : null };
  const t = input.trim();
  if (!t) return { ok: true, value: null };
  switch (col.type) {
    case "date": {
      const p = parseDateCell(t);
      return p.ok ? { ok: true, value: p.value ? isoToExcelSerial(p.value) : null } : p;
    }
    case "number": return parseNumberCell(t);
    case "int": {
      const p = parseNumberCell(t);
      if (!p.ok) return p;
      return p.value !== null && !Number.isInteger(p.value) ? { ok: false, message: "Нужно целое число" } : p;
    }
    default: return { ok: true, value: col.type === "longtext" ? input.replace(/^\s+|\s+$/g, "") : t };
  }
}

/** Как toCell, но поля таблицы «Объект» (текстовый столбец «Значение») получают дату текстом «ДД.ММ.ГГГГ». */
export function toCellFor(table: TableName, col: ColumnDef, input: string | string[]): Parsed<CellValue> {
  const p = toCell(col, input);
  if (p.ok && table === "Объект" && col.type === "date" && typeof p.value === "number") return { ok: true, value: ruDate(excelSerialToIso(p.value)) };
  return p;
}
