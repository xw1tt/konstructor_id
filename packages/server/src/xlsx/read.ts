// Чтение .xlsx без зависимостей: zip (центральный каталог + inflate) и разбор XML листов регулярными выражениями.
// Формулы не вычисляются — берётся сохранённое Excel значение <v>.
import { inflateRawSync } from "node:zlib";
import type { CellValue } from "@idk/shared/workbook/values";

export class XlsxError extends Error {}

export interface XlsxBook {
  sheets: string[];
  /** Значения листа: строки и столбцы с 0, пустые ячейки — null. */
  grid(sheet: string): CellValue[][];
}

/** Предел распакованного размера одной записи: защита от «zip-бомбы» на общем локальном сервере. */
export const MAX_ENTRY_BYTES = 200 * 1024 * 1024;
const BROKEN = "Повреждённый файл .xlsx";

/** Каталог zip: записи распаковываются по запросу (лист, общие строки), остальное содержимое книги не трогается. */
function unzip(buf: Buffer): Map<string, () => Buffer> {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new XlsxError("Это не файл .xlsx");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map<string, () => Buffer>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new XlsxError(BROKEN);
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    out.set(name, () => {
      try {
        if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error();
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const data = buf.subarray(start, start + size);
        if (method === 0) return Buffer.from(data);
        if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") throw new XlsxError("Лист РКЦ слишком большой");
      }
      throw new XlsxError(BROKEN);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const unescape = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");
const colIndex = (ref: string) => [...ref.replace(/\d+$/, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export function readXlsx(data: Uint8Array): XlsxBook {
  const files = unzip(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  const cache = new Map<string, string>();
  const text = (name: string) => {
    if (!cache.has(name)) { const get = files.get(name); if (!get) return undefined; cache.set(name, get().toString("utf8")); }
    return cache.get(name);
  };
  const wb = text("xl/workbook.xml");
  if (!wb) throw new XlsxError("В файле нет книги Excel (xl/workbook.xml)");
  const rels = new Map<string, string>();
  for (const m of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id"), target = attr(m[0], "Target");
    if (id && target) rels.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: unescape(attr(m[0], "name") ?? ""), path: rels.get(attr(m[0], "r:id") ?? "") ?? "",
  }));
  let sharedList: string[] | null = null;
  const shared = () => (sharedList ??= [...(text("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1])));

  return {
    sheets: sheets.map((s) => s.name),
    grid(name) {
      const s = sheets.find((x) => x.name === name);
      if (!s) throw new XlsxError(`Лист «${name}» не найден`);
      const xml = text(s.path);
      if (xml === undefined) throw new XlsxError(`Лист «${name}» не найден`);
      const out: CellValue[][] = [];
      for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const r = Number(attr(`<row${rm[1]}>`, "r") ?? out.length + 1) - 1;
        while (out.length <= r) out.push([]);
        const row = out[r];
        for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const head = `<c${cm[1]}>`, body = cm[2] ?? "";
          const ref = attr(head, "r"), t = attr(head, "t");
          const c = ref ? colIndex(ref) : row.length;
          const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
          let val: CellValue = null;
          if (t === "s") val = v !== undefined ? shared()[Number(v)] ?? null : null;
          else if (t === "inlineStr") val = texts(body);
          else if (t === "str") val = v !== undefined ? unescape(v) : null;
          else if (t === "b") val = v === "1";
          else if (t === "e") val = null;
          else if (v !== undefined && v !== "") val = Number(v);
          while (row.length < c) row.push(null);
          row[c] = val;
        }
      }
      return out;
    },
  };
}
