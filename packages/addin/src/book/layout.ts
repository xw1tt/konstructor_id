// Разметка книги: источники выпадающих списков и формулы условного форматирования (чистые функции).
import { TABLES, keyColumn, type ColumnDef, type TableName } from "@idk/shared/workbook/schema";

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
export function listSource(col: ColumnDef, table?: TableName): string | null {
  if ((col.type === "ref" || col.type === "refs") && col.ref) {
    const key = keyColumn(col.ref);
    return key ? `=INDIRECT("${TABLES[col.ref].name}[${key.header}]")` : null;
  }
  if (col.type === "enum" && col.values && table) return `=${listName(table, col)}`;
  return null;
}

/** Имя диапазона со значениями перечисления (на скрытом листе «Списки»): подписи ролей содержат запятые,
 *  поэтому список «через запятую» в проверке данных Excel не подходит. */
/** Имя включает таблицу: ключи столбцов повторяются в разных таблицах («Вид» схем и нормативов).
 *  Книги 0.3 содержат прежние имена «Список_<ключ>» — их проверки данных продолжают работать. */
export const listName = (table: TableName, col: ColumnDef) => `Список_${table}_${col.key}`;
export const LISTS_SHEET = "Списки";

/** Запрещать ли ввод вне списка: для нескольких материалов через «; » — нет. */
export const strictList = (col: ColumnDef) => col.type !== "refs";

/** Пустая ячейка важного столбца в непустой строке. */
export const importantRule = (firstCol: string, lastCol: string, col: string, firstRow: number) =>
  `=AND(COUNTA($${firstCol}${firstRow}:$${lastCol}${firstRow})>0,LEN(TRIM(${col}${firstRow}))=0)`;

/** Повтор значения ключа в столбце. */
export const duplicateRule = (col: string, firstRow: number, lastRow: number) =>
  `=AND(${col}${firstRow}<>"",COUNTIF($${col}$${firstRow}:$${col}$${lastRow},${col}${firstRow})>1)`;

/** Индексы видимых (не скрытых фильтром) строк данных таблицы по областям видимых ячеек выделения. */
export function visibleTableRows(areas: { rowIndex: number; rowCount: number }[], bodyRow: number, bodyCount: number): number[] {
  const out = new Set<number>();
  for (const a of areas)
    for (let r = a.rowIndex; r < a.rowIndex + a.rowCount; r++) if (r >= bodyRow && r < bodyRow + bodyCount) out.add(r - bodyRow);
  return [...out].sort((x, y) => x - y);
}

/** Строка (с 0) заголовка новой таблицы: на пустом листе — 4-я, иначе через две пустые строки ниже занятой части. */
export const nextTableTop = (usedLastRow: number | null) => (usedLastRow === null ? 3 : usedLastRow + 4);

/** Текстовый формат «@»: Excel не превращает ИНН «0274…» в число, «1.10» в 1,1, а текст — в дату. */
export const textFormatted = (col: ColumnDef) => ["text", "longtext", "ref", "refs", "enum", "file"].includes(col.type);
