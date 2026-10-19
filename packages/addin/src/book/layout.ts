// Разметка книги: источники выпадающих списков и формулы условного форматирования (чистые функции).
import { TABLES, OBJECT_FIELDS, keyColumn, type ColumnDef, type TableName } from "@idk/shared/workbook/schema";

export const COLORS = {
  example: "#7F7F7F",
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

/** «Объект»: пустое значение подсвечивается только в строках обязательных полей. */
export const objectImportantRule = (fieldCol: string, valueCol: string, firstRow: number, labels: string[]) =>
  `=AND(OR(${labels.map((l) => `$${fieldCol}${firstRow}="${l.replace(/"/g, '""')}"`).join(",")}),LEN(TRIM(${valueCol}${firstRow}))=0)`;

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

/** Всплывающая подсказка проверки данных Excel: заголовок до 32 символов, текст до 255. */
export function promptFor(col: ColumnDef): { title: string; message: string } {
  const title = col.header.length > 32 ? col.header.slice(0, 31) + "…" : col.header;
  return { title, message: col.hint.slice(0, 255) };
}

/** Строка-пример: ячейка-признак строки начинается с «Пример:» (строка оформляется серым курсивом). */
export const exampleRule = (col: string, firstRow: number) => `=COUNTIF($${col}${firstRow},"Пример:*")>0`;

/** Проверка данных столбца: список (если есть) и подсказка. Подсказка ставится последней —
 *  clear() в Office.js стирает её вместе с правилом. */
export function applyValidation(body: { dataValidation: any }, col: ColumnDef, table: TableName, prompt = promptFor(col)) {
  const dv = body.dataValidation;
  const source = listSource(col, table);
  // Всегда с чистого листа: столбец, дописанный в конец таблицы, Excel заполняет проверкой соседнего столбца.
  dv.clear();
  if (source) {
    dv.rule = { list: { inCellDropDown: true, source } };
    dv.errorAlert = {
      showAlert: strictList(col), style: "Stop", title: "Значение не из списка",
      message: "Выберите значение из списка или добавьте его на соответствующий лист.",
    };
  }
  dv.prompt = { showPrompt: true, ...prompt };
}

/** Столбцы схемы, которых нет в таблице книги (книга прежней версии) — дописываются в конец таблицы. */
export const missingColumns = (table: TableName, headers: string[]): ColumnDef[] =>
  TABLES[table].columns.filter((c) => !headers.includes(c.header));

/** Поля «Объекта», которых нет среди подписей таблицы. */
export const missingObjectFields = (labels: string[]): string[] =>
  OBJECT_FIELDS.map((f) => f.label).filter((l) => !labels.includes(l));
