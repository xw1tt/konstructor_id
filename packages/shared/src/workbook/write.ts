// Запись строк в книгу: поля «Объекта» — по полю, остальные таблицы — в конец; ссылки сканов — вместе со значением.
// Нужна примерам новой книги, библиотеке и мастеру первого акта (план 15: вынесено из переноса версии 0.2).
import type { TableName } from "./schema.ts";
import { cellText, type CellValue } from "./values.ts";
import type { TableStore } from "./store.ts";

export type BookRecords = Partial<Record<TableName, Record<string, CellValue>[]>>;
export type BookLinks = Partial<Record<TableName, Record<string, string>[]>>;

export async function writeBook(store: TableStore, rows: BookRecords, links: BookLinks = {}): Promise<void> {
  for (const [name, recs] of Object.entries(rows) as [TableName, Record<string, CellValue>[]][]) {
    if (!recs.length) continue;
    const t = await store.read(name);
    if (!t) continue;
    if (name === "Объект") {
      const fieldIdx = t.headers.indexOf("Поле");
      for (const rec of recs) {
        const at = t.rows.findIndex((r) => cellText(r[fieldIdx]) === rec["Поле"]);
        if (at >= 0) await store.write(name, at, { "Значение": rec["Значение"] });
        else {
          await store.insert(name, t.rows.length, [rec]);
          t.rows.push([rec["Поле"], rec["Значение"]]);
        }
      }
      continue;
    }
    const start = await store.insert(name, t.rows.length, recs);
    const l = links[name] ?? [];
    for (let i = 0; i < l.length; i++) {
      // Значение пишется вместе со ссылкой, чтобы в ячейке осталось имя файла.
      const values = Object.fromEntries(Object.keys(l[i]).map((h) => [h, recs[i][h] ?? null]));
      if (Object.keys(l[i]).length) await store.write(name, start + i, values, l[i]);
    }
  }
}
