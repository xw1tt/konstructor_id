// Таблица бланка по настройкам шаблона: только видимые графы, их заголовки и доли ширины — одинаково для PDF и Excel.
import type { BlankView } from "@idk/shared/blanks";
import { e } from "./templates/common.ts";
import type { CellStyle } from "../xlsx/book.ts";
import { gridSpans, type Layout, type TCell, type Col } from "../xlsx/layout.ts";

/** Ячейка: текст; rowspan — на несколько строк (следующие строки этой графы не задают); rest — до конца строки. */
export type BCell = string | number | { text: string | number; rowspan?: number; rest?: boolean };
export interface BodyRow {
  /** Значения по ключам граф (скрытые графы пропускаются). */
  cells?: Record<string, BCell>;
  /** Строка на всю ширину. */
  full?: string;
  /** Класс строки в HTML. */
  cls?: string;
  /** Стиль строки в Excel. */
  style?: CellStyle;
  /** Номер группы: строки одной группы не разрываются между страницами (HTML tbody). */
  group?: number;
}

const val = (c: BCell | undefined) => (c === undefined ? "" : typeof c === "object" ? c.text : c);

/** Ячейки строки по видимым графам: графы, занятые rowspan сверху, пропускаются; rest забирает остаток строки. */
function rowCells(view: BlankView, row: BodyRow, covered: Set<string>): { key: string; text: string | number; span: number; rowspan: number; align?: "l" | "c" }[] {
  const out: { key: string; text: string | number; span: number; rowspan: number; align?: "l" | "c" }[] = [];
  const cols = view.columns;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (covered.has(c.key)) { covered.delete(c.key); continue; }
    const cell = row.cells?.[c.key];
    if (cell && typeof cell === "object" && cell.rest) { out.push({ key: c.key, text: cell.text, span: cols.length - i, rowspan: 1, align: c.align }); break; }
    out.push({ key: c.key, text: val(cell), span: 1, rowspan: typeof cell === "object" && cell?.rowspan ? cell.rowspan : 1, align: c.align });
  }
  return out;
}

/** Шапка: графы с общим заголовком — две строки (общий заголовок над ними), остальные — на две строки. */
function headRows(view: BlankView): { header: string; span: number; rowspan: number }[][] {
  const cols = view.columns;
  if (!cols.some((c) => c.group)) return [cols.map((c) => ({ header: c.header, span: 1, rowspan: 1 }))];
  const top: { header: string; span: number; rowspan: number }[] = [];
  const bottom: { header: string; span: number; rowspan: number }[] = [];
  for (let i = 0; i < cols.length;) {
    const g = cols[i].group;
    if (!g) { top.push({ header: cols[i].header, span: 1, rowspan: 2 }); i++; continue; }
    let j = i;
    while (j < cols.length && cols[j].group === g) { bottom.push({ header: cols[j].header, span: 1, rowspan: 1 }); j++; }
    top.push({ header: g, span: j - i, rowspan: 1 });
    i = j;
  }
  return [top, bottom];
}

export function htmlBlankTable(view: BlankView, rows: BodyRow[], o: { cls?: string; nums?: boolean; style?: string } = {}): string {
  const cols = view.columns;
  const total = cols.reduce((s, c) => s + c.width, 0) || 1;
  const colgroup = cols.map((c) => `<col style="width:${((c.width * 100) / total).toFixed(2)}%">`).join("");
  const head = headRows(view).map((r) => `<tr>${r.map((h) => `<th${h.span > 1 ? ` colspan="${h.span}"` : ""}${h.rowspan > 1 ? ` rowspan="${h.rowspan}"` : ""}>${e(h.header)}</th>`).join("")}</tr>`).join("") +
    (o.nums ? `<tr class="nums">${cols.map((_, i) => `<td>${i + 1}</td>`).join("")}</tr>` : "");
  const covered = new Set<string>();
  const pending: Map<string, number> = new Map();
  const trs = rows.map((row) => {
    // rowspan сверху: в следующих строках ячейка этой графы не выводится.
    for (const [k, n] of pending) { if (n > 0) covered.add(k); pending.set(k, n - 1); if (n - 1 <= 0) pending.delete(k); }
    const cls = row.cls ? ` class="${row.cls}"` : "";
    if (row.full !== undefined) return `<tr${cls}><td colspan="${cols.length}">${e(row.full)}</td></tr>`;
    const cells = rowCells(view, row, covered);
    for (const c of cells) if (c.rowspan > 1) pending.set(c.key, c.rowspan - 1);
    return `<tr${cls}>${cells.map((c) => `<td class="${c.align === "l" ? "l" : "c"}"${c.span > 1 ? ` colspan="${c.span}"` : ""}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ""}>${e(c.text)}</td>`).join("")}</tr>`;
  });
  // Группы строк — в своих tbody (не разрываются между страницами).
  let body = "";
  if (rows.some((r) => r.group !== undefined)) {
    let cur: number | undefined, buf = "";
    rows.forEach((r, i) => {
      if (r.group !== cur && buf) { body += `<tbody class="grp">${buf}</tbody>`; buf = ""; }
      cur = r.group;
      buf += trs[i];
    });
    if (buf) body += `<tbody class="grp">${buf}</tbody>`;
  } else body = `<tbody>${trs.join("")}</tbody>`;
  return `<table class="grid${o.cls ? ` ${o.cls}` : ""}"${o.style ? ` style="${o.style}"` : ""}><colgroup>${colgroup}</colgroup><thead>${head}</thead>${body}</table>`;
}

/** Та же таблица на листе Excel: графы — по долям ширины на столбцы листа. */
export function xlsxBlankTable(L: Layout, view: BlankView, rows: BodyRow[], o: { nums?: boolean; size?: number; minRow?: number; headSize?: number } = {}) {
  const cols = view.columns;
  const spans = gridSpans(cols.map((c) => c.width), L.cols);
  const at = (i: number, n = 1) => spans.slice(i, i + n).reduce((a, b) => a + b, 0);
  const hr = headRows(view);
  let head: Col[][];
  if (hr.length === 1) head = [hr[0].map((h, i) => ({ header: h.header, span: at(i) }))];
  else {
    // Первая строка — графы подряд (общий заголовок — на свои графы); вторая — графы под общими заголовками.
    let i = 0;
    const under: number[] = [];
    const top = hr[0].map((h) => {
      const c: Col = { header: h.header, span: at(i, h.span), rowspan: h.rowspan };
      if (h.rowspan === 1) for (let k = 0; k < h.span; k++) under.push(i + k);
      i += h.span;
      return c;
    });
    head = [top, hr[1].map((h, k) => ({ header: h.header, span: at(under[k]) }))];
  }
  if (o.nums) head.push(cols.map((_, i) => ({ header: String(i + 1), span: at(i) })));
  const covered = new Set<string>();
  const pending = new Map<string, number>();
  const body: TCell[][] = rows.map((row) => {
    for (const [k, n] of pending) { if (n > 0) covered.add(k); pending.set(k, n - 1); if (n - 1 <= 0) pending.delete(k); }
    if (row.full !== undefined) return [{ text: row.full, span: L.cols, style: { h: "center", ...row.style } }];
    const cells = rowCells(view, row, covered);
    for (const c of cells) if (c.rowspan > 1) pending.set(c.key, c.rowspan - 1);
    return cells.map((c) => {
      const i = cols.findIndex((x) => x.key === c.key);
      return { text: c.text, span: at(i, c.span), rowspan: c.rowspan, style: { h: c.align === "l" ? "left" : "center", ...row.style } };
    });
  });
  L.table(head, body, { size: o.size, headSize: o.headSize, minRow: o.minRow });
}
