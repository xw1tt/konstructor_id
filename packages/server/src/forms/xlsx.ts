// Подстановка меток {Группа.Поле} в .xlsx. Изменённые ячейки пишутся inline-строками (общие строки не трогаются);
// ячейка, целиком состоящая из одной метки с числовым значением, получает число. Повтор: строка листа с {#Список}
// размножается; строки ниже, объединения, размер листа и области печати сдвигаются. Формулы не пересчитываются.
import type { FormData } from "@idk/shared/forms/fields";
import { openZip, writeZip, ZipError } from "../zip/zip.ts";
import { FormError, xmlEscape, xmlUnescape } from "./docx.ts";

const ROW = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELL = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const LABEL = /\{([^{}]+)\}/g;
const NUMERIC = /^-?\d+(?:[.,]\d+)?$/;

const attr = (s: string, name: string) => s.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const setAttr = (s: string, name: string, v: string) =>
  new RegExp(`\\s${name}="`).test(s) ? s.replace(new RegExp(`\\s${name}="[^"]*"`), ` ${name}="${v}"`) : `${s} ${name}="${v}"`;
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlUnescape(m[1])).join("");

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
    sheetMaps.set(name, map);
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
          if (text === null || !text.includes("{")) return cb === undefined ? `<c${h}/>` : `<c${h}>${cb}</c>`;
          const value = text.replace(LABEL, (_, l: string) => lookup(item)(l.trim()));
          const clean = value.replace(/\{[#/][^{}]*\}/g, "");
          h = h.replace(/\st="[^"]*"/, "");
          // Ячейка — ровно одна метка (маркеры повтора не в счёт) с числовым значением → число.
          const single = text.replace(/\{[#/][^{}]*\}/g, "").trim().match(/^\{([^{}]+)\}$/);
          if (single && NUMERIC.test(clean.trim())) return `<c${h}><v>${clean.trim().replace(",", ".")}</v></c>`;
          return `<c${h} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(clean)}</t></is></c>`;
        });
        return `<row${head}>${cells}</row>`;
      }).join("");
    }
    res += xml.slice(last);
    res = res.replace(/<mergeCell ref="([^"]+)"\/>/g, (_, ref: string) => `<mergeCell ref="${shiftRefs(ref, map)}"/>`)
      .replace(/<dimension ref="([^"]+)"\/>/, (_, ref: string) => `<dimension ref="${shiftRefs(ref, map)}"/>`);
    filled.set(name, res);
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
    else if (name === "xl/workbook.xml") out.push([name, wbOut]);
    else if (name === "xl/calcChain.xml") continue; // цепочка вычислений устарела после сдвига — Excel построит заново
    else if (name === "xl/_rels/workbook.xml.rels") out.push([name, get().toString("utf8").replace(/<Relationship\b[^>]*calcChain[^>]*\/>/g, "")]);
    else if (name === "[Content_Types].xml") out.push([name, get().toString("utf8").replace(/<Override\b[^>]*calcChain[^>]*\/>/g, "")]);
    else out.push([name, get()]);
  }
  return { buf: writeZip(out), warnings: [...warnings] };
}
