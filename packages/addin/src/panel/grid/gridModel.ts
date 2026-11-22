// 0.47: таблица в окне программы (как в Excel) — чистая логика: текст ячеек, диапазон выделения, вставка блока из
// буфера (TSV из Excel), «заполнить вниз», очистка. Запись в книгу — в TableGrid.tsx.
import type { ColumnDef, TableName } from "@idk/shared/workbook/schema";
import type { CellValue } from "@idk/shared/workbook/values";
import { fromCell, toCellFor } from "../card/editValue.ts";

export interface Pos {
  r: number;
  c: number;
}
export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export const rangeOf = (a: Pos, b: Pos): Range => ({ r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) });
export const inRange = (g: Range, r: number, c: number) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;

/** Можно ли править столбец в таблице (формулы и сканы — нет: скан прикрепляется в карточке). */
export const editable = (col: ColumnDef) => col.type !== "formula" && col.type !== "file";

/** Текст ячейки для таблицы: дата — «ДД.ММ.ГГГГ», число — с запятой. */
export const cellShown = (col: ColumnDef, v: CellValue | undefined) => fromCell(col, v ?? null);

/**
 * Разбор буфера обмена: строки — переводы строк, ячейки — табуляция; ячейка в кавычках (Excel так копирует текст
 * с переводом строки или кавычками) — целиком, «""» внутри — одна кавычка. Последний пустой перевод строки отбрасывается.
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let quoted = false;
  const s = text.replace(/\r\n?/g, "\n");
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        quoted = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === "") {
      quoted = true;
      i++;
      continue;
    }
    if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
    i++;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Диапазон в буфер: TSV, ячейки с табуляцией, переводом строки или кавычкой — в кавычках (как копирует Excel). */
export function toTsv(cells: string[][]): string {
  const q = (s: string) => (/[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return cells.map((r) => r.map(q).join("\t")).join("\n");
}

export interface CellEdit {
  /** Индекс строки в списке таблицы (не строки Excel); за концом списка — новая строка. */
  r: number;
  c: number;
  text: string;
}

/**
 * Вставка блока с ячейки at: правки по ячейкам. Один скопированный текст на выделенный диапазон — во все его ячейки
 * (как в Excel). Столбцы за правым краем и нередактируемые — пропускаются.
 */
export function pasteEdits(block: string[][], at: Pos, cols: ColumnDef[], sel?: Range): CellEdit[] {
  const out: CellEdit[] = [];
  const single = block.length === 1 && block[0].length === 1;
  if (single && sel && (sel.r2 > sel.r1 || sel.c2 > sel.c1)) {
    for (let r = sel.r1; r <= sel.r2; r++) for (let c = sel.c1; c <= sel.c2; c++) if (editable(cols[c])) out.push({ r, c, text: block[0][0] });
    return out;
  }
  block.forEach((line, i) =>
    line.forEach((text, j) => {
      const c = at.c + j;
      if (c < cols.length && editable(cols[c])) out.push({ r: at.r + i, c, text });
    }),
  );
  return out;
}

/** «Заполнить вниз» (Ctrl+D): верхняя строка диапазона — в остальные; одна строка — значение строки выше. */
export function fillDownEdits(g: Range, text: (r: number, c: number) => string, cols: ColumnDef[]): CellEdit[] {
  const out: CellEdit[] = [];
  const from = g.r1 === g.r2 ? g.r1 - 1 : g.r1;
  if (from < 0) return out;
  for (let c = g.c1; c <= g.c2; c++) {
    if (!editable(cols[c])) continue;
    for (let r = from + 1; r <= g.r2; r++) out.push({ r, c, text: text(from, c) });
  }
  return out;
}

/** Правки по строкам: значения для записи (по заголовкам столбцов) и ошибки разбора («31.02», «абв» в числе). */
export function rowWrites(
  table: TableName,
  edits: CellEdit[],
  cols: ColumnDef[],
): { byRow: Map<number, Record<string, CellValue>>; errors: { r: number; c: number; message: string }[] } {
  const byRow = new Map<number, Record<string, CellValue>>();
  const errors: { r: number; c: number; message: string }[] = [];
  for (const e of edits) {
    const col = cols[e.c];
    const p = toCellFor(table, col, e.text);
    if (!p.ok) {
      errors.push({ r: e.r, c: e.c, message: `${col.header}: ${p.message}` });
      continue;
    }
    const row = byRow.get(e.r) ?? {};
    row[col.header] = p.value;
    byRow.set(e.r, row);
  }
  return { byRow, errors };
}
