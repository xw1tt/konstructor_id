// Повторная загрузка РКЦ: обновление спецификации книги по №п/п. Ручные строки не трогаются, пропавшие из РКЦ
// позиции остаются с пометкой «нет в РКЦ», привязки материалов (в «Материалах») не меняются.
import { column, SPEC_MISSING } from "../workbook/schema.ts";
import { cellText, parseNumberCell, type CellValue } from "../workbook/values.ts";
import type { Book, BookRow } from "../workbook/records.ts";
import type { TableStore } from "../workbook/store.ts";
import type { RkcItem } from "./rkc.ts";

export interface SpecDiff { added: RkcItem[]; changed: { number: string; fields: string[] }[]; missing: string[]; same: number }

const H = (k: string) => column("Спецификация", k).header;
const txt = (v: CellValue) => cellText(v).trim();
const num = (v: CellValue) => { const p = parseNumberCell(v); return p.ok ? p.value ?? 0 : 0; };
const isNoNumber = (n: string) => n.startsWith("б/н");

function record(i: RkcItem, note: CellValue): Record<string, CellValue> {
  return {
    [H("number")]: i.number, [H("section")]: i.section || null, [H("name")]: i.name, [H("unit")]: i.unit || null,
    [H("quantity")]: i.quantity, [H("source")]: "РКЦ", [H("note")]: note,
  };
}

function keep(r: BookRow): Record<string, CellValue> {
  return Object.fromEntries(["number", "section", "name", "unit", "quantity", "source", "note"].map((k) => [H(k), r.v[k] ?? null]));
}

const withoutMissing = (note: string) => note.split(/;\s*/).filter((p) => p && p !== SPEC_MISSING).join("; ");
const withMissing = (note: string) => (note.split(/;\s*/).includes(SPEC_MISSING) ? note : [note, SPEC_MISSING].filter(Boolean).join("; "));

export function mergeSpec(book: Book, items: RkcItem[]): { rows: Record<string, CellValue>[]; diff: SpecDiff } {
  const old = book.tables["Спецификация"] ?? [];
  const diff: SpecDiff = { added: [], changed: [], missing: [], same: 0 };
  const taken = new Set<BookRow>();
  const findOld = (i: RkcItem) => old.find((r) => !taken.has(r) && txt(r.v.source) === "РКЦ" && (isNoNumber(i.number)
    ? isNoNumber(txt(r.v.number)) && txt(r.v.name) === i.name
    : txt(r.v.number) === i.number));

  const out: Record<string, CellValue>[] = [];
  const placed = new Map<BookRow, Record<string, CellValue>>();
  for (const i of items) {
    const r = findOld(i);
    if (!r) { diff.added.push(i); out.push(record(i, null)); continue; }
    taken.add(r);
    const fields: string[] = [];
    if (txt(r.v.section) !== i.section) fields.push(H("section"));
    if (txt(r.v.name) !== i.name) fields.push(H("name"));
    if (txt(r.v.unit) !== i.unit) fields.push(H("unit"));
    if (num(r.v.quantity) !== i.quantity) fields.push(H("quantity"));
    if (fields.length) diff.changed.push({ number: i.number, fields }); else diff.same++;
    const note = withoutMissing(txt(r.v.note));
    const rec = record(i, note || null);
    out.push(rec);
    placed.set(r, rec);
  }
  // Ручные и пропавшие строки — сразу после строки, за которой стояли в книге.
  old.forEach((r, k) => {
    if (taken.has(r)) return;
    const rec = keep(r);
    if (txt(r.v.source) === "РКЦ") {
      rec[H("note")] = withMissing(txt(r.v.note));
      diff.missing.push(txt(r.v.number));
    }
    const prev = k > 0 ? placed.get(old[k - 1]) : undefined;
    const next = prev ? undefined : old.slice(k + 1).map((x) => placed.get(x)).find(Boolean);
    out.splice(prev ? out.indexOf(prev) + 1 : next ? out.indexOf(next) : out.length, 0, rec);
    placed.set(r, rec);
  });
  return { rows: out, diff };
}

/** Перестраивает таблицу «Спецификация» результатом слияния: сначала новые строки в конец, потом удаление прежних —
 *  если вставка не удалась (лист защищён, сбой Excel), прежняя спецификация остаётся целой. */
export async function applySpec(store: TableStore, book: Book, items: RkcItem[]): Promise<SpecDiff> {
  const { rows, diff } = mergeSpec(book, items);
  if (await store.isVirtual?.("Спецификация")) return applySpecInPlace(store, book, rows, diff);
  const old = (book.tables["Спецификация"] ?? []).map((r) => r.row);
  const data = await store.read("Спецификация");
  if (rows.length) await store.insert("Спецификация", data?.rows.length ?? 0, rows);
  if (old.length) await store.remove("Спецификация", old);
  return diff;
}

/**
 * План 31: спецификация — часть «Материалов». Позиции обновляются на месте по № п/п (строки материалов не удаляются),
 * новые — новыми строками. Наименование материала, который уже стоит в актах, ВОР или документах, не меняется:
 * новое наименование из РКЦ дописывается в примечание.
 */
async function applySpecInPlace(store: TableStore, book: Book, rows: Record<string, CellValue>[], diff: SpecDiff): Promise<SpecDiff> {
  const old = book.tables["Спецификация"] ?? [];
  const used = new Set<string>([
    ...(book.tables["МатериалыАктов"] ?? []).map((r) => txt(r.v.material).toLowerCase()),
    ...(book.tables["ВОР"] ?? []).map((r) => txt(r.v.material).toLowerCase()),
    ...(book.tables["ДокументыКачества"] ?? []).flatMap((r) => cellText(r.v.materials).split(/;\s*/).map((m) => m.trim().toLowerCase())),
  ]);
  const taken = new Set<BookRow>();
  const add: Record<string, CellValue>[] = [];
  for (const rec of rows) {
    const n = txt(rec[H("number")] ?? null);
    const o = old.find((r) => !taken.has(r) && (n && !isNoNumber(n) ? txt(r.v.number) === n : isNoNumber(txt(r.v.number)) && txt(r.v.name) === txt(rec[H("name")] ?? null)));
    if (!o) { add.push(rec); continue; }
    taken.add(o);
    const values: Record<string, CellValue> = {};
    for (const k of ["section", "name", "unit", "quantity", "source", "note"]) {
      const h = H(k);
      if (!(h in rec)) continue;
      const a = cellText(rec[h] ?? null).trim(), b = cellText(o.v[k] ?? null).trim();
      if (k === "quantity" ? num(rec[h] ?? null) !== num(o.v[k] ?? null) : a !== b) values[h] = rec[h];
    }
    if (H("name") in values && used.has(txt(o.v.name).toLowerCase())) {
      const note = [txt((values[H("note")] ?? o.v.note) ?? null), `в РКЦ: «${txt(values[H("name")])}»`].filter(Boolean).join("; ");
      delete values[H("name")];
      values[H("note")] = note;
    }
    if (Object.keys(values).length) await store.write("Спецификация", o.row, values);
  }
  if (add.length) await store.insert("Спецификация", 0, add);
  return diff;
}
