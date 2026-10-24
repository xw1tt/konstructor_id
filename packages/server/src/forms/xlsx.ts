// Подстановка меток {Группа.Поле} в .xlsx. Изменённые ячейки пишутся inline-строками (общие строки не трогаются);
// ячейка, целиком состоящая из одной метки с числовым значением, получает число. Повтор: строка листа с {#Список}
// размножается; строки ниже, объединения, размер листа и области печати сдвигаются. Формулы не пересчитываются.
import type { FormData } from "@idk/shared/forms/fields";
import { openZip, writeZip, ZipError } from "../zip/zip.ts";
import { FormError, xmlEscape, xmlUnescape } from "./docx.ts";

export const ROW = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
export const CELL = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const LABEL = /\{([^{}]+)\}/g;
/** Числом пишутся только количества и номера по порядку; ведущий ноль — признак текста («007», номер договора). */
const NUMERIC = /^-?(?:0|[1-9]\d*)(?:[.,]\d+)?$/;
const NUMERIC_FIELDS = new Set(["Материал.Кол-во", "Материал.№", "ВОР.Объём", "ВОР.№", "Схема.№", "Акт.Экз."]);

export const attr = (s: string, name: string) => s.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const setAttr = (s: string, name: string, v: string) =>
  new RegExp(`\\s${name}="`).test(s) ? s.replace(new RegExp(`\\s${name}="[^"]*"`), ` ${name}="${v}"`) : `${s} ${name}="${v}"`;
export const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlUnescape(m[1])).join("");

function openXlsx(buf: Uint8Array): Map<string, () => Buffer> {
  try {
    const files = openZip(buf);
    if (!files.has("xl/workbook.xml")) throw new FormError("Это не файл Excel (.xlsx)");
    return files;
  } catch (e) {
    if (e instanceof ZipError) throw new FormError("Это не файл Excel (.xlsx)");
    throw e;
  }
}

/** Перенумерация строк: старый номер (с 1) → новый, по списку повторов [строка, сколько строк вместо неё]. */
function rowMapper(repeats: [number, number][]) {
  return (row: number) => row + repeats.filter(([r]) => r < row).reduce((s, [, n]) => s + n - 1, 0);
}

/** Сдвиг номеров строк в ссылке вида A6, $A$6, A6:C6, 'Лист'!$A$1:$C$6. */
const shiftRefs = (ref: string, map: (r: number) => number) =>
  ref.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/g, (_, col, row) => `${col}${map(Number(row))}`);

interface Shift { map: (r: number) => number; end: (r: number) => number }

/**
 * Сдвиг ссылок формулы своего листа: ячейка → новая строка; у диапазона конец, попавший на строку-повтор, растягивается
 * на все её копии (SUM(B2:B2) → SUM(B2:B4)). Ссылки на другие листы (Лист!A1), имена функций (LOG10) не трогаются.
 */
function shiftFormula(f: string, s: Shift, here?: { from: number; to: number }): string {
  return f.replace(/(\$?[A-Z]{1,3}\$?)(\d+)(?::(\$?[A-Z]{1,3}\$?)(\d+))?/g, (m, c1: string, r1: string, c2: string | undefined, r2: string | undefined, at: number, all: string) => {
    const prev = all[at - 1] ?? "", next = all[at + m.length] ?? "";
    if (/[A-Za-zА-Яа-я0-9_.!'"]/.test(prev) || /[A-Za-z0-9_(]/.test(next)) return m;
    const one = (r: number, end = false) => (here && r === here.from ? here.to : end ? s.end(r) : s.map(r));
    return c2 ? `${c1}${one(Number(r1))}:${c2}${one(Number(r2), true)}` : `${c1}${one(Number(r1))}`;
  });
}

export function fillXlsx(buf: Uint8Array, data: FormData): { buf: Buffer; warnings: string[] } {
  const files = openXlsx(buf);
  const warnings = new Set<string>();
  const shared = [...(files.get("xl/sharedStrings.xml")?.().toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const lookup = (item?: Record<string, string>) => (label: string): string => {
    if (label.startsWith("#") || label.startsWith("/")) return "";
    if (item && label in item) return item[label];
    if (label in data.values) return data.values[label];
    warnings.add(`Нет поля «${label}»`);
    return `[нет поля: ${label}]`;
  };
  const cellText = (head: string, body: string) => {
    const t = attr(head, "t");
    if (t === "s") return shared[Number(body.match(/<v>([\s\S]*?)<\/v>/)?.[1])] ?? "";
    if (t === "inlineStr" || t === "str") return t === "str" ? xmlUnescape(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "") : texts(body);
    return null;
  };

  const sheetMaps = new Map<string, (r: number) => number>();
  const out: [string, Buffer | string][] = [];
  const sheetNames = [...files.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const filled = new Map<string, string>();
  const drawings = new Map<string, string>();
  for (const name of sheetNames) {
    const xml = files.get(name)!().toString("utf8");
    const rows = [...xml.matchAll(ROW)];
    const repeats: [number, number][] = [];
    const plan = rows.map((m) => {
      const r = Number(attr(m[1], "r"));
      const body = m[2] ?? "";
      const listName = [...body.matchAll(CELL)].map((c) => cellText(c[1], c[2] ?? "") ?? "").join("").match(/\{#([^{}]+)\}/)?.[1]?.trim();
      let items: (Record<string, string> | undefined)[] = [undefined];
      if (listName) {
        const list = data.lists[listName];
        if (!list) warnings.add(`Нет списка «${listName}»`);
        items = list ?? [];
        repeats.push([r, items.length]);
      }
      return { m, r, items };
    });
    const map = rowMapper(repeats);
    const shift: Shift = { map, end: (r) => map(r) + (repeats.find(([x]) => x === r)?.[1] ?? 1) - 1 };
    sheetMaps.set(name, map);
    const fixF = (cell: string, here?: { from: number; to: number }, copy = false) => cell
      .replace(/<f\b[^>]*\bt="shared"[^>]*\/>|<f\b[^>]*\bt="shared"[^>]*>[\s\S]*?<\/f>/g, (f) => (copy ? "" : f))
      .replace(/(<f\b[^>]*>)([\s\S]*?)(<\/f>)/g, (_, a: string, body: string, b: string) => a + xmlEscape(shiftFormula(xmlUnescape(body), shift, here)) + b);
    let res = "", last = 0;
    for (const { m, r, items } of plan) {
      res += xml.slice(last, m.index!);
      last = m.index! + m[0].length;
      const start = map(r);
      res += items.map((item, k) => {
        const nr = start + k;
        const head = setAttr(m[1], "r", String(nr));
        if (m[2] === undefined) return `<row${head}/>`;
        const cells = m[2].replace(CELL, (c, ch: string, cb: string | undefined) => {
          const ref = attr(ch, "r");
          let h = ref ? setAttr(ch, "r", ref.replace(/\d+$/, String(nr))) : ch;
          const text = cellText(ch, cb ?? "");
          if (text === null || !text.includes("{")) return cb === undefined ? `<c${h}/>` : fixF(`<c${h}>${cb}</c>`, items[0] === undefined ? undefined : { from: r, to: nr }, k > 0);
          const value = text.replace(LABEL, (_, l: string) => lookup(item)(l.trim()));
          const clean = value.replace(/\{[#/][^{}]*\}/g, "");
          h = h.replace(/\st="[^"]*"/, "");
          // Ячейка — ровно одна метка (маркеры повтора не в счёт) с числовым значением → число.
          const single = text.replace(/\{[#/][^{}]*\}/g, "").trim().match(/^\{([^{}]+)\}$/);
          if (single && NUMERIC_FIELDS.has(single[1].trim()) && NUMERIC.test(clean.trim())) return `<c${h}><v>${clean.trim().replace(",", ".")}</v></c>`;
          return `<c${h} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(clean)}</t></is></c>`;
        });
        return `<row${head}>${cells}</row>`;
      }).join("");
    }
    res += xml.slice(last);
    // Объединения: в строке-повторе — по одному на каждую копию (ни одного при пустом списке), остальные — сдвиг.
    res = res.replace(/<mergeCell ref="([^"]+)"\/>/g, (_, ref: string) => {
      const rows = [...ref.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
      const rep = repeats.find(([x]) => rows.every((y) => y === x));
      if (rep) return Array.from({ length: rep[1] }, (_x, i) => `<mergeCell ref="${ref.replace(/(\d+)/g, String(map(rep[0]) + i))}"/>`).join("");
      return `<mergeCell ref="${shiftRefs(ref, map)}"/>`;
    }).replace(/<dimension ref="([^"]+)"\/>/, (_, ref: string) => `<dimension ref="${shiftRefs(ref, map)}"/>`)
      // Проверка данных, условное форматирование, гиперссылки, разрывы страниц ниже повтора — тоже сдвигаются.
      .replace(/(<(?:dataValidation|conditionalFormatting|selection)\b[^>]*\ssqref=")([^"]+)"/g, (_, a: string, ref: string) => `${a}${shiftFormula(ref, shift)}"`)
      .replace(/(<hyperlink\b[^>]*\sref=")([^"]+)"/g, (_, a: string, ref: string) => `${a}${shiftRefs(ref, map)}"`)
      .replace(/(<brk\b[^>]*\sid=")(\d+)"/g, (_, a: string, n: string) => `${a}${map(Number(n) + 1) - 1}"`);
    res = res.replace(/<mergeCells count="\d+"/, `<mergeCells count="${(res.match(/<mergeCell ref=/g) ?? []).length}"`);
    filled.set(name, res);
    // Картинки листа (печати, подписи): якоря строк (с 0) ниже повтора сдвигаются.
    const rels = files.get(name.replace(/worksheets\/(sheet\d+\.xml)$/, "worksheets/_rels/$1.rels"))?.().toString("utf8") ?? "";
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const target = attr(m[0], "Target") ?? "";
      if (!/drawing/i.test(attr(m[0], "Type") ?? "")) continue;
      const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\.\//, "")}`;
      const dxml = files.get(path)?.().toString("utf8");
      if (dxml !== undefined) drawings.set(path, dxml.replace(/<xdr:row>(\d+)<\/xdr:row>/g, (_, n: string) => `<xdr:row>${map(Number(n) + 1) - 1}</xdr:row>`));
    }
  }
  // Области печати и прочие имена листа: по localSheetId (порядок листов в книге) сдвигаем номера строк.
  const wb = files.get("xl/workbook.xml")!().toString("utf8");
  const rels = files.get("xl/_rels/workbook.xml.rels")?.().toString("utf8") ?? "";
  const sheetPaths = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const id = attr(m[0], "r:id");
    const target = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((x) => x[0]).find((x) => attr(x, "Id") === id);
    const t = target ? attr(target, "Target") ?? "" : "";
    return t.startsWith("/") ? t.slice(1) : `xl/${t}`;
  });
  const wbOut = wb.replace(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g, (whole, head: string, body: string) => {
    const idx = attr(head, "localSheetId");
    const map = idx !== undefined ? sheetMaps.get(sheetPaths[Number(idx)]) : undefined;
    return map ? `<definedName${head}>${shiftRefs(body, map)}</definedName>` : whole;
  });
  for (const [name, get] of files) {
    if (filled.has(name)) out.push([name, filled.get(name)!]);
    else if (drawings.has(name)) out.push([name, drawings.get(name)!]);
    else if (name === "xl/workbook.xml") out.push([name, wbOut]);
    else if (name === "xl/calcChain.xml") continue; // цепочка вычислений устарела после сдвига — Excel построит заново
    else if (name === "xl/_rels/workbook.xml.rels") out.push([name, get().toString("utf8").replace(/<Relationship\b[^>]*calcChain[^>]*\/>/g, "")]);
    else if (name === "[Content_Types].xml") out.push([name, get().toString("utf8").replace(/<Override\b[^>]*calcChain[^>]*\/>/g, "")]);
    else out.push([name, get()]);
  }
  return { buf: writeZip(out), warnings: [...warnings] };
}
