// Подстановка меток {Группа.Поле} в .docx: тело документа и колонтитулы. Word режет текст на куски <w:r>/<w:t>,
// поэтому метки ищутся в склеенном тексте абзаца, а замена кладётся в первый кусок метки (с его форматированием).
// Повтор: строка таблицы с {#Список} … {/Список} размножается по элементам списка.
import type { FormData } from "@idk/shared/forms/fields";
import { openZip, writeZip, ZipError } from "../zip/zip.ts";

export class FormError extends Error {}

const LABEL = /\{([^{}]+)\}/g;
// Пустой абзац <w:p/> (и <w:tr/>) — самозакрывающийся: открывающий тег без «/» в конце.
const PARA = /<w:p(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
const ROW = /<w:tr(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:tr>/g;
const TEXT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t\s*\/>/g;
const PARTS = /^word\/(document|header\d*|footer\d*)\.xml$/;

export const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const xmlUnescape = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Текст абзаца (тексты всех <w:t>, <w:br/> → перевод строки). */
export function paragraphText(p: string): string {
  return [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>|<w:tab\s*\/>/g)]
    .map((m) => (m[0].startsWith("<w:br") ? "\n" : m[0].startsWith("<w:tab") ? "\t" : xmlUnescape(m[1] ?? ""))).join("");
}

/**
 * Замена участков склеенного текста абзаца. `edits` — непересекающиеся [начало, конец, новый текст] в координатах
 * склеенного текста <w:t>. Новый текст — в первый затронутый кусок; куски, ставшие пустыми, удаляются вместе с <w:r>.
 */
export function editParagraph(p: string, edits: [number, number, string][]): string {
  if (!edits.length) return p;
  const pieces = [...p.matchAll(TEXT)].map((m) => ({ at: m.index!, raw: m[0], text: xmlUnescape(m[1] ?? "") }));
  let off = 0;
  const spans = pieces.map((x) => { const s = { start: off, end: off + x.text.length }; off = s.end; return s; });
  const out = pieces.map((x) => x.text);
  const touched = new Set<number>();
  for (const [a, b, rep] of [...edits].sort((x, y) => y[0] - x[0])) {
    const i = spans.findIndex((s) => a >= s.start && a < s.end || (a === s.end && a === b && s.start === s.end));
    const j = spans.findIndex((s) => b > s.start && b <= s.end);
    if (i < 0 || j < 0) continue;
    if (i === j) out[i] = out[i].slice(0, a - spans[i].start) + rep + out[i].slice(b - spans[i].start);
    else {
      out[i] = out[i].slice(0, a - spans[i].start) + rep;
      for (let k = i + 1; k < j; k++) { out[k] = ""; touched.add(k); }
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
  return xml.replace(PARA, (p) => {
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

function fillPart(xml: string, data: FormData, warnings: Set<string>): string {
  const rows = xml.replace(ROW, (row) => {
    const name = paragraphText(row).match(/\{#([^{}]+)\}/)?.[1]?.trim();
    if (!name) return row;
    const list = data.lists[name];
    if (!list) warnings.add(`Нет списка «${name}»`);
    return (list ?? []).map((item) => fillParagraphs(row, makeLookup(data, warnings, item))).join("");
  });
  return fillParagraphs(rows, makeLookup(data, warnings));
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
  return [...xml.matchAll(PARA)].map((m) => paragraphText(m[0])).join("\n");
}
