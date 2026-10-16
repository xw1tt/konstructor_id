// Строки-примеры новой книги. Признак примера — ячейка-признак (ключ), начинающаяся с «Пример:»; такие строки
// программа не читает (readBook), поэтому они не попадают в проверку, печать и поиск ссылок.
import { TABLES, TABLE_NAMES, OBJECT_FIELDS, keyColumn, type ColumnDef, type TableName } from "./schema.ts";
import type { CellValue } from "./values.ts";
import { EXAMPLE_PREFIX } from "./help.ts";

export { EXAMPLE_PREFIX };

export const isExampleValue = (v: CellValue): boolean => typeof v === "string" && v.trim().startsWith("Пример:");

/** Столбец-признак примера: ключ таблицы; без ключа — первая ссылка (акт, материалы); в «Объекте» — «Значение». */
export function exampleColumn(table: TableName): ColumnDef {
  const cols = TABLES[table].columns;
  if (table === "Объект") return cols.find((c) => c.key === "value")!;
  return keyColumn(table) ?? cols.find((c) => c.type === "ref" || c.type === "refs") ?? cols[0];
}

/** Строка — пример, если её ячейка-признак начинается с «Пример:». Замените её своим значением — строка станет данными. */
export function isExampleRow(values: CellValue[], table: TableName, headers: string[]): boolean {
  const i = headers.indexOf(exampleColumn(table).header);
  return i >= 0 && isExampleValue(values[i] ?? null);
}

/** По одной строке-примеру на таблицу (записи по заголовкам); для «Объекта» — строка на каждое поле. */
export function exampleRows(): Partial<Record<TableName, Record<string, CellValue>[]>> {
  const out: Partial<Record<TableName, Record<string, CellValue>[]>> = {};
  for (const name of TABLE_NAMES) {
    if (name === "Объект") {
      out[name] = OBJECT_FIELDS.map((f) => ({ "Поле": f.label, "Значение": f.example }));
      continue;
    }
    const rec: Record<string, CellValue> = {};
    for (const col of TABLES[name].columns) {
      if (col.type === "formula" || col.type === "file" || col.example === undefined) continue;
      rec[col.header] = col.example;
    }
    out[name] = [rec];
  }
  return out;
}
