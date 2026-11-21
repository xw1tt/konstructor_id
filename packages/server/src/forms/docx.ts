// Подстановка меток {Группа.Поле} в .docx: тело документа и колонтитулы. Word режет текст на куски <w:r>/<w:t>,
// поэтому метки ищутся в склеенном тексте абзаца, а замена кладётся в первый кусок метки (с его форматированием).
// Повтор: строка таблицы с {#Список} … {/Список} размножается по элементам списка.
import type { FormData } from "@idk/shared/forms/fields";
import { openZip, writeZip, ZipError } from "../zip/zip.ts";

export class FormError extends Error {}

const LABEL = /\{([^{}]+)\}/g;
/**
 * Внешние элементы <w:tag …>…</w:tag> с учётом вложенности того же тега (таблица в ячейке, абзац надписи внутри абзаца)
 * и самозакрывающиеся <w:tag/>. Регулярное выражение «до первого </w:tag>» ломало такие документы.
 */
export function elements(xml: string, tag: string): { start: number; end: number }[] {
  const re = new RegExp(`<(/?)w:${tag}(?=[\\s>/])[^>]*?(/?)>`, "g");
  const out: { start: number; end: number }[] = [];
  let depth = 0,
    start = -1;
  for (const m of xml.matchAll(re)) {
    if (m[2] === "/") {
      if (depth === 0) out.push({ start: m.index!, end: m.index! + m[0].length });
      continue;
    }
    if (m[1] !== "/") {
      if (depth++ === 0) start = m.index!;
    } else if (--depth === 0) out.push({ start, end: m.index! + m[0].length });
  }
  return out;
}

/** Замена каждого внешнего элемента <w:tag> результатом fn. */
export function mapElements(xml: string, tag: string, fn: (el: string) => string): string {
  let res = "",
    last = 0;
  for (const { start, end } of elements(xml, tag)) {
    res += xml.slice(last, start) + fn(xml.slice(start, end));
    last = end;
  }
  return res + xml.slice(last);
}
const withoutTables = (xml: string) => mapElements(xml, "tbl", () => "");
const TEXT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t\s*\/>/g;
const PARTS = /^word\/(document|header\d*|footer\d*)\.xml$/;

export const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const xmlUnescape = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Текст абзаца (тексты всех <w:t>, <w:br/> → перевод строки). */
export function paragraphText(p: string): string {
  return [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>|<w:tab\s*\/>/g)]
    .map((m) => (m[0].startsWith("<w:br") ? "\n" : m[0].startsWith("<w:tab") ? "\t" : xmlUnescape(m[1] ?? "")))
    .join("");
}

/**
 * Замена участков склеенного текста абзаца. `edits` — непересекающиеся [начало, конец, новый текст] в координатах
 * склеенного текста <w:t>. Новый текст — в первый затронутый кусок; куски, ставшие пустыми, удаляются вместе с <w:r>.
 */
export function editParagraph(p: string, edits: [number, number, string][]): string {
  if (!edits.length) return p;
  const pieces = [...p.matchAll(TEXT)].map((m) => ({ at: m.index!, raw: m[0], text: xmlUnescape(m[1] ?? "") }));
  let off = 0;
  const spans = pieces.map((x) => {
    const s = { start: off, end: off + x.text.length };
    off = s.end;
    return s;
  });
  const out = pieces.map((x) => x.text);
  const touched = new Set<number>();
  for (const [a, b, rep] of [...edits].sort((x, y) => y[0] - x[0])) {
    const i = spans.findIndex((s) => (a >= s.start && a < s.end) || (a === s.end && a === b && s.start === s.end));
    const j = spans.findIndex((s) => b > s.start && b <= s.end);
    if (i < 0 || j < 0) continue;
    if (i === j) out[i] = out[i].slice(0, a - spans[i].start) + rep + out[i].slice(b - spans[i].start);
    else {
      out[i] = out[i].slice(0, a - spans[i].start) + rep;
      for (let k = i + 1; k < j; k++) {
        out[k] = "";
        touched.add(k);
      }
      out[j] = out[j].slice(b - spans[j].start);
      touched.add(j);
    }
  }
  let res = "";
  let last = 0;
  pieces.forEach((x, k) => {
    res += p.slice(last, x.at);
    const parts = out[k].split("\n").map((s) => `<w:t xml:space="preserve">${xmlEscape(s)}</w:t>`);
    res += out[k] === "" && touched.has(k) ? "<w:t/>" : parts.join("<w:br/>");
    last = x.at + x.raw.length;
  });
  res += p.slice(last);
  // Куски метки, ставшие пустыми: <w:r> только с <w:rPr> и пустым <w:t/> — удаляются.
  return res.replace(/<w:r\b[^>]*>(?:<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?<w:t\/><\/w:r>/g, "");
}

type Lookup = (label: string) => string;

function fillParagraphs(xml: string, lookup: Lookup): string {
  return mapElements(xml, "p", (p) => {
    const text = [...p.matchAll(TEXT)].map((m) => xmlUnescape(m[1] ?? "")).join("");
    const edits: [number, number, string][] = [];
    for (const m of text.matchAll(LABEL)) edits.push([m.index!, m.index! + m[0].length, lookup(m[1].trim())]);
    return editParagraph(p, edits);
  });
}

function makeLookup(data: FormData, warnings: Set<string>, item?: Record<string, string>): Lookup {
  return (label) => {
    if (label.startsWith("#") || label.startsWith("/")) return "";
    if (item && label in item) return item[label];
    if (label in data.values) return data.values[label];
    warnings.add(`Нет поля «${label}»`);
    return `[нет поля: ${label}]`;
  };
}

/** Таблица: сначала вложенные таблицы строк, затем повтор строк с {#Список}; таблица без строк удаляется
 *  (в ячейке после таблицы Word всегда держит абзац, так что ячейка не остаётся пустой).
 *  0.46.3: варианты строки — подряд строки {#Список:вариант}; для элемента берётся строка, вариант которой равен его полю
 *  «….Строка» (реестр материалов: серая строка документа без номера и строка материала с автономером). */
function fillTable(tbl: string, data: FormData, warnings: Set<string>, lines: Map<string, string[]> = new Map()): string {
  const spans = elements(tbl, "tr");
  if (!spans.length) return tbl;
  const rows = spans.map(({ start, end }) =>
    mapElements(tbl.slice(start, end), "tc", (cell) => mapElements(cell, "tbl", (inner) => fillTable(inner, data, warnings, lines))),
  );
  const marks = rows.map((row) => {
    const m = paragraphText(withoutTables(row)).match(/\{#([^{}:]+)(?::([^{}]+))?\}/);
    return m ? { name: m[1].trim(), variant: m[2]?.trim() ?? null } : null;
  });
  // Между строками Word держит закладки и прочее — сохраняются на своих местах (без них Word считает файл повреждённым).
  const gap = (i: number) => (i === 0 ? "" : tbl.slice(spans[i - 1].end, spans[i].start));
  let out = "";
  for (let i = 0; i < rows.length;) {
    const mark = marks[i];
    if (!mark) {
      out += gap(i) + (rowCopies(rows[i], data, warnings, lines) ?? rows[i]);
      i++;
      continue;
    }
    const group: { row: string; variant: string | null }[] = [];
    while (i < rows.length && marks[i]?.name === mark.name && (group.length === 0 || (marks[i]!.variant !== null && group[0].variant !== null))) {
      out += gap(i);
      group.push({ row: rows[i], variant: marks[i]!.variant });
      i++;
      if (group[0].variant === null) break;
    }
    const list = data.lists[mark.name];
    if (!list) warnings.add(`Нет списка «${mark.name}»`);
    for (const item of list ?? []) {
      const kind = Object.entries(item).find(([k]) => k.endsWith(".Строка"))?.[1];
      const tpl = group.find((g) => g.variant !== null && g.variant === kind) ?? group[0];
      out += fillParagraphs(tpl.row, makeLookup(data, warnings, item));
    }
  }
  if (!elements(out, "tr").length) return "";
  return tbl.slice(0, spans[0].start) + out + tbl.slice(spans[spans.length - 1].end);
}

/**
 * 0.46.5: значение по строкам бланка. В образцах (АОСР «Камчатки») длинное значение напечатано строками — каждая в своей
 * строке таблицы с подчёркиванием; метка {Поле@k:w} — k-я строка значения шириной около w знаков. Слова раскладываются
 * по строкам по порядку, перевод строки значения начинает новую строку бланка.
 * 0.46.6: не влезшее в строки бланка — в дополнительные строки шириной последней (бланк получает столько строк с
 * подчёркиванием, сколько нужно); результат — не короче числа строк бланка.
 */
export function wrapToRows(value: string, widths: number[]): string[] {
  const rows: string[] = widths.map(() => "");
  if (!widths.length) return rows;
  const width = (r: number) => widths[Math.min(r, widths.length - 1)];
  let r = 0;
  const put = (word: string) => {
    while (rows[r] && rows[r].length + 1 + word.length > width(r)) {
      r++;
      if (r >= rows.length) rows.push("");
    }
    rows[r] = rows[r] ? `${rows[r]} ${word}` : word;
  };
  value.split("\n").forEach((line, i) => {
    if (i > 0 && rows[r]) {
      r++;
      if (r >= rows.length) rows.push("");
    }
    for (const w of line.split(/\s+/).filter(Boolean)) put(w);
  });
  return rows;
}

const ROW_LABEL = /\{([^{}@]+)@(\d+):(\d+)\}/g;

/** Строки значений меток {Поле@k:w} части документа: у последней строки поля — и дополнительные. */
function rowLines(xml: string, data: FormData): Map<string, string[]> {
  const text = elements(xml, "p")
    .map(({ start, end }) => paragraphText(xml.slice(start, end)))
    .join("\n");
  const fields = new Map<string, { k: number; w: number; label: string }[]>();
  for (const m of text.matchAll(ROW_LABEL)) {
    const list = fields.get(m[1].trim()) ?? [];
    if (!list.some((x) => x.k === Number(m[2]))) list.push({ k: Number(m[2]), w: Number(m[3]), label: m[0].slice(1, -1) });
    fields.set(m[1].trim(), list);
  }
  const out = new Map<string, string[]>();
  for (const [field, list] of fields) {
    if (!(field in data.values)) continue;
    list.sort((a, b) => a.k - b.k);
    const rows = wrapToRows(
      data.values[field],
      list.map((x) => x.w),
    );
    list.forEach((x, i) => out.set(x.label, i === list.length - 1 ? rows.slice(i) : [rows[i]]));
  }
  return out;
}

/** Строка таблицы с метками строк значения: пустая (не первая строка значения) — убирается; у последней строки
 *  значения — копии строки бланка под дополнительные строки (каждая со своим подчёркиванием). */
function rowCopies(row: string, data: FormData, warnings: Set<string>, lines: Map<string, string[]>): string | null {
  const labels = [...paragraphText(withoutTables(row)).matchAll(ROW_LABEL)].map((m) => m[0].slice(1, -1)).filter((l) => lines.has(l));
  if (!labels.length) return null;
  const first = (l: string) => Number(l.match(/@(\d+):/)![1]) === 1;
  if (labels.every((l) => !first(l) && !lines.get(l)!.join(""))) return "";
  const extra = Math.max(...labels.map((l) => lines.get(l)!.length)) - 1;
  const base = makeLookup(data, warnings);
  let out = fillParagraphs(row, (label) => (lines.has(label) ? lines.get(label)![0] : base(label)));
  // Копии строки — только под продолжение значения: текст других ячеек (подпись поля слева, «7. Разрешается…») убирается.
  const blank = mapElements(row, "tc", (cell) =>
    labels.some((l) => paragraphText(withoutTables(cell)).includes(`{${l}}`)) ? cell : cell.replace(/(<w:t(?:\s[^>]*)?>)[^<]*(<\/w:t>)/g, "$1$2"),
  );
  for (let e = 1; e <= extra; e++) out += fillParagraphs(blank, (label) => (lines.has(label) ? (lines.get(label)![e] ?? "") : ""));
  return out;
}

function fillPart(xml: string, data0: FormData, warnings: Set<string>): string {
  const lines = rowLines(xml, data0);
  // Вне таблиц копировать нечего — дополнительные строки уходят в последнюю переводами строк.
  const data: FormData = { ...data0, values: { ...data0.values, ...Object.fromEntries([...lines].map(([l, v]) => [l, v.join("\n")])) } };
  const tables = mapElements(xml, "tbl", (tbl) => fillTable(tbl, data, warnings, lines));
  return fillParagraphs(tables, makeLookup(data, warnings));
}

function openDocx(buf: Uint8Array): Map<string, () => Buffer> {
  try {
    const files = openZip(buf);
    if (!files.has("word/document.xml")) throw new FormError("Это не файл Word (.docx)");
    return files;
  } catch (e) {
    if (e instanceof ZipError) throw new FormError("Это не файл Word (.docx)");
    throw e;
  }
}

export function fillDocx(buf: Uint8Array, data: FormData): { buf: Buffer; warnings: string[] } {
  const files = openDocx(buf);
  const warnings = new Set<string>();
  const out: [string, Buffer | string][] = [];
  for (const [name, get] of files) {
    if (PARTS.test(name)) out.push([name, fillPart(get().toString("utf8"), data, warnings)]);
    else out.push([name, get()]);
  }
  return { buf: writeZip(out), warnings: [...warnings] };
}

/** Текст документа по абзацам (через перевод строки). */
export function docxText(buf: Uint8Array): string {
  const xml = openDocx(buf).get("word/document.xml")!().toString("utf8");
  return elements(xml, "p")
    .map(({ start, end }) => paragraphText(xml.slice(start, end)))
    .join("\n");
}
