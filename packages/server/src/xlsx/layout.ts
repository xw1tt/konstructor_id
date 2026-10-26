// План 26: элементы бланка на листе Excel — абзац, поле с линией и подписью-пояснением, строка «надпись + поле»,
// таблица с рамками, подписи. Excel не подбирает высоту объединённых ячеек — высота считается по оценке ширины текста.
import { CHARS, WIDTHS } from "./metrics.ts";
import { Sheet, DEFAULT_SIZE, type CellStyle, type HAlign, type PageSetup } from "./book.ts";

const PT_PER_MM = 72 / 25.4;
const INDEX = new Map([...CHARS].map((ch, i) => [ch, i]));
/** Запас к ширине: Excel на экране и при печати рисует текст чуть шире расчётного. */
export const SAFETY = 1.04;
/** Ширина текста, пт (полужирный и курсив — свои ширины знаков). */
export function textWidth(s: string, size = DEFAULT_SIZE, bold = false, italic = false): number {
  const w = WIDTHS[bold ? (italic ? "bi" : "b") : italic ? "i" : "r"];
  let sum = 0;
  for (const ch of s) {
    const i = INDEX.get(ch);
    sum += i === undefined ? 500 : w[i];
  }
  return (sum / 1000) * size * SAFETY;
}

/** Перенос по словам в ширину (пт); слово длиннее строки режется. Абзацы — по «\n». */
export function wrapLines(text: string, widthPt: number, size = DEFAULT_SIZE, bold = false, italic = false): string[] {
  const fits = (t: string) => textWidth(t, size, bold, italic) <= widthPt;
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/ +/)) {
      const cand = line ? `${line} ${word}` : word;
      if (fits(cand)) { line = cand; continue; }
      if (line) { out.push(line); line = ""; }
      if (fits(word)) { line = word; continue; }
      for (const ch of word) {
        if (!fits(line + ch) && line) { out.push(line); line = ""; }
        line += ch;
      }
    }
    out.push(line);
  }
  return out;
}

/** Высота строки текста кегля size, пт. */
export const lineHeight = (size = DEFAULT_SIZE) => Math.ceil(size * 1.25 * 4) / 4;

export interface Part {
  /** Столбцы листа (с 1), включительно. */
  c1: number; c2: number;
  text: string;
  style?: CellStyle;
  /** Значение на линии: полужирный курсив и нижняя линия. */
  under?: boolean;
  /** Подпись-пояснение под линией. */
  caption?: string;
}

export interface Col { header: string; span?: number; rowspan?: number }
export interface TCell { text: string | number; span?: number; rowspan?: number; style?: CellStyle }

/** Лист бланка с текущей строкой: элементы добавляются сверху вниз. */
export class Layout {
  readonly sheet: Sheet;
  /** Последняя занятая строка. */
  r = 0;
  constructor(name: string, colsMm: number[], page: PageSetup) {
    this.sheet = new Sheet(name, colsMm, page);
  }
  get cols() { return this.sheet.colsMm.length; }
  /** Ширина столбцов c1..c2, пт, без внутренних отступов ячейки. */
  widthPt(c1: number, c2: number) {
    return this.sheet.colsMm.slice(c1 - 1, c2).reduce((s, mm) => s + mm, 0) * PT_PER_MM - 4;
  }
  next() { return ++this.r; }

  /** Пустая строка высотой pt. */
  gap(pt: number) { this.sheet.height(this.next(), pt); }
  pageBreak() { this.sheet.breakAfter(this.r); }

  /** Абзац с переносом (одна объединённая строка нужной высоты). */
  para(text: string, s: CellStyle = {}, c1 = 1, c2 = this.cols) {
    const size = s.size ?? DEFAULT_SIZE;
    const n = Math.max(1, wrapLines(text, this.widthPt(c1, c2), size, s.b, s.i).length);
    const r = this.next();
    this.sheet.merge(r, c1, r, c2, text, { v: "top", wrap: true, ...s });
    this.sheet.height(r, n * lineHeight(size) + 1);
    return r;
  }

  /** Поле: каждая строка значения — своя строка листа с нижней линией; под ними подпись-пояснение. */
  field(value: string | string[], caption = "", o: { c1?: number; c2?: number; h?: HAlign; size?: number; b?: boolean; i?: boolean } = {}) {
    const c1 = o.c1 ?? 1, c2 = o.c2 ?? this.cols, size = o.size ?? DEFAULT_SIZE;
    const b = o.b ?? true, i = o.i ?? true;
    const lines = (Array.isArray(value) ? value : [value]).flatMap((v) => (v ? wrapLines(v, this.widthPt(c1, c2), size, b, i) : [""]));
    for (const line of lines) {
      const r = this.next();
      this.sheet.merge(r, c1, r, c2, line, { b, i, size, h: o.h ?? "left", shrink: true, border: { b: true } });
      this.sheet.height(r, lineHeight(size) + 0.5);
    }
    if (caption) this.caption(caption, c1, c2);
  }

  /** Мелкая подпись-пояснение по центру. */
  caption(text: string, c1 = 1, c2 = this.cols, size = 5) {
    const r = this.next();
    const n = wrapLines(text, this.widthPt(c1, c2), size).length;
    this.sheet.merge(r, c1, r, c2, text, { size, h: "center", v: "top", wrap: true });
    this.sheet.height(r, n * lineHeight(size) + 0.5);
  }

  /** Строка из частей: надписи и значения на линии; подписи-пояснения — строкой ниже. */
  line(parts: Part[], size = DEFAULT_SIZE) {
    const r = this.next();
    let lines = 1;
    for (const p of parts) {
      const st: CellStyle = p.under
        ? { b: true, i: true, size, h: "center", shrink: true, border: { b: true }, ...p.style }
        : { size, wrap: true, ...p.style };
      this.sheet.merge(r, p.c1, r, p.c2, p.text, { v: "bottom", ...st });
      if (!p.under) lines = Math.max(lines, wrapLines(p.text, this.widthPt(p.c1, p.c2), st.size ?? size, st.b, st.i).length);
    }
    this.sheet.height(r, lines * lineHeight(size) + 1);
    const caps = parts.filter((p) => p.caption);
    if (caps.length) {
      const rc = this.next();
      let n = 1;
      for (const p of caps) {
        this.sheet.merge(rc, p.c1, rc, p.c2, p.caption!, { size: 5, h: "center", v: "top", wrap: true });
        n = Math.max(n, wrapLines(p.caption!, this.widthPt(p.c1, p.c2), 5).length);
      }
      this.sheet.height(rc, n * lineHeight(5) + 0.5);
    }
    return r;
  }

  /**
   * Таблица по столбцам листа c1..: шапка (строки с объединениями span/rowspan), строки тела с теми же объединениями.
   * Шапка повторяется на каждой странице (titleRows), если repeat.
   */
  table(head: Col[][], body: TCell[][], o: { c1?: number; size?: number; headSize?: number; repeat?: boolean; minRow?: number } = {}) {
    const c1 = o.c1 ?? 1, size = o.size ?? DEFAULT_SIZE, headSize = o.headSize ?? size;
    const first = this.r + 1;
    const grid = (rows: TCell[][], base: CellStyle, sz: number, minRow: number) => {
      const start = this.r + 1;
      const taken = new Set<string>();
      const need = new Map<number, number>();
      rows.forEach((cells, ri) => {
        const r = start + ri;
        let c = c1;
        for (const cell of cells) {
          while (taken.has(`${r}:${c}`)) c++;
          const span = cell.span ?? 1, rs = cell.rowspan ?? 1;
          const st: CellStyle = { size: sz, wrap: true, v: "center", ...base, ...cell.style, border: { t: true, b: true, l: true, r: true } };
          this.sheet.merge(r, c, r + rs - 1, c + span - 1, cell.text, st);
          for (let i = 0; i < rs; i++) for (let j = 0; j < span; j++) taken.add(`${r + i}:${c + j}`);
          const n = String(cell.text) ? wrapLines(String(cell.text), this.widthPt(c, c + span - 1), st.size ?? sz, st.b, st.i).length : 1;
          const h = n * lineHeight(st.size ?? sz) + 2;
          // Высота ячейки на несколько строк делится между ними.
          for (let i = 0; i < rs; i++) need.set(r + i, Math.max(need.get(r + i) ?? 0, h / rs));
          c += span;
        }
      });
      rows.forEach((_, ri) => this.sheet.height(start + ri, Math.max(minRow, need.get(start + ri) ?? lineHeight(sz))));
      this.r = start + rows.length - 1;
    };
    grid(head.map((row) => row.map((h) => ({ text: h.header, span: h.span, rowspan: h.rowspan }))), { b: true, h: "center" }, headSize, 0);
    if (o.repeat !== false && head.length) this.sheet.titleRows = [first, this.r];
    grid(body, {}, size, o.minRow ?? 0);
  }

  /** Подписи: надпись роли, ФИО на линии во всю ширину, «(фамилия, инициалы, подпись)». */
  signs(blocks: { label: string; names: string[] }[], o: { labelBold?: boolean; nameBold?: boolean; gap?: number; capSize?: number; cap?: string } = {}) {
    for (const s of blocks) {
      this.gap(o.gap ?? 3);
      this.para(s.label, { b: o.labelBold });
      for (const n of s.names) {
        this.field(n, "", { b: o.nameBold ?? true, i: true });
        this.caption(o.cap ?? "(фамилия, инициалы, подпись)", 1, this.cols, o.capSize ?? 5);
      }
    }
  }
}

/** Сетка равных столбцов шириной mm на ширину листа. */
export const evenCols = (totalMm: number, n: number) => Array.from({ length: n }, () => totalMm / n);
/** Столбцы по долям (%) ширины. */
export const pctCols = (totalMm: number, pct: number[]) => {
  const sum = pct.reduce((s, p) => s + p, 0);
  return pct.map((p) => (totalMm * p) / sum);
};
/** Сколько столбцов сетки шириной colMm занимает текст. */
export const colsFor = (text: string, colMm: number, size = DEFAULT_SIZE, bold = false, italic = false) =>
  Math.ceil((textWidth(text, size, bold, italic) + 6) / (colMm * PT_PER_MM));

/** Доли (%) → целые числа столбцов сетки n (наибольшие остатки; каждой графе — не меньше одного). */
export function gridSpans(pct: number[], n: number): number[] {
  const sum = pct.reduce((s, p) => s + p, 0);
  const exact = pct.map((p) => (p * n) / sum);
  const out = exact.map((x) => Math.max(1, Math.floor(x)));
  let left = n - out.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  for (let k = order.length - 1; left < 0; k = (k - 1 + order.length) % order.length) if (out[order[k][1]] > 1) { out[order[k][1]]--; left++; }
  return out;
}
