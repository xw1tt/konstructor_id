// Строки-примеры новой книги. Признак примера — ячейка, начинающаяся с «Пример:»; такие строки
// программа не читает (readBook), поэтому они не попадают в проверку, печать и поиск ссылок.
import { TABLES, TABLE_NAMES, OBJECT_FIELDS, type TableName } from "./schema.ts";
import type { CellValue } from "./values.ts";
import { EXAMPLE_PREFIX } from "./help.ts";

export { EXAMPLE_PREFIX };

export const isExampleValue = (v: CellValue): boolean => typeof v === "string" && v.trim().startsWith("Пример:");

export const isExampleRow = (values: CellValue[]): boolean => values.some(isExampleValue);

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
