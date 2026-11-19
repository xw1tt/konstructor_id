// 0.39: книга объекта из сохранённого файла .xlsx — без Excel. Таблицы программы (умные таблицы Excel по именам),
// гиперссылки столбцов «файл» и настройки надстройки (idk.*) из части веб-расширения. Только чтение.
import { posix } from "node:path";
import { TABLE_NAMES, TABLES, type TableName } from "@idk/shared/workbook/schema";
import type { TableData } from "@idk/shared/workbook/store";
import { attr, readXlsx, unescape, XlsxError } from "./read.ts";

export interface BookFile {
  sheets: string[];
  tables: Partial<Record<TableName, TableData>>;
  settings: Record<string, string>;
}

const OURS = new Set<string>(TABLE_NAMES);
const cell = (ref: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.replace(/\$/g, ""));
  if (!m) return null;
  return { col: [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1, row: Number(m[2]) - 1 };
};
const relsOf = (path: string) => posix.join(posix.dirname(path), "_rels", posix.basename(path) + ".rels");
const resolve = (from: string, target: string) => (target.startsWith("/") ? target.slice(1) : posix.normalize(posix.join(posix.dirname(from), target)));

function rels(xml: string | undefined): Map<string, { target: string; external: boolean }> {
  const out = new Map<string, { target: string; external: boolean }>();
  for (const m of (xml ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id"),
      target = attr(m[0], "Target");
    if (id && target) out.set(id, { target: unescape(target), external: attr(m[0], "TargetMode") === "External" });
  }
  return out;
}

export function readBookFile(data: Uint8Array): BookFile {
  const x = readXlsx(data);
  const tables: Partial<Record<TableName, TableData>> = {};
  for (const sheet of x.sheets) {
    const path = x.sheetPath(sheet);
    const xml = path ? x.part(path) : undefined;
    if (!path || !xml) continue;
    const r = rels(x.part(relsOf(path)));
    const parts = [...xml.matchAll(/<tablePart\b[^>]*>/g)].map((m) => r.get(attr(m[0], "r:id") ?? ""));
    if (!parts.some((p) => p)) continue;
    // Гиперссылки листа: ячейка → адрес.
    const links = new Map<string, string>();
    for (const m of xml.matchAll(/<hyperlink\b[^>]*>/g)) {
      const ref = attr(m[0], "ref");
      const target = r.get(attr(m[0], "r:id") ?? "")?.target ?? unescape(attr(m[0], "location") ?? "");
      if (ref && target) links.set(ref.split(":")[0], target);
    }
    const grid = x.grid(sheet);
    for (const p of parts) {
      if (!p) continue;
      const t = x.part(resolve(path, p.target));
      if (!t) continue;
      const head = t.match(/<table\b[^>]*>/)?.[0] ?? "";
      const name = unescape(attr(head, "displayName") ?? attr(head, "name") ?? "");
      if (!OURS.has(name)) continue;
      const [a, b] = (attr(head, "ref") ?? "").split(":");
      const from = cell(a ?? ""),
        to = cell(b ?? a ?? "");
      if (!from || !to) continue;
      const headerRows = Number(attr(head, "headerRowCount") ?? 1);
      const totals = Number(attr(head, "totalsRowCount") ?? 0);
      // Excel кодирует перевод строки и другие служебные символы имён столбцов как _xHHHH_.
      const headers = [...t.matchAll(/<tableColumn\b[^>]*>/g)].map((m) =>
        unescape(attr(m[0], "name") ?? "").replace(/_x([0-9a-f]{4})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16))),
      );
      const rows = [];
      const lk = [];
      for (let ri = from.row + headerRows; ri <= to.row - totals; ri++) {
        const src = grid[ri] ?? [];
        const row = [];
        const lrow = [];
        for (let ci = from.col; ci <= to.col; ci++) {
          const v = src[ci];
          row.push(v === "" || v === undefined ? null : v);
          lrow.push(links.get(colRef(ci) + (ri + 1)) ?? null);
        }
        rows.push(row);
        lk.push(lrow);
      }
      const fileCols = new Set(TABLES[name as TableName].columns.filter((c) => c.type === "file").map((c) => headers.indexOf(c.header)));
      tables[name as TableName] = { name: name as TableName, headers, rows, links: lk.map((l) => l.map((v, i) => (fileCols.has(i) ? v : null))) };
    }
  }
  if (!Object.keys(tables).length) throw new XlsxError("В файле нет таблиц «Конструктора ИД» — это не книга объекта");
  return { sheets: x.sheets, tables, settings: addinSettings(x.part.bind(x)) };
}

const colRef = (c: number): string => {
  let s = "";
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Настройки надстройки (Office.context.document.settings) — свойства веб-расширения; значения хранятся как JSON. */
function addinSettings(part: (p: string) => string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 1; i <= 20; i++) {
    const xml = part(`xl/webextensions/webextension${i}.xml`);
    if (xml === undefined) {
      if (i > 1) break;
      continue;
    }
    for (const m of xml.matchAll(/<we:property\b[^>]*>/g)) {
      const name = unescape(attr(m[0], "name") ?? "");
      const raw = unescape(attr(m[0], "value") ?? "");
      if (!name.startsWith("idk.")) continue;
      try {
        const v = JSON.parse(raw);
        out[name] = typeof v === "string" ? v : JSON.stringify(v);
      } catch {
        out[name] = raw;
      }
    }
  }
  return out;
}
