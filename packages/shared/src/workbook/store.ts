// Хранилище таблиц книги: общий интерфейс для Excel (ExcelPort) и модели в памяти (MemoryWorkbook).
import { TABLES, type TableName } from "./schema.ts";
import type { CellValue } from "./values.ts";

export interface TableData {
  name: TableName;
  headers: string[];
  rows: CellValue[][];
  /** Адреса гиперссылок; не-null только в столбцах типа file. */
  links: (string | null)[][];
}

export interface TableStore {
  read(name: TableName): Promise<TableData | null>;
  /** Записывает значения по заголовкам; формульные столбцы игнорируются. */
  write(name: TableName, row: number, values: Record<string, CellValue>, links?: Record<string, string | null>): Promise<void>;
  insert(name: TableName, at: number, rows: Record<string, CellValue>[]): Promise<void>;
  remove(name: TableName, rows: number[]): Promise<void>;
  setting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

/** Строки, с которыми работает «Функционал листа»: строки таблицы или строки листа. */
export interface RowsTarget {
  count(): Promise<number>;
  read(row: number): Promise<CellValue[]>;
  /** Не трогает формульные позиции. */
  write(row: number, values: CellValue[]): Promise<void>;
  insertBlank(at: number, n: number): Promise<void>;
  remove(rows: number[]): Promise<void>;
}

export function tableRows(store: TableStore, name: TableName): RowsTarget {
  const headers = TABLES[name].columns.map((c) => c.header);
  const data = async () => {
    const t = await store.read(name);
    if (!t) throw new Error(`Таблица «${name}» не найдена`);
    return t;
  };
  return {
    count: async () => (await data()).rows.length,
    read: async (row) => {
      const t = await data();
      return headers.map((h) => t.rows[row]?.[t.headers.indexOf(h)] ?? null);
    },
    write: (row, values) => store.write(name, row, Object.fromEntries(headers.map((h, i) => [h, values[i] ?? null]))),
    insertBlank: (at, n) => store.insert(name, at, Array.from({ length: n }, () => ({}))),
    remove: (rows) => store.remove(name, rows),
  };
}
