// Разметка своей формы по заполненному образцу: значения акта из книги в тексте документа заменяются метками.
// Строка таблицы с первым материалом (схемой) становится строкой-повтором, строки остальных удаляются.
// Значение, совпавшее у нескольких полей, ставится временной меткой {Поле#N} — выбор делает пользователь (applyChoices).
import type { FormData } from "@idk/shared/forms/fields";
import { openZip, writeZip } from "../zip/zip.ts";
import { editParagraph, paragraphText, xmlEscape, FormError } from "./docx.ts";
import { ROW as XROW, CELL as XCELL, attr as xattr, texts as xtexts } from "./xlsx.ts";

export interface MarkupPlace { id: number; text: string; context: string; options: string[]; chosen: string }
export interface MarkupResult { buf: Buffer; found: number; ambiguous: MarkupPlace[] }

/** Порядок выбора по умолчанию для совпадающих значений; остальные — в порядке словаря. */
const PRIORITY = ["Акт.Номер АОСР", "Акт.Номер", "Акт.Дата", "Акт.Окончание", "Акт.Начало"];
const LISTS: [string, string][] = [["Материалы", "Материал.Наименование"], ["Схемы", "Схема.Номер"]];
const PARA = /<w:p(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
const TROW = /<w:tr(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:tr>/g;
const TCELL = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
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

/** Правки ячейки строки-повтора: значения полей первого элемента → метки элемента. */
function itemEdits(text: string, item: Record<string, string>): [number, number, string][] {
  const t = text.trim();
  const fields = Object.entries(item).filter(([, v]) => v.trim()).sort((a, b) => b[1].length - a[1].length);
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

const textOf = (xml: string) => [...xml.matchAll(PARA)].map((m) => paragraphText(m[0])).join("\n");

function markupDocxPart(xml: string, data: FormData, mk: Marker): string {
  for (const [list, key] of LISTS) {
    const items = data.lists[list] ?? [];
    const names = items.map((i) => i[key]?.trim()).filter(Boolean);
    if (!names.length) continue;
    let done = false;
    xml = xml.replace(TROW, (row) => {
      const t = textOf(row);
      const has = (n: string) => new RegExp(`(?<![\\p{L}\\p{N}])${RE_ESC(n)}(?![\\p{L}\\p{N}])`, "u").test(t);
      if (!done && has(names[0])) {
        done = true;
        mk.found++;
        let cells = row.replace(TCELL, (cell) => cell.replace(PARA, (p) => editParagraph(p, itemEdits(paragraphText(p), items[0]))));
        const paras = [...cells.matchAll(PARA)].filter((m) => paragraphText(m[0]).length);
        if (paras.length) {
          const first = paras[0], last = paras[paras.length - 1];
          const lt = paragraphText(last[0]);
          const lastNew = editParagraph(last[0], [[lt.length - 1, lt.length, lt.slice(-1) + `{/${list}}`]]);
          cells = cells.slice(0, last.index!) + lastNew + cells.slice(last.index! + last[0].length);
          const ft = paragraphText(first[0]);
          const firstNew = editParagraph(first[0], [[0, 1, `{#${list}}` + ft[0]]]);
          cells = cells.slice(0, first.index!) + firstNew + cells.slice(first.index! + first[0].length);
        }
        return cells;
      }
      return done && names.slice(1).some(has) ? "" : row;
    });
  }
  return xml.replace(PARA, (p) => editParagraph(p, mk.edits(paragraphText(p))));
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
    for (const [list, key] of LISTS) {
      const items = data.lists[list] ?? [];
      const names = items.map((i) => i[key]?.trim()).filter(Boolean);
      if (!names.length) continue;
      let done = false;
      xml = xml.replace(XROW, (row, rh: string, rb: string | undefined) => {
        if (rb === undefined) return row;
        const rnum = Number(xattr(rh, "r"));
        const cells = [...rb.matchAll(XCELL)].map((c) => ({ raw: c[0], head: c[1], text: cellText(c[1], c[2] ?? "") }));
        const has = (n: string) => cells.some((c) => c.text !== null && c.text.trim() === n);
        if (!done && has(names[0])) {
          done = true;
          mk.found++;
          const filled = cells.map((c) => (c.text === null || !c.text.trim() ? { ...c, label: null } : { ...c, label: apply(c.text, itemEdits(c.text, items[0])) }));
          const idx = filled.map((c, i) => (c.label ? i : -1)).filter((i) => i >= 0);
          if (idx.length) {
            filled[idx[0]].label = `{#${list}}${filled[idx[0]].label}`;
            filled[idx.at(-1)!].label = `${filled[idx.at(-1)!].label}{/${list}}`;
          }
          return `<row${rh}>${filled.map((c) => (c.label ? setText(c.head, c.label) : c.raw)).join("")}</row>`;
        }
        if (done && names.slice(1).some(has)) { deleted.push(rnum); return ""; }
        return row;
      });
    }
    if (deleted.length) {
      // Строки ниже удалённых поднимаются: номера строк, адреса ячеек, объединения, размер листа.
      const map = (r: number) => r - deleted.filter((d) => d < r).length;
      xml = xml.replace(/<row\b([^>]*?)\sr="(\d+)"/g, (_, pre: string, r: string) => `<row${pre} r="${map(Number(r))}"`)
        .replace(/(<c\b[^>]*?\sr="[A-Z]+)(\d+)"/g, (_, pre: string, r: string) => `${pre}${map(Number(r))}"`)
        .replace(/<(mergeCell|dimension) ref="([^"]+)"\/>/g, (_, tag: string, ref: string) =>
          `<${tag} ref="${ref.replace(/([A-Z]+)(\d+)/g, (__, c: string, r: string) => `${c}${map(Number(r))}`)}"/>`);
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
