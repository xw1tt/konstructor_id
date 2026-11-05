// Закрытые объёмы по позициям спецификации: тот же расчёт, что формулы «Закрыто»/«Остаток» в книге
// (кол-во строки «Материалы в актах», если пусто — сумма ВОР этого материала в акте), с разбивкой по актам.
import { cellText, parseDateCell, parseNumberCell, type CellValue } from "../workbook/values.ts";
import type { Book } from "../workbook/records.ts";
import type { Report } from "../workbook/store.ts";
import { withNo } from "../acts/format.ts";

export const CLOSED_SHEET = "Закрытие по актам";

export interface SpecPosition {
  number: string; section: string; name: string; unit: string; quantity: number;
  closed: number; rest: number;
  byAct: { act: string; date: string | null; qty: number }[];
  materials: string[];
}

export type { Report };

const txt = (v: CellValue) => cellText(v).trim();
const num = (v: CellValue): number | null => { const p = parseNumberCell(v); return p.ok ? p.value : null; };
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Количество, которое идёт в учёт, по паре «акт|материал». */
function counted(book: Book): Map<string, number> {
  const vor = new Map<string, number>();
  for (const r of book.tables["ВОР"] ?? []) {
    const k = `${txt(r.v.act)}|${txt(r.v.material)}`;
    vor.set(k, (vor.get(k) ?? 0) + (num(r.v.quantity) ?? 0));
  }
  const out = new Map<string, number>();
  for (const r of book.tables["МатериалыАктов"] ?? []) {
    const k = `${txt(r.v.act)}|${txt(r.v.material)}`;
    const q = num(r.v.quantity) ?? vor.get(k) ?? 0;
    out.set(k, (out.get(k) ?? 0) + q);
  }
  return out;
}

export function specClosed(book: Book): SpecPosition[] {
  const spec = book.tables["Спецификация"] ?? [];
  if (!spec.length) return [];
  const matsOf = new Map<string, string[]>();
  for (const m of book.tables["Материалы"] ?? []) {
    const n = txt(m.v.rkc);
    if (n) matsOf.set(n, [...(matsOf.get(n) ?? []), txt(m.v.name)]);
  }
  const acts = (book.tables["Акты"] ?? []).map((a) => {
    const d = parseDateCell(a.v.date);
    return { act: txt(a.v.baseNumber), date: d.ok ? d.value : null };
  });
  const q = counted(book);
  return spec.map((r) => {
    const number = txt(r.v.number);
    const materials = matsOf.get(number) ?? [];
    const byAct = acts.map((a) => ({ ...a, qty: round(materials.reduce((s, m) => s + (q.get(`${a.act}|${m}`) ?? 0), 0)) }))
      .filter((a) => a.qty !== 0);
    const quantity = num(r.v.quantity) ?? 0;
    const closed = round(byAct.reduce((s, a) => s + a.qty, 0));
    return { number, section: txt(r.v.section), name: txt(r.v.name), unit: txt(r.v.unit), quantity, closed, rest: round(quantity - closed), byAct, materials };
  });
}

export function positionOfMaterial(book: Book, material: string): SpecPosition | null {
  const m = (book.tables["Материалы"] ?? []).find((r) => txt(r.v.name) === material.trim());
  const n = m ? txt(m.v.rkc) : "";
  return n ? specClosed(book).find((p) => p.number === n) ?? null : null;
}

/** Материалы акта без № п/п РКЦ или с номером, которого нет в спецификации. Пустая спецификация — проверки нет. */
export function unboundMaterials(book: Book, act: string): string[] {
  const spec = new Set((book.tables["Спецификация"] ?? []).map((r) => txt(r.v.number)));
  if (!spec.size) return [];
  const rkc = new Map((book.tables["Материалы"] ?? []).map((m) => [txt(m.v.name), txt(m.v.rkc)]));
  const names = (book.tables["МатериалыАктов"] ?? []).filter((r) => txt(r.v.act) === act.trim()).map((r) => txt(r.v.material)).filter(Boolean);
  return [...new Set(names)].filter((n) => !spec.has(rkc.get(n) ?? ""));
}

const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "");

export function closedReport(book: Book): Report {
  const acts = (book.tables["Акты"] ?? []).map((a) => {
    const d = parseDateCell(a.v.date);
    return { act: txt(a.v.baseNumber), date: d.ok ? d.value : null };
  });
  const head = ["№ п/п", "Наименование", "Ед. изм.", "По проекту", "Закрыто", "Остаток",
    ...acts.map((a) => `Акт ${withNo(String(a.act ?? ""))}${a.date ? ` от ${dmy(a.date)}` : ""}`)];
  const rows: CellValue[][] = [head];
  const bold = [0];
  const negative: [number, number][] = [];
  const blank = () => head.map(() => null as CellValue);
  let section: string | null = null;
  for (const p of specClosed(book)) {
    if (p.section && p.section !== section) {
      const r = blank();
      r[0] = p.section;
      bold.push(rows.length);
      rows.push(r);
    }
    section = p.section || section;
    const per = new Map(p.byAct.map((a) => [a.act, a.qty]));
    if (p.rest < 0) negative.push([rows.length, 5]);
    rows.push([p.number, p.name, p.unit || null, p.quantity, p.closed, p.rest, ...acts.map((a) => per.get(a.act) ?? null)]);
  }
  return { sheet: CLOSED_SHEET, rows, bold, negative, widths: [12, 60, 8, 12, 12, 12, ...acts.map(() => 16)], text: [0, 1, 2] };
}
