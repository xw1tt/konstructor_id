// План 19: правки книги, предложенные помощником, — проверка, описание «было → стало», применение и отмена.
// Строки для модели и пользователя нумеруются с 1 (как строки таблицы), внутри — индекс строки данных с 0.
import { TABLES, TABLE_NAMES, columnByHeader, column, type ColumnDef, type TableName } from "../workbook/schema.ts";
import { cellText, isoToExcelSerial, parseDateCell, parseNumberCell, type CellValue } from "../workbook/values.ts";
import type { Book } from "../workbook/records.ts";
import type { TableStore } from "../workbook/store.ts";

export type BookChange =
  | { kind: "add"; table: TableName; rows: Record<string, CellValue>[] }
  | { kind: "update"; table: TableName; row: number; values: Record<string, CellValue> }
  | { kind: "delete"; table: TableName; rows: number[] };

export const isTable = (t: unknown): t is TableName => typeof t === "string" && (TABLE_NAMES as string[]).includes(t);

const fmtDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Значение ячейки для модели и людей: даты — ДД.ММ.ГГГГ. */
export function showValue(col: ColumnDef | undefined, v: CellValue): string {
  if (col?.type === "date") {
    const p = parseDateCell(v);
    if (p.ok && p.value) return fmtDate(p.value);
  }
  return cellText(v);
}

/** Значение от модели → значение ячейки по типу столбца; ошибка — текстом для модели. */
export function toCell(t: TableName, col: ColumnDef, raw: unknown): { ok: true; value: CellValue } | { ok: false; error: string } {
  const where = `«${t}» / «${col.header}»`;
  if (col.type === "formula" || col.service && col.type !== "file") return { ok: false, error: `${where}: столбец вычисляется программой, его нельзя заполнять` };
  if (col.type === "file") return { ok: false, error: `${where}: скан прикладывается вручную в карточке строки` };
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  const v = typeof raw === "number" || typeof raw === "boolean" ? raw : String(raw);
  switch (col.type) {
    case "date": {
      const p = parseDateCell(typeof v === "number" ? String(v) : v as CellValue);
      return p.ok && p.value ? { ok: true, value: isoToExcelSerial(p.value) } : { ok: false, error: `${where}: дата в формате ДД.ММ.ГГГГ` };
    }
    case "number": case "int": {
      const p = parseNumberCell(v as CellValue);
      if (!p.ok || p.value === null) return { ok: false, error: `${where}: нужно число` };
      if (col.type === "int" && !Number.isInteger(p.value)) return { ok: false, error: `${where}: нужно целое число` };
      return { ok: true, value: p.value };
    }
    case "enum": {
      const s = cellText(v as CellValue);
      return col.values!.includes(s) ? { ok: true, value: s } : { ok: false, error: `${where}: значение из списка: ${col.values!.join("; ")}` };
    }
    default:
      return { ok: true, value: cellText(v as CellValue) };
  }
}

/** Значения строки от модели (по заголовкам) → ячейки; неизвестный заголовок — ошибка. */
function cells(t: TableName, input: unknown): { ok: true; values: Record<string, CellValue> } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Значения — объект «заголовок: значение»" };
  const values: Record<string, CellValue> = {};
  for (const [h, raw] of Object.entries(input as Record<string, unknown>)) {
    const col = columnByHeader(t, h.trim());
    if (!col) return { ok: false, error: `В таблице «${t}» нет столбца «${h}». Столбцы: ${TABLES[t].columns.map((c) => c.header).join("; ")}` };
    const c = toCell(t, col, raw);
    if (!c.ok) return c;
    values[col.header] = c.value;
  }
  if (!Object.keys(values).length) return { ok: false, error: "Нет значений" };
  return { ok: true, values };
}

const rowExists = (book: Book, t: TableName, row: number) => (book.tables[t] ?? []).some((r) => r.row === row);
const rowNumber = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) && x >= 1 ? x - 1 : null);

/** Проверка предложения модели. Строки — с 1. */
export function validateChange(book: Book, kind: BookChange["kind"], args: Record<string, unknown>): { ok: true; change: BookChange } | { ok: false; error: string } {
  const t = args.table;
  if (!isTable(t)) return { ok: false, error: `Нет таблицы «${String(t)}». Таблицы: ${TABLE_NAMES.join(", ")}` };
  if (book.missing.includes(t)) return { ok: false, error: `В книге нет таблицы «${t}» — нужно «Обновить разметку»` };
  if (kind === "add") {
    const rows = Array.isArray(args.rows) ? args.rows : [];
    if (!rows.length) return { ok: false, error: "rows — непустой список строк" };
    if (rows.length > 200) return { ok: false, error: "Не больше 200 строк за раз" };
    const out: Record<string, CellValue>[] = [];
    for (const [i, r] of rows.entries()) {
      const c = cells(t, r);
      if (!c.ok) return { ok: false, error: `Строка ${i + 1}: ${c.error}` };
      out.push(c.values);
    }
    return { ok: true, change: { kind, table: t, rows: out } };
  }
  if (kind === "update") {
    const row = rowNumber(args.row);
    if (row === null || !rowExists(book, t, row)) return { ok: false, error: `В таблице «${t}» нет строки ${String(args.row)} (номера — как в read_rows)` };
    const c = cells(t, args.values);
    if (!c.ok) return c;
    return { ok: true, change: { kind, table: t, row, values: c.values } };
  }
  const list = Array.isArray(args.rows) ? args.rows.map(rowNumber) : [];
  if (!list.length || list.some((r) => r === null || !rowExists(book, t, r))) return { ok: false, error: `rows — номера существующих строк таблицы «${t}» (как в read_rows)` };
  return { ok: true, change: { kind: "delete", table: t, rows: [...new Set(list as number[])].sort((a, b) => a - b) } };
}

const keyText = (book: Book, t: TableName, row: number) => {
  const key = TABLES[t].columns.find((c) => c.isKey) ?? TABLES[t].columns[0];
  const r = (book.tables[t] ?? []).find((x) => x.row === row);
  return r ? showValue(key, r.v[key.key]) : "";
};
const show = (t: TableName, h: string, v: CellValue) => showValue(columnByHeader(t, h), v) || "пусто";

/** Описание правки для карточки «Предлагаемые изменения». */
export function describeChange(book: Book, c: BookChange): string[] {
  const sheet = TABLES[c.table].sheet;
  if (c.kind === "add")
    return c.rows.map((r) => `Добавить на лист «${sheet}» (${c.table}): ${Object.entries(r).filter(([, v]) => cellText(v) !== "").map(([h, v]) => `${h}: ${show(c.table, h, v)}`).join("; ")}`);
  if (c.kind === "delete")
    return c.rows.map((r) => `Удалить с листа «${sheet}» (${c.table}) строку ${r + 1}${keyText(book, c.table, r) ? ` — ${keyText(book, c.table, r)}` : ""}`);
  const old = (book.tables[c.table] ?? []).find((x) => x.row === c.row);
  const k = keyText(book, c.table, c.row);
  return Object.entries(c.values).map(([h, v]) => {
    const col = columnByHeader(c.table, h)!;
    return `«${sheet}» (${c.table}), строка ${c.row + 1}${k ? ` (${k})` : ""}: ${h}: «${old ? showValue(col, old.v[col.key] ?? null) || "пусто" : "пусто"}» → «${show(c.table, h, v)}»`;
  });
}

// ---------- Применение и отмена ----------

type UndoOp =
  | { kind: "write"; table: TableName; row: number; values: Record<string, CellValue> }
  | { kind: "reinsert"; table: TableName; at: number; values: Record<string, CellValue>; links: Record<string, string | null> }
  /** План 31: добавленные строки виртуальной таблицы — по значениям (индексы документов не постоянны). */
  | { kind: "removeMatch"; table: TableName; match: Record<string, CellValue>[] }
  | { kind: "remove"; table: TableName; rows: number[] };
export interface Undo { ops: UndoOp[] }

/** Ключ строки виртуальной таблицы для отмены: документ — вид и номер, позиция — № п/п. */
function matchOf(table: TableName, r: Record<string, CellValue>): Record<string, CellValue> {
  const keys = table === "Спецификация" ? ["number"] : ["type", "number"];
  return Object.fromEntries(keys.map((k) => column(table, k).header).map((h) => [h, r[h] ?? null]));
}

/** Применяет правки: изменения ячеек → удаления (с конца) → добавления в конец таблицы. Возвращает отмену. */
export async function applyChanges(store: TableStore, changes: BookChange[]): Promise<Undo> {
  const ops: UndoOp[] = [];
  for (const c of changes.filter((x): x is Extract<BookChange, { kind: "update" }> => x.kind === "update")) {
    const t = await store.read(c.table);
    if (!t || !t.rows[c.row]) throw new Error(`Строки ${c.row + 1} таблицы «${c.table}» уже нет — попросите помощника заново`);
    const before = Object.fromEntries(Object.keys(c.values).map((h) => [h, t.rows[c.row][t.headers.indexOf(h)] ?? null]));
    await store.write(c.table, c.row, c.values);
    ops.push({ kind: "write", table: c.table, row: c.row, values: before });
  }
  const dels = changes.filter((x): x is Extract<BookChange, { kind: "delete" }> => x.kind === "delete");
  for (const table of [...new Set(dels.map((d) => d.table))]) {
    const rows = [...new Set(dels.filter((d) => d.table === table).flatMap((d) => d.rows))].sort((a, b) => b - a);
    const t = await store.read(table);
    if (!t) continue;
    for (const r of rows) {
      if (!t.rows[r]) continue;
      const values = Object.fromEntries(t.headers.map((h, i) => [h, t.rows[r][i] ?? null]));
      const links = Object.fromEntries(t.headers.map((h, i) => [h, t.links[r]?.[i] ?? null]).filter(([, l]) => l));
      ops.push({ kind: "reinsert", table, at: r, values, links });
    }
    await store.remove(table, rows.filter((r) => !!t.rows[r]));
  }
  for (const c of changes.filter((x): x is Extract<BookChange, { kind: "add" }> => x.kind === "add")) {
    const t = await store.read(c.table);
    if (!t) throw new Error(`В книге нет таблицы «${c.table}»`);
    if (await store.isVirtual?.(c.table)) {
      for (const r of c.rows) await store.insert(c.table, t.rows.length, [r]);
      ops.push({ kind: "removeMatch", table: c.table, match: c.rows.map((r) => matchOf(c.table, r)) });
      continue;
    }
    const first = await store.insert(c.table, t.rows.length, c.rows);
    ops.push({ kind: "remove", table: c.table, rows: c.rows.map((_, i) => first + i) });
  }
  return { ops };
}

/** Отмена в обратном порядке: убрать добавленные, вернуть удалённые (по возрастанию мест), вернуть прежние значения. */
export async function undoChanges(store: TableStore, undo: Undo): Promise<void> {
  const ops = [...undo.ops].reverse();
  for (const op of ops.filter((o) => o.kind === "remove")) await store.remove(op.table, (op as { rows: number[] }).rows);
  for (const op of ops.filter((o): o is Extract<UndoOp, { kind: "removeMatch" }> => o.kind === "removeMatch")) {
    const t = await store.read(op.table);
    if (!t) continue;
    const eq = (a: CellValue | undefined, b: CellValue) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
    const rows = t.rows.map((r, i) => (op.match.some((m) => Object.entries(m).every(([h, v]) => eq(r[t.headers.indexOf(h)], v))) ? i : -1)).filter((i) => i >= 0);
    if (rows.length) await store.remove(op.table, rows);
  }
  const re = ops.filter((o): o is Extract<UndoOp, { kind: "reinsert" }> => o.kind === "reinsert").sort((a, b) => a.at - b.at);
  for (const op of re) {
    const at = await store.insert(op.table, op.at, [op.values]);
    if (Object.keys(op.links).length) {
      const vals = Object.fromEntries(Object.keys(op.links).map((h) => [h, op.values[h] ?? null]));
      await store.write(op.table, at, vals, op.links);
    }
  }
  for (const op of ops.filter((o): o is Extract<UndoOp, { kind: "write" }> => o.kind === "write")) await store.write(op.table, op.row, op.values);
}
