// План 16: библиотека компании — записи, ключи, перенос «книга ↔ библиотека» (чистые функции; хранилище — на сервере).
import { z } from "zod";
import { TABLES, type TableName } from "../workbook/schema.ts";
import { cellText, splitRefs, type CellValue } from "../workbook/values.ts";
import type { Book, BookRow } from "../workbook/records.ts";
import type { BookLinks, BookRecords } from "../workbook/write.ts";

export const LIB_KINDS = ["org", "rep", "material", "doc"] as const;
export type LibKind = (typeof LIB_KINDS)[number];

export const LIB_TABLE: Record<LibKind, TableName> = {
  org: "Организации", rep: "Представители", material: "Материалы", doc: "ДокументыКачества",
};
export const LIB_LABELS: Record<LibKind, string> = {
  org: "Организации", rep: "Представители", material: "Материалы", doc: "Документы качества",
};
export const libKindOf = (t: TableName): LibKind | null =>
  (Object.entries(LIB_TABLE) as [LibKind, TableName][]).find(([, n]) => n === t)?.[0] ?? null;

/** Столбцы объекта (строка спецификации, порядок подписей) и файлы, кроме скана документа, в библиотеку не идут. */
// Материал (план 31): в строке «Материалов» ещё позиция РКЦ и группы «Док.N» — в библиотеку идёт только сам материал,
// его документы — отдельными записями (из виртуальной «ДокументыКачества»).
const SKIP: Partial<Record<LibKind, string[]>> = { org: ["logo"], rep: ["sortOrder"], doc: ["file"] };
const ONLY: Partial<Record<LibKind, string[]>> = { material: ["name", "mark", "article", "manufacturer", "unit"] };
export const libColumns = (k: LibKind) =>
  TABLES[LIB_TABLE[k]].columns.filter((c) => c.type !== "formula" && !(SKIP[k] ?? []).includes(c.key) && (!ONLY[k] || ONLY[k]!.includes(c.key)));

const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const LibScan = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/), name: z.string(), mime: z.string() });
export type LibScan = z.infer<typeof LibScan>;
export const LibRecord = z.object({
  id: z.string(),
  kind: z.enum(LIB_KINDS),
  /** Значения по ключам столбцов таблицы книги. */
  values: z.record(Cell),
  scan: LibScan.nullable().default(null),
  updatedAt: z.string(),
  updatedBy: z.string().default(""),
});
export type LibRecord = z.infer<typeof LibRecord>;

const norm = (v: CellValue | undefined) => cellText(v ?? null).trim().replace(/\s+/g, " ").toLowerCase();

/** Ключ записи: повтор ключа — та же запись (обновление, не дубль). */
export function libKey(kind: LibKind, v: Record<string, CellValue | undefined>): string {
  switch (kind) {
    case "org": return norm(v.inn) ? `inn:${norm(v.inn)}` : `name:${norm(v.shortName)}`;
    case "rep": return `${norm(v.fullName)}|${norm(v.org)}`;
    case "material": return `${norm(v.name)}|${norm(v.mark)}`;
    default: return `${norm(v.type)}|${norm(v.number)}`;
  }
}

/** Пустая запись (нет ключевого значения) в библиотеку не попадает. */
export function libKeyFilled(kind: LibKind, v: Record<string, CellValue | undefined>): boolean {
  switch (kind) {
    case "org": return !!(norm(v.inn) || norm(v.shortName));
    case "rep": return !!norm(v.fullName);
    case "material": return !!norm(v.name);
    default: return !!(norm(v.type) && norm(v.number));
  }
}

/** Значения строки книги для библиотеки (по ключам столбцов, без служебных и объектных). */
export function libValues(kind: LibKind, row: BookRow): Record<string, CellValue> {
  return Object.fromEntries(libColumns(kind).map((c) => [c.key, row.v[c.key] ?? null]));
}

/** Что добавить в книгу: выбранные записи и их зависимости, без уже имеющихся в книге. */
export interface AddPlan {
  /** Записи по видам в порядке добавления (организации → представители → материалы → документы). */
  add: LibRecord[];
  /** Уже есть в книге (по ключу). */
  skipped: LibRecord[];
}

export function planAdd(book: Book, picked: LibRecord[], all: LibRecord[]): AddPlan {
  const inBook = new Map<LibKind, Set<string>>(LIB_KINDS.map((k) => [k, new Set((book.tables[LIB_TABLE[k]] ?? []).map((r) => libKey(k, r.v)))]));
  const chosen = new Map<string, LibRecord>();
  const take = (r: LibRecord) => { if (!chosen.has(r.id)) chosen.set(r.id, r); };
  for (const r of picked) {
    take(r);
    if (r.kind === "material") {
      const name = norm(r.values.name);
      for (const d of all) if (d.kind === "doc" && splitRefs(d.values.materials ?? null).some((m) => norm(m) === name)) take(d);
    }
    if (r.kind === "rep" && norm(r.values.org)) {
      const org = all.find((o) => o.kind === "org" && norm(o.values.shortName) === norm(r.values.org));
      if (org) take(org);
    }
  }
  const add: LibRecord[] = [], skipped: LibRecord[] = [];
  for (const k of LIB_KINDS) {
    const seen = inBook.get(k)!;
    for (const r of chosen.values()) {
      if (r.kind !== k) continue;
      const key = libKey(k, r.values);
      if (seen.has(key)) skipped.push(r);
      else { seen.add(key); add.push(r); }
    }
  }
  return { add, skipped };
}

/** Записи → строки книги по заголовкам; scanLink(record) — адрес скана в локальном хранилище (или null). */
export function toBookRows(records: LibRecord[], scanLink: (r: LibRecord) => string | null): { rows: BookRecords; links: BookLinks } {
  const rows: BookRecords = {}, links: BookLinks = {};
  for (const r of records) {
    const t = LIB_TABLE[r.kind];
    const rec: Record<string, CellValue> = Object.fromEntries(libColumns(r.kind).map((c) => [c.header, r.values[c.key] ?? null]));
    const link = r.kind === "doc" ? scanLink(r) : null;
    const scanHeader = TABLES[t].columns.find((c) => c.key === "file")?.header;
    if (link && scanHeader) rec[scanHeader] = r.scan?.name ?? "скан";
    (rows[t] ??= []).push(rec);
    // Ссылки — по позиции строки в своей таблице: строки без скана получают пустой объект.
    (links[t] ??= []).push(link && scanHeader ? { [scanHeader]: link } : {});
  }
  return { rows, links };
}

/** Номер локального файла из адреса скана в книге («…/api/files/12»). */
export const fileIdOf = (link: string | null | undefined): number | null => {
  const m = /\/api\/files\/(\d+)(?:[?#].*)?$/.exec(link ?? "");
  return m ? Number(m[1]) : null;
};
