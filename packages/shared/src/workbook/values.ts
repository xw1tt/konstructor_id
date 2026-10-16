// Значения ячеек книги: даты Excel, разбор дат и чисел, введённых текстом, списки через «; ».

export type CellValue = string | number | boolean | null;
export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const DAY = 86_400_000;
const EPOCH = Date.UTC(1899, 11, 30);
const DATE_MSG = "Дата в формате ДД.ММ.ГГГГ";
const NUMBER_MSG = "Нужно число";

/** Серийный номер даты Excel → «ГГГГ-ММ-ДД». */
export function excelSerialToIso(n: number): string {
  return new Date(EPOCH + Math.floor(n) * DAY).toISOString().slice(0, 10);
}

/** «ГГГГ-ММ-ДД» → серийный номер даты Excel. */
export function isoToExcelSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY);
}

/** Строка без пробелов по краям; null → "", число → строка. */
export function cellText(v: CellValue): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

const validIso = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};

/** Дата из ячейки: серийное число, «ДД.ММ.ГГГГ[ г.]», «ГГГГ-ММ-ДД»; пусто → null. */
export function parseDateCell(v: CellValue): Parsed<string | null> {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return { ok: true, value: excelSerialToIso(v) };
  const t = cellText(v);
  if (!t) return { ok: true, value: null };
  let iso: string | null = null;
  const ru = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*г\.?)?$/);
  const en = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ru) iso = validIso(+ru[3], +ru[2], +ru[1]);
  else if (en) iso = validIso(+en[1], +en[2], +en[3]);
  return iso ? { ok: true, value: iso } : { ok: false, message: DATE_MSG };
}

/** Число из ячейки: число или текст с запятой/точкой и пробелами-разделителями; пусто → null. */
export function parseNumberCell(v: CellValue): Parsed<number | null> {
  if (typeof v === "number") return Number.isFinite(v) ? { ok: true, value: v } : { ok: false, message: NUMBER_MSG };
  const t = cellText(v).replace(/[\s ]/g, "").replace(",", ".");
  if (!t) return { ok: true, value: null };
  if (!/^-?\d+(\.\d+)?$/.test(t)) return { ok: false, message: NUMBER_MSG };
  return { ok: true, value: Number(t) };
}

/** Список значений через «;» (края обрезаны, пустые выброшены). */
export function splitRefs(v: CellValue): string[] {
  return cellText(v).split(";").map((s) => s.trim()).filter(Boolean);
}

export const joinRefs = (list: string[]): string => list.join("; ");
