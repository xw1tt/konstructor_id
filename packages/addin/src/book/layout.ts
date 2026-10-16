// Разметка книги: источники выпадающих списков и формулы условного форматирования (чистые функции).
import { TABLES, keyColumn, type ColumnDef } from "@idk/shared/workbook/schema";

export const COLORS = {
  header: "#1F4E78", important: "#C00000", service: "#7F7F7F", empty: "#FFC7CE", duplicate: "#FFEB9C", headerText: "#FFFFFF",
} as const;

/** Буква столбца по индексу (0 → A). */
export function colLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Источник списка проверки данных: ссылка → столбец ключа целевой таблицы, перечисление → значения. */
export function listSource(col: ColumnDef): string | null {
  if ((col.type === "ref" || col.type === "refs") && col.ref) {
    const key = keyColumn(col.ref);
    return key ? `=INDIRECT("${TABLES[col.ref].name}[${key.header}]")` : null;
  }
  if (col.type === "enum" && col.values) return `=${listName(col)}`;
  return null;
}

/** Имя диапазона со значениями перечисления (на скрытом листе «Списки»): подписи ролей содержат запятые,
 *  поэтому список «через запятую» в проверке данных Excel не подходит. */
export const listName = (col: ColumnDef) => `Список_${col.key}`;
export const LISTS_SHEET = "Списки";

/** Запрещать ли ввод вне списка: для нескольких материалов через «; » — нет. */
export const strictList = (col: ColumnDef) => col.type !== "refs";

/** Пустая ячейка важного столбца в непустой строке. */
export const importantRule = (firstCol: string, lastCol: string, col: string, firstRow: number) =>
  `=AND(COUNTA($${firstCol}${firstRow}:$${lastCol}${firstRow})>0,LEN(TRIM(${col}${firstRow}))=0)`;

/** Повтор значения ключа в столбце. */
export const duplicateRule = (col: string, firstRow: number, lastRow: number) =>
  `=AND(${col}${firstRow}<>"",COUNTIF($${col}$${firstRow}:$${col}$${lastRow},${col}${firstRow})>1)`;
