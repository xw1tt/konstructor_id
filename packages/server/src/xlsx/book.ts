// План 26: запись книги Excel (.xlsx) из модели листа — без зависимостей, архив — zip/zip.ts.
// Лист: столбцы в мм, ячейки со стилем, объединения, высоты строк, разрывы страниц, параметры печати.
import { writeZip } from "../zip/zip.ts";

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "center" | "bottom";
export interface CellStyle {
  b?: boolean; i?: boolean; u?: boolean;
  /** Размер шрифта, пт (по умолчанию 10). */
  size?: number;
  h?: HAlign; v?: VAlign;
  wrap?: boolean;
  /** Уменьшать шрифт, если текст не помещается (строки значений, разбитые заранее). */
  shrink?: boolean;
  /** Рамки: верх, низ, лево, право (true — тонкая или borderStyle, «medium» — толстая). */
  border?: { t?: Side; b?: Side; l?: Side; r?: Side };
  /** Толщина рамок (по умолчанию тонкая). */
  borderStyle?: "thin" | "medium";
  /** Заливка, RGB «D9D9D9». */
  fill?: string;
  /** Шрифт (по умолчанию Times New Roman). */
  font?: string;
  /** Поворот текста, градусы (90 — снизу вверх). */
  rotate?: number;
}
export type Side = boolean | "medium";
export const FONT = "Times New Roman";
export const DEFAULT_SIZE = 10;

interface Cell { v: string | number; s: CellStyle }
export interface PageSetup {
  landscape?: boolean;
  /** Поля, мм: верх, право, низ, лево. */
  margins: [number, number, number, number];
  /** Номер страницы справа внизу. */
  pageNumbers?: boolean;
}

export class Sheet {
  readonly cells = new Map<string, Cell>();
  readonly merges: [number, number, number, number][] = [];
  readonly heights = new Map<number, number>();
  readonly breaks: number[] = [];
  /** Сквозные строки (шапка таблицы на каждой странице). */
  titleRows: [number, number] | null = null;
  maxRow = 0;

  constructor(readonly name: string, readonly colsMm: number[], readonly page: PageSetup) {}

  set(r: number, c: number, v: string | number, s: CellStyle = {}) {
    this.cells.set(`${r}:${c}`, { v, s });
    if (r > this.maxRow) this.maxRow = r;
  }
  get(r: number, c: number): Cell | undefined { return this.cells.get(`${r}:${c}`); }
  /** Объединение со значением и стилем: стиль (рамки) — у каждой ячейки области, как требует Excel. */
  merge(r1: number, c1: number, r2: number, c2: number, v: string | number, s: CellStyle = {}) {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) this.set(r, c, r === r1 && c === c1 ? v : "", s);
    if (r1 !== r2 || c1 !== c2) this.merges.push([r1, c1, r2, c2]);
  }
  /** Толстая рамка вокруг области (у краевых ячеек). */
  outline(r1: number, c1: number, r2: number, c2: number) {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      if (r !== r1 && r !== r2 && c !== c1 && c !== c2) continue;
      const cell = this.get(r, c) ?? { v: "", s: {} };
      const b = { ...cell.s.border };
      if (r === r1) b.t = "medium";
      if (r === r2) b.b = "medium";
      if (c === c1) b.l = "medium";
      if (c === c2) b.r = "medium";
      this.set(r, c, cell.v, { ...cell.s, border: b });
    }
  }
  /** Высота строки, пт (Excel допускает не больше 409). */
  height(r: number, pt: number) { this.heights.set(r, Math.min(409, Math.round(pt * 4) / 4)); if (r > this.maxRow) this.maxRow = r; }
  /** Разрыв страницы после строки r. */
  breakAfter(r: number) { if (r > 0 && !this.breaks.includes(r)) this.breaks.push(r); }
}

export const colName = (c: number): string => {
  let s = "";
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
export const ref = (r: number, c: number) => `${colName(c)}${r}`;

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  // Управляющие символы XML 1.0 не допускает.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** Ширина столбца Excel (в знаках шрифта «Обычный» Calibri 11, 7 пикселей на цифру) по ширине в мм. */
export const colWidth = (mm: number) => Math.round(((mm / 25.4) * 96 / 7) * 256) / 256;

class Styles {
  fonts: string[] = [`<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>`];
  fills: string[] = [`<fill><patternFill patternType="none"/></fill>`, `<fill><patternFill patternType="gray125"/></fill>`];
  borders: string[] = [`<border><left/><right/><top/><bottom/><diagonal/></border>`];
  xfs: string[] = [`<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`];
  private idx(list: string[], item: string) {
    const i = list.indexOf(item);
    if (i >= 0) return i;
    list.push(item);
    return list.length - 1;
  }
  id(s: CellStyle): number {
    const font = this.idx(this.fonts, `<font>${s.b ? "<b/>" : ""}${s.i ? "<i/>" : ""}${s.u ? `<u/>` : ""}<sz val="${s.size ?? DEFAULT_SIZE}"/><name val="${s.font ?? FONT}"/><family val="${s.font && s.font !== FONT ? 2 : 1}"/><charset val="204"/></font>`);
    const fill = s.fill ? this.idx(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const bs = s.borderStyle ?? "thin";
    const side = (on: Side | undefined, n: string) => (on ? `<${n} style="${on === "medium" ? "medium" : bs}"><color indexed="64"/></${n}>` : `<${n}/>`);
    const b = s.border ?? {};
    const border = this.idx(this.borders, `<border>${side(b.l, "left")}${side(b.r, "right")}${side(b.t, "top")}${side(b.b, "bottom")}<diagonal/></border>`);
    const al = `<alignment horizontal="${s.h ?? "left"}" vertical="${s.v ?? "bottom"}"${s.rotate ? ` textRotation="${s.rotate}"` : ""}${s.wrap ? ` wrapText="1"` : ""}${s.shrink ? ` shrinkToFit="1"` : ""}/>`;
    return this.idx(this.xfs, `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${al}</xf>`);
  }
  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join("")}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

const inch = (mm: number) => (mm / 25.4).toFixed(3);

function sheetXml(sh: Sheet, styles: Styles): string {
  const rows: string[] = [];
  const byRow = new Map<number, [number, Cell][]>();
  for (const [k, cell] of sh.cells) {
    const [r, c] = k.split(":").map(Number);
    (byRow.get(r) ?? byRow.set(r, []).get(r)!).push([c, cell]);
  }
  for (let r = 1; r <= sh.maxRow; r++) {
    const cells = (byRow.get(r) ?? []).sort((a, b) => a[0] - b[0]);
    const ht = sh.heights.get(r);
    if (!cells.length && ht === undefined) continue;
    const cs = cells.map(([c, { v, s }]) => {
      const st = styles.id(s);
      if (typeof v === "number") return `<c r="${ref(r, c)}" s="${st}"><v>${v}</v></c>`;
      if (v === "") return `<c r="${ref(r, c)}" s="${st}"/>`;
      return `<c r="${ref(r, c)}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    }).join("");
    rows.push(`<row r="${r}"${ht !== undefined ? ` ht="${ht}" customHeight="1"` : ""}>${cs}</row>`);
  }
  const [mt, mr, mb, ml] = sh.page.margins;
  const lastCol = sh.colsMm.length;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="A1:${ref(Math.max(sh.maxRow, 1), lastCol)}"/>` +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="13"/>` +
    `<cols>${sh.colsMm.map((mm, i) => `<col min="${i + 1}" max="${i + 1}" width="${colWidth(mm)}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${rows.join("")}</sheetData>` +
    (sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(([r1, c1, r2, c2]) => `<mergeCell ref="${ref(r1, c1)}:${ref(r2, c2)}"/>`).join("")}</mergeCells>` : "") +
    `<pageMargins left="${inch(ml)}" right="${inch(mr)}" top="${inch(mt)}" bottom="${inch(mb)}" header="${inch(Math.min(5, mt / 2))}" footer="${inch(Math.min(5, mb / 2))}"/>` +
    `<pageSetup paperSize="9" orientation="${sh.page.landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>` +
    (sh.page.pageNumbers ? `<headerFooter><oddFooter>&amp;R&amp;P</oddFooter></headerFooter>` : "") +
    (sh.breaks.length ? `<rowBreaks count="${sh.breaks.length}" manualBreakCount="${sh.breaks.length}">${[...sh.breaks].sort((a, b) => a - b).map((r) => `<brk id="${r}" max="16383" man="1"/>`).join("")}</rowBreaks>` : "") +
    `</worksheet>`;
}

/** Имя листа Excel: до 31 знака, без []:*?/\. */
export const sheetName = (s: string) => (s.replace(/[[\]:*?/\\]/g, "_").trim() || "Лист1").slice(0, 31);

/** Книга .xlsx из листов. */
export function writeBook(sheets: Sheet[]): Buffer {
  const styles = new Styles();
  const names = sheets.map((s, i) => {
    const base = sheetName(s.name);
    return sheets.slice(0, i).some((o) => sheetName(o.name) === base) ? `${base.slice(0, 28)} ${i + 1}` : base;
  });
  const sheetFiles = sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s, styles)] as [string, string]);
  const titles = sheets.map((s, i) => (s.titleRows
    ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${names[i].replace(/'/g, "''")}'!$${s.titleRows[0]}:$${s.titleRows[1]}</definedName>` : "")).join("");
  return writeZip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${x(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${titles ? `<definedNames>${titles}</definedNames>` : ""}</workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ...sheetFiles,
    // Стили собираются при записи листов — поэтому последними.
    ["xl/styles.xml", styles.xml()],
  ]);
}
