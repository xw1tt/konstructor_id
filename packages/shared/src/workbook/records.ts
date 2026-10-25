// Чтение книги: строки таблиц как записи по ключам столбцов; поля таблицы «Объект».
import { TABLES, TABLE_NAMES, OBJECT_FIELDS, type TableName } from "./schema.ts";
import { cellText, type CellValue } from "./values.ts";
import type { TableData, TableStore } from "./store.ts";
import { isExampleRow } from "./examples.ts";

export interface BookRow {
  /** Индекс строки данных в таблице. */
  row: number;
  v: Record<string, CellValue>;
  link: Record<string, string | null>;
}

export interface Book {
  tables: Partial<Record<TableName, BookRow[]>>;
  object: Record<string, CellValue>;
  missing: TableName[];
}

export function tableToRows(name: TableName, t: TableData): BookRow[] {
  const cols = TABLES[name].columns;
  const idx = cols.map((c) => t.headers.indexOf(c.header));
  const out: BookRow[] = [];
  t.rows.forEach((r, row) => {
    if (isExampleRow(r, name, t.headers)) return; // строка-пример новой книги — не данные
    const v: Record<string, CellValue> = {};
    const link: Record<string, string | null> = {};
    let filled = false;
    cols.forEach((c, i) => {
      const val = idx[i] >= 0 ? r[idx[i]] ?? null : null;
      v[c.key] = val;
      link[c.key] = idx[i] >= 0 ? t.links[row]?.[idx[i]] ?? null : null;
      // Строка из одних значений по умолчанию («Порядок» = 1, «Вид» = «Схема») — ещё не данные.
      const isDefault = c.default !== undefined && cellText(val) === String(c.default);
      if (c.type !== "formula" && cellText(val) !== "" && !isDefault) filled = true;
    });
    if (filled) out.push({ row, v, link });
  });
  return out;
}

/** Таблицы книги: одним заходом (readMany), если хранилище умеет, иначе по одной. */
export async function readTables(store: TableStore, names: readonly TableName[] = TABLE_NAMES): Promise<Map<TableName, TableData | null>> {
  if (store.readMany) return store.readMany(names);
  const out = new Map<TableName, TableData | null>();
  for (const name of names) out.set(name, await store.read(name));
  return out;
}

/** Книга из прочитанных таблиц (нет в карте или null — таблица отсутствует). */
export function bookFromTables(tables: ReadonlyMap<TableName, TableData | null>): Book {
  const book: Book = { tables: {}, object: Object.fromEntries(OBJECT_FIELDS.map((f) => [f.key, null])), missing: [] };
  for (const name of TABLE_NAMES) {
    const t = tables.get(name);
    if (!t) { book.missing.push(name); continue; }
    const rows = tableToRows(name, t);
    if (name === "Объект") {
      for (const r of rows) {
        const f = OBJECT_FIELDS.find((x) => x.label === cellText(r.v.field));
        if (f) book.object[f.key] = r.v.value ?? null;
      }
    }
    book.tables[name] = rows;
  }
  return book;
}

export async function readBook(store: TableStore): Promise<Book> {
  return bookFromTables(await readTables(store));
}
