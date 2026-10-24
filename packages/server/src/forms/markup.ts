// Разметка своей формы по заполненному образцу: значения акта из книги в тексте документа заменяются метками.
// Строка таблицы с материалом (схемой) акта становится строкой-повтором, строки остальных удаляются; ячейка может
// содержать наименование вместе с маркой, порядок строк в образце — любой.
// Значение, совпавшее у нескольких полей, ставится временной меткой {Поле#N} — выбор делает пользователь (applyChoices).
import type { FormData } from "@idk/shared/forms/fields";
import { openZip, writeZip } from "../zip/zip.ts";
import { editParagraph, paragraphText, xmlEscape, FormError, elements, mapElements } from "./docx.ts";
import { ROW as XROW, CELL as XCELL, attr as xattr, texts as xtexts } from "./xlsx.ts";

export interface MarkupPlace { id: number; text: string; context: string; options: string[]; chosen: string }
export interface MarkupResult { buf: Buffer; found: number; ambiguous: MarkupPlace[] }

/** Порядок выбора по умолчанию для совпадающих значений; остальные — в порядке словаря. */
const PRIORITY = ["Акт.Номер АОСР", "Акт.Номер", "Акт.Дата", "Акт.Окончание", "Акт.Начало"];
/** Списки со строкой-повтором: поле, по которому строка узнаётся, и можно ли ему стоять в ячейке вместе с другим текстом
 *  (наименование материала — да; номер схемы — нет: он бывает частью номера акта). */
const LISTS: [string, string, boolean][] = [["Материалы", "Материал.Наименование", true], ["Схемы", "Схема.Номер", false]];
const RE_ESC = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const searchable = (v: string) => { const t = v.trim(); return !t.includes("\n") && (/\d/.test(t) ? t.length >= 3 : t.length >= 5); };

/** Значение → поля с этим значением (по приоритету), от длинных значений к коротким. */
function candidates(data: FormData): [string, string[]][] {
  const by = new Map<string, string[]>();
  for (const [k, v] of Object.entries(data.values)) {
    if (!searchable(v)) continue;
    const t = v.trim();
    by.set(t, [...(by.get(t) ?? []), k]);
  }
  const rank = (k: string) => (PRIORITY.includes(k) ? PRIORITY.indexOf(k) : PRIORITY.length);
  return [...by.entries()].map(([v, keys]): [string, string[]] => {
    const ks = keys.length > 1 ? keys.filter((k) => k !== "Акт.Номер документа") : keys;
    return [v, [...ks].sort((a, b) => rank(a) - rank(b))];
  }).sort((a, b) => b[0].length - a[0].length);
}

class Marker {
  found = 0;
  places: MarkupPlace[] = [];
  constructor(private cands: [string, string[]][]) {}

  /** Правки текста: найденные значения → метки; уже стоящие метки {…} не трогаются. */
  edits(text: string): [number, number, string][] {
    const taken: [number, number][] = [...text.matchAll(/\{[^{}]*\}/g)].map((m) => [m.index!, m.index! + m[0].length]);
    const out: [number, number, string][] = [];
    const free = (a: number, b: number) => !taken.some(([x, y]) => a < y && b > x);
    for (const [value, keys] of this.cands) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${RE_ESC(value)}(?![\\p{L}\\p{N}])`, "gu");
      for (const m of text.matchAll(re)) {
        const a = m.index!, b = a + value.length;
        if (!free(a, b)) continue;
        taken.push([a, b]);
        this.found++;
        if (keys.length === 1) { out.push([a, b, `{${keys[0]}}`]); continue; }
        const id = this.places.length + 1;
        this.places.push({ id, text: value, context: text.slice(Math.max(0, a - 30), Math.min(text.length, b + 30)), options: keys, chosen: keys[0] });
        out.push([a, b, `{${keys[0]}#${id}}`]);
      }
    }
    return out;
  }
}

/** Правки ячейки строки-повтора: значения полей элемента → метки элемента. `score` — совпадения полей со столбцом по всем
 *  строкам образца (columnScores): если значение совпало у нескольких полей, ставится поле с большим числом совпадений. */
function itemEdits(text: string, item: Record<string, string>, score: Record<string, number> = {}): [number, number, string][] {
  const t = text.trim();
  const sc = (k: string) => score[k] ?? 0;
  const num = Object.keys(item).find((k) => k.endsWith(".№"));
  if (num && sc(num) > 0 && Object.keys(score).every((k) => sc(k) <= sc(num)) && /^\d+$/.test(t)) { const a = text.indexOf(t); return [[a, a + t.length, `{${num}}`]]; }
  const fields = Object.entries(item).filter(([, v]) => v.trim()).sort((a, b) => b[1].trim().length - a[1].trim().length || sc(b[0]) - sc(a[0]));
  const exact = fields.find(([, v]) => v.trim() === t);
  if (exact) { const a = text.indexOf(t); return [[a, a + t.length, `{${exact[0]}}`]]; }
  const out: [number, number, string][] = [];
  const taken: [number, number][] = [];
  for (const [k, v] of fields) {
    if (v.trim().length < 3) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${RE_ESC(v.trim())}(?![\\p{L}\\p{N}])`, "gu");
    for (const m of text.matchAll(re)) {
      const a = m.index!, b = a + m[0].length;
      if (taken.some(([x, y]) => a < y && b > x)) continue;
      taken.push([a, b]);
      out.push([a, b, `{${k}}`]);
    }
  }
  return out;
}

const wholeWord = (v: string) => new RegExp(`(?<![\\p{L}\\p{N}])${RE_ESC(v)}(?![\\p{L}\\p{N}])`, "u");

/** Элемент списка, к которому относится строка таблицы: ячейка равна его наименованию или содержит наименование ровно
 *  одного элемента (наименование с маркой, артикулом и т.п. в одной ячейке). Ячейка-перечисление нескольких — не строка. */
function rowItem(cells: (string | null)[], names: string[], partial: boolean): number {
  for (const c of cells) {
    const i = c === null ? -1 : names.indexOf(c.trim());
    if (i >= 0 && names[i]) return i;
  }
  if (!partial) return -1;
  for (const c of cells) {
    if (!c) continue;
    const hit = [...new Set(names.filter((n) => n.length >= 5 && wholeWord(n).test(c)))];
    const own = hit.filter((n) => !hit.some((o) => o !== n && o.includes(n)));
    if (own.length === 1) return names.indexOf(own[0]);
  }
  return -1;
}

/** Строки таблицы с элементами списка: первая строка, относящаяся к любому элементу (порядок в образце может
 *  отличаться от акта), и идущие сразу за ней строки других элементов. */
function findBlock(cells: (string | null)[][], names: string[], partial: boolean): { start: number; end: number; items: number[] } | null {
  const start = cells.findIndex((cs) => rowItem(cs, names, partial) >= 0);
  if (start < 0) return null;
  const items: number[] = [];
  let end = start;
  for (let i; end < cells.length && (i = rowItem(cells[end], names, partial)) >= 0; end++) items.push(i);
  return { start, end, items };
}

/** Совпадения полей с каждым столбцом по всем строкам образца: ячейка равна значению — 2, содержит его — 1. Номер п/п
 *  сверяется с позицией строки (1, 2, 3…), а не с номером элемента в акте. По одному элементу марка и артикул могут
 *  совпадать, по всем строкам — нет. */
function columnScores(block: (string | null)[][], items: Record<string, string>[]): Record<string, number>[] {
  return block[0].map((_, c) => {
    const score: Record<string, number> = {};
    for (const k of Object.keys(items[0])) {
      score[k] = block.reduce((n, cells, r) => {
        const t = cells[c]?.trim(), v = k.endsWith(".№") ? String(r + 1) : items[r][k]?.trim();
        if (!t || !v) return n;
        return n + (t === v ? 2 : !k.endsWith(".№") && v.length >= 3 && wholeWord(v).test(t) ? 1 : 0);
      }, 0);
    }
    return score;
  });
}

/** Текст ячейки без вложенных таблиц. */
const cellTextOf = (cell: string) => {
  const flat = mapElements(cell, "tbl", () => "");
  return elements(flat, "p").map(({ start, end }) => paragraphText(flat.slice(start, end))).join("\n").trim();
};

/** Строка-повтор: ячейки первого элемента → метки; {#Список} в начало первого непустого абзаца, {/Список} в конец
 *  последнего (одной правкой, если это один абзац). */
function repeatRow(row: string, list: string, item: Record<string, string>, scores: Record<string, number>[]): string {
  let col = 0;
  let out = mapElements(row, "tc", (cell) => {
    const score = scores[col++];
    return mapElements(cell, "p", (p) => editParagraph(p, itemEdits(paragraphText(p), item, score)));
  });
  const paras = elements(out, "p").filter(({ start, end }) => paragraphText(out.slice(start, end)).length);
  if (!paras.length) return out;
  const first = paras[0], last = paras[paras.length - 1];
  const put = (el: { start: number; end: number }, edits: [number, number, string][]) => {
    out = out.slice(0, el.start) + editParagraph(out.slice(el.start, el.end), edits) + out.slice(el.end);
  };
  const lt = paragraphText(out.slice(last.start, last.end));
  const endEdit: [number, number, string] = [lt.length - 1, lt.length, lt.slice(-1) + `{/${list}}`];
  if (first.start === last.start) {
    const ft = lt;
    put(first, ft.length === 1 ? [[0, 1, `{#${list}}${ft}{/${list}}`]] : [[0, 1, `{#${list}}` + ft[0]], endEdit]);
    return out;
  }
  put(last, [endEdit]); // сначала последний: смещения первого не меняются
  const ft = paragraphText(out.slice(first.start, first.end));
  put(first, [[0, 1, `{#${list}}` + ft[0]]]);
  return out;
}

/** Таблица: строка, относящаяся к элементу списка (rowItem), — повтор; идущие сразу за ней строки других элементов
 *  удаляются. Вложенные таблицы — рекурсивно. */
function markupTable(tbl: string, data: FormData, mk: Marker): string {
  tbl = mapElements(tbl, "tr", (row) => mapElements(row, "tc", (cell) => mapElements(cell, "tbl", (inner) => markupTable(inner, data, mk))));
  for (const [list, key, partial] of LISTS) {
    const items = data.lists[list] ?? [];
    const names = items.map((i) => i[key]?.trim() ?? "");
    if (!names.some(Boolean)) continue;
    const rows = elements(tbl, "tr");
    const cells = rows.map(({ start, end }) => elements(tbl.slice(start, end), "tc").map((c) => cellTextOf(tbl.slice(start, end).slice(c.start, c.end))));
    const block = findBlock(cells, names, partial);
    if (!block) continue;
    mk.found++;
    const its = block.items.map((i) => items[i]);
    const scores = columnScores(cells.slice(block.start, block.end), its);
    const row = tbl.slice(rows[block.start].start, rows[block.start].end);
    tbl = tbl.slice(0, rows[block.start].start) + repeatRow(row, list, its[0], scores) + tbl.slice(block.end < rows.length ? rows[block.end].start : rows[rows.length - 1].end);
  }
  return tbl;
}

function markupDocxPart(xml: string, data: FormData, mk: Marker): string {
  const tables = mapElements(xml, "tbl", (tbl) => markupTable(tbl, data, mk));
  return mapElements(tables, "p", (p) => editParagraph(p, mk.edits(paragraphText(p))));
}

function markupXlsx(buf: Uint8Array, data: FormData, mk: Marker): Buffer {
  const files = openZip(buf);
  const shared = [...(files.get("xl/sharedStrings.xml")?.().toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xtexts(m[1]));
  const cellText = (head: string, body: string) => {
    const t = xattr(head, "t");
    if (t === "s") return shared[Number(body.match(/<v>([\s\S]*?)<\/v>/)?.[1])] ?? "";
    if (t === "inlineStr") return xtexts(body);
    const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
    return v !== undefined && t !== "e" && t !== "b" && !/<f\b/.test(body) ? v : null;
  };
  const setText = (head: string, text: string) => `<c${head.replace(/\st="[^"]*"/, "")} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
  const apply = (text: string, edits: [number, number, string][]) =>
    [...edits].sort((a, b) => b[0] - a[0]).reduce((s, [a, b, rep]) => s.slice(0, a) + rep + s.slice(b), text);
  const out: [string, Buffer | string][] = [];
  for (const [name, get] of files) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) { out.push([name, get()]); continue; }
    let xml = get().toString("utf8");
    const deleted: number[] = [];
    for (const [list, key, partial] of LISTS) {
      const items = data.lists[list] ?? [];
      const names = items.map((i) => i[key]?.trim() ?? "");
      if (!names.some(Boolean)) continue;
      // Строки листа (номер и ячейки по столбцам); ячейки строк выравниваются по столбцам первой строки элементов.
      const col = (head: string) => xattr(head, "r")?.replace(/\d+/g, "") ?? "";
      const sheetRows = [...xml.matchAll(XROW)].filter((m) => m[2] !== undefined).map((m) => ({
        rnum: Number(xattr(m[1], "r")),
        cells: [...m[2]!.matchAll(XCELL)].map((c) => ({ col: col(c[1]), text: cellText(c[1], c[2] ?? "") })),
      }));
      const block = findBlock(sheetRows.map((r) => r.cells.map((c) => c.text)), names, partial);
      if (!block) continue;
      const tplRow = sheetRows[block.start];
      const its = block.items.map((i) => items[i]);
      const aligned = sheetRows.slice(block.start, block.end).map((r) => tplRow.cells.map((t) => r.cells.find((c) => c.col === t.col)?.text ?? null));
      const scores = columnScores(aligned, its);
      const drop = new Set(sheetRows.slice(block.start + 1, block.end).map((r) => r.rnum));
      xml = xml.replace(XROW, (row, rh: string, rb: string | undefined) => {
        if (rb === undefined) return row;
        const rnum = Number(xattr(rh, "r"));
        if (drop.has(rnum)) { deleted.push(rnum); return ""; }
        if (rnum !== tplRow.rnum) return row;
        mk.found++;
        const cells = [...rb.matchAll(XCELL)].map((c) => ({ raw: c[0], head: c[1], text: cellText(c[1], c[2] ?? "") }));
        const filled = cells.map((c) => {
          if (c.text === null || !c.text.trim()) return { ...c, label: null as string | null };
          const score = scores[tplRow.cells.findIndex((t) => t.col === col(c.head))];
          return { ...c, label: apply(c.text, itemEdits(c.text, its[0], score)) };
        });
        const idx = filled.map((c, i) => (c.label ? i : -1)).filter((i) => i >= 0);
        if (idx.length) {
          filled[idx[0]].label = `{#${list}}${filled[idx[0]].label}`;
          filled[idx.at(-1)!].label = `${filled[idx.at(-1)!].label}{/${list}}`;
        }
        return `<row${rh}>${filled.map((c) => (c.label ? setText(c.head, c.label) : c.raw)).join("")}</row>`;
      });
    }
    if (deleted.length) {
      // Строки ниже удалённых поднимаются: номера строк, адреса ячеек, объединения, размер листа.
      const map = (r: number) => r - deleted.filter((d) => d < r).length;
      xml = xml.replace(/<row\b([^>]*?)\sr="(\d+)"/g, (_, pre: string, r: string) => `<row${pre} r="${map(Number(r))}"`)
        .replace(/(<c\b[^>]*?\sr="[A-Z]+)(\d+)"/g, (_, pre: string, r: string) => `${pre}${map(Number(r))}"`)
        // объединения целиком в удалённых строках убираются, остальные сдвигаются
        .replace(/<mergeCell ref="([^"]+)"\/>/g, (whole, ref: string) =>
          [...ref.matchAll(/(\d+)/g)].every((x) => deleted.includes(Number(x[1]))) ? "" : whole)
        .replace(/<(mergeCell|dimension) ref="([^"]+)"\/>/g, (_, tag: string, ref: string) =>
          `<${tag} ref="${ref.replace(/([A-Z]+)(\d+)/g, (__, c: string, r: string) => `${c}${map(Number(r))}`)}"/>`);
      xml = xml.replace(/<mergeCells count="\d+"/, `<mergeCells count="${(xml.match(/<mergeCell ref=/g) ?? []).length}"`);
    }
    xml = xml.replace(XCELL, (c, head: string, body: string | undefined) => {
      const text = cellText(head, body ?? "");
      if (text === null || !text.trim()) return c;
      const e = mk.edits(text);
      return e.length ? setText(head, apply(text, e)) : c;
    });
    out.push([name, xml]);
  }
  return writeZip(out);
}

export function markupForm(buf: Uint8Array, type: "docx" | "xlsx", data: FormData): MarkupResult {
  const mk = new Marker(candidates(data));
  if (type === "xlsx") return { buf: markupXlsx(buf, data, mk), found: mk.found, ambiguous: mk.places };
  const files = openZip(buf);
  if (!files.has("word/document.xml")) throw new FormError("Это не файл Word (.docx)");
  const out: [string, Buffer | string][] = [...files].map(([name, get]) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/.test(name) ? [name, markupDocxPart(get().toString("utf8"), data, mk)] : [name, get()]);
  return { buf: writeZip(out), found: mk.found, ambiguous: mk.places };
}

/** Временные метки {Поле#N} → выбранные пользователем (по умолчанию — первое по приоритету). */
export function applyChoices(buf: Uint8Array, type: "docx" | "xlsx", choices: Record<number, string>): Buffer {
  const files = openZip(buf);
  const re = /\{([^{}#]+)#(\d+)\}/g;
  const fix = (s: string) => s.replace(re, (_, k: string, id: string) => `{${choices[Number(id)] ?? k}}`);
  const parts = type === "docx" ? /^word\/(document|header\d*|footer\d*)\.xml$/ : /^xl\/(worksheets\/sheet\d+|sharedStrings)\.xml$/;
  return writeZip([...files].map(([name, get]) => (parts.test(name) ? [name, fix(get().toString("utf8"))] : [name, get()])));
}
