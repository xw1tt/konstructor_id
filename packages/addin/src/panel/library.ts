// План 16: «Добавить в книгу» из библиотеки и «В библиотеку» из строк книги.
import { LIB_KINDS, LIB_TABLE, fileIdOf, libKeyFilled, libKindOf, libValues, planAdd, toBookRows, type LibRecord } from "@idk/shared/library/model";
import type { Book } from "@idk/shared/workbook/records";
import type { TableName } from "@idk/shared/workbook/schema";
import type { TableStore } from "@idk/shared/workbook/store";
import { writeBook } from "@idk/shared/workbook/write";
import type { LibraryApi } from "./libraryApi.ts";

/** Записи всех разделов (для зависимостей: документы материала, организация представителя). */
export async function loadAll(api: LibraryApi): Promise<LibRecord[]> {
  return (await Promise.all(LIB_KINDS.map((k) => api.list(k)))).flat();
}

/** Добавляет выбранные записи и их зависимости в книгу; сканы — в локальное хранилище, ссылка — в ячейку «Скан». */
export async function addToBook(store: TableStore, book: Book, picked: LibRecord[], all: LibRecord[], api: LibraryApi, origin: string):
  Promise<{ added: number; skipped: number }> {
  const plan = planAdd(book, picked, all);
  const links = new Map<string, string>();
  for (const r of plan.add) {
    if (r.kind !== "doc" || !r.scan) continue;
    const f = await api.importScan(r.scan.sha256, r.scan.name, r.scan.mime);
    links.set(r.id, `${origin}/api/files/${f.fileId}`);
  }
  const { rows, links: bookLinks } = toBookRows(plan.add, (r) => links.get(r.id) ?? null);
  await writeBook(store, rows, bookLinks);
  return { added: plan.add.length, skipped: plan.skipped.length };
}

/** Строки таблицы книги — в библиотеку (документ — со сканом). Пустые по ключу — пропуск. */
export async function sendToLibrary(book: Book, table: TableName, rows: number[], api: LibraryApi):
  Promise<{ added: number; updated: number; empty: number }> {
  const kind = libKindOf(table);
  if (!kind) throw new Error(`Таблица «${table}» не хранится в библиотеке`);
  const res = { added: 0, updated: 0, empty: 0 };
  const want = new Set(rows);
  for (const r of book.tables[LIB_TABLE[kind]] ?? []) {
    if (!want.has(r.row)) continue;
    const values = libValues(kind, r);
    if (!libKeyFilled(kind, values)) { res.empty++; continue; }
    const { created } = await api.save(kind, values, kind === "doc" ? fileIdOf(r.link.file) : null);
    if (created) res.added++; else res.updated++;
  }
  return res;
}
