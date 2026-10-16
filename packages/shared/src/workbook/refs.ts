// Ссылки между листами по значению ключа; переименование ключа с обновлением ссылок.
import { TABLES, TABLE_NAMES, OBJECT_FIELDS, keyColumn, type TableName } from "./schema.ts";
import { cellText, splitRefs, joinRefs } from "./values.ts";
import type { Book } from "./records.ts";
import type { TableStore } from "./store.ts";

export interface RefHit { table: TableName; row: number; column: string }
export type RenameResult = { ok: true; updated: number } | { ok: false; message: string };

const OBJECT_REF_LABELS = new Set<string>(OBJECT_FIELDS.filter((f) => f.type === "ref").map((f) => f.label));

export function findReferences(book: Book, table: TableName, key: string): RefHit[] {
  const k = key.trim();
  if (!k) return [];
  const hits: RefHit[] = [];
  for (const name of TABLE_NAMES) {
    for (const col of TABLES[name].columns) {
      if (col.ref !== table || (col.type !== "ref" && col.type !== "refs")) continue;
      for (const r of book.tables[name] ?? []) {
        const match = col.type === "refs" ? splitRefs(r.v[col.key]).includes(k) : cellText(r.v[col.key]) === k;
        if (match) hits.push({ table: name, row: r.row, column: col.header });
      }
    }
  }
  if (table === "Организации") {
    for (const r of book.tables["Объект"] ?? []) {
      if (OBJECT_REF_LABELS.has(cellText(r.v.field)) && cellText(r.v.value) === k)
        hits.push({ table: "Объект", row: r.row, column: "Значение" });
    }
  }
  return hits;
}

export async function renameKey(store: TableStore, book: Book, table: TableName, oldKey: string, newKey: string): Promise<RenameResult> {
  const keyCol = keyColumn(table);
  const from = oldKey.trim();
  const to = newKey.trim();
  if (!keyCol || !from || !to || from === to) return { ok: true, updated: 0 };
  const taken = (book.tables[table] ?? []).some((r) => cellText(r.v[keyCol.key]) === to);
  if (taken) return { ok: false, message: "Такое значение уже есть" };
  const hits = findReferences(book, table, from);
  for (const h of hits) {
    const col = h.table === "Объект" ? undefined : TABLES[h.table].columns.find((c) => c.header === h.column);
    let value = to;
    if (col?.type === "refs") {
      const cur = book.tables[h.table]!.find((r) => r.row === h.row)!.v[col.key];
      value = joinRefs(splitRefs(cur).map((x) => (x === from ? to : x)));
    }
    await store.write(h.table, h.row, { [h.column]: value });
  }
  return { ok: true, updated: hits.length };
}
