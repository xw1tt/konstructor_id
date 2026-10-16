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
  /** Вставляет строки; возвращает индекс первой вставленной (в Excel пустая единственная строка таблицы занимается). */
  insert(name: TableName, at: number, rows: Record<string, CellValue>[]): Promise<number>;
  remove(name: TableName, rows: number[]): Promise<void>;
  setting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

/** Строка для «Функционала листа»: значения и адреса гиперссылок (по позициям). */
export interface RowData { values: CellValue[]; links: (string | null)[] }

/** Строки, с которыми работает «Функционал листа»: строки таблицы или строки листа. */
export interface RowsTarget {
  count(): Promise<number>;
  read(row: number): Promise<RowData>;
  /** Не трогает формульные позиции. */
  write(row: number, data: RowData): Promise<void>;
  /** Вставляет n пустых строк; возвращает индекс первой. */
  insertBlank(at: number, n: number): Promise<number>;
  remove(rows: number[]): Promise<void>;
}

export function tableRows(store: TableStore, name: TableName): RowsTarget {
  const cols = TABLES[name].columns;
  const headers = cols.map((c) => c.header);
  const data = async () => {
    const t = await store.read(name);
    if (!t) throw new Error(`Таблица «${name}» не найдена`);
    return t;
  };
  return {
    count: async () => (await data()).rows.length,
    read: async (row) => {
      const t = await data();
      const at = (h: string) => t.headers.indexOf(h);
      return {
        values: headers.map((h) => t.rows[row]?.[at(h)] ?? null),
        links: headers.map((h) => t.links[row]?.[at(h)] ?? null),
      };
    },
    write: (row, d) => store.write(
      name, row,
      Object.fromEntries(headers.map((h, i) => [h, d.values[i] ?? null])),
      Object.fromEntries(cols.flatMap((c, i) => (c.type === "file" ? [[c.header, d.links[i] ?? null]] : []))),
    ),
    insertBlank: (at, n) => store.insert(name, at, Array.from({ length: n }, () => ({}))),
    remove: (rows) => store.remove(name, rows),
  };
}
