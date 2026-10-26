// Разбор .xlsx, записанного xlsx/book.ts: тексты ячеек по строкам, объединения, разрывы, сквозные строки, параметры страницы.
import { openZip } from "../../src/zip/zip.ts";

export interface ReadSheet {
  name: string;
  /** Строка → столбец → текст. */
  cells: Map<number, Map<number, string>>;
  merges: string[];
  breaks: number[];
  xml: string;
  /** Все тексты листа подряд (строки через «\n», ячейки через « »). */
  text: string;
  /** Тексты строк. */
  rows: string[];
}
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const colNum = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

export function readXlsx(buf: Uint8Array): { sheets: ReadSheet[]; workbook: string; styles: string } {
  const z = openZip(buf);
  const workbook = z.get("xl/workbook.xml")!().toString("utf8");
  const names = [...workbook.matchAll(/<sheet name="([^"]*)"/g)].map((m) => unesc(m[1]));
  const sheets = names.map((name, i) => {
    const xml = z.get(`xl/worksheets/sheet${i + 1}.xml`)!().toString("utf8");
    const cells = new Map<number, Map<number, string>>();
    for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const t = m[3]?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? m[3]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (t === undefined) continue;
      const r = Number(m[2]);
      (cells.get(r) ?? cells.set(r, new Map()).get(r)!).set(colNum(m[1]), unesc(t));
    }
    const rows = [...cells.keys()].sort((a, b) => a - b).map((r) => [...cells.get(r)!.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v).join(" "));
    return {
      name, cells, xml, rows, text: rows.join("\n"),
      merges: [...xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map((m) => m[1]),
      breaks: [...xml.matchAll(/<brk id="(\d+)"/g)].map((m) => Number(m[1])),
    };
  });
  return { sheets, workbook, styles: z.get("xl/styles.xml")!().toString("utf8") };
}
