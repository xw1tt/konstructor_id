// Запасной путь печати своих форм без Office: .docx/.xlsx → простой HTML (абзацы, жирный/курсив/размер,
// выравнивание, таблицы с объединением ячеек и рамками) → Edge. Сложная вёрстка может отличаться от Word/Excel.
import { openZip } from "../zip/zip.ts";
import { readXlsx } from "../xlsx/read.ts";
import { xmlEscape, xmlUnescape } from "./docx.ts";

const PAGE = `<style>@page{size:A4;margin:20mm 15mm 20mm 25mm}body{font-family:"Times New Roman",serif;font-size:12pt;margin:0}
p{margin:0 0 4pt}table{border-collapse:collapse;width:100%;margin:4pt 0}td{border:1px solid #000;padding:2pt 4pt;vertical-align:top}</style>`;
const doc = (body: string) => `<!doctype html><html><head><meta charset="utf-8">${PAGE}</head><body>${body}</body></html>`;
const attr = (s: string, re: RegExp) => s.match(re)?.[1];

function runHtml(run: string): string {
  const pr = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
  const style: string[] = [];
  if (/<w:b(?:\s+w:val="(?:1|true)")?\s*\/>/.test(pr)) style.push("font-weight:bold");
  if (/<w:i(?:\s+w:val="(?:1|true)")?\s*\/>/.test(pr)) style.push("font-style:italic");
  if (/<w:u\s+w:val="(?!none)/.test(pr)) style.push("text-decoration:underline");
  const sz = attr(pr, /<w:sz\s+w:val="(\d+)"/);
  if (sz) style.push(`font-size:${Number(sz) / 2}pt`);
  const text = [...run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>|<w:tab\s*\/>/g)]
    .map((m) => (m[0].startsWith("<w:br") ? "<br>" : m[0].startsWith("<w:tab") ? "&emsp;" : xmlEscape(xmlUnescape(m[1] ?? "")))).join("");
  return style.length ? `<span style="${style.join(";")}">${text}</span>` : text;
}

function paraHtml(p: string): string {
  const jc = attr(p, /<w:jc\s+w:val="(\w+)"/);
  const align = jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : jc === "both" ? "justify" : "";
  const runs = [...p.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g)].map((m) => runHtml(m[0])).join("");
  return `<p${align ? ` style="text-align:${align}"` : ""}>${runs || "&nbsp;"}</p>`;
}

function tableHtml(tbl: string): string {
  const rows = [...tbl.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((m) =>
    [...m[0].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => ({
      span: Number(attr(c[1], /<w:gridSpan\s+w:val="(\d+)"/) ?? 1),
      vm: /<w:vMerge\s+w:val="restart"/.test(c[1]) ? "restart" : /<w:vMerge\s*\/>|<w:vMerge\s+w:val="continue"/.test(c[1]) ? "continue" : "",
      html: [...c[1].matchAll(/<w:p(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g)].map((x) => paraHtml(x[0])).join(""),
    })));
  // rowspan: ячейка «restart» поглощает «continue» ниже в той же колонке сетки.
  const colOf = (row: typeof rows[number], i: number) => row.slice(0, i).reduce((s, c) => s + c.span, 0);
  const out = rows.map((row, ri) => row.map((c, ci) => {
    if (c.vm === "continue") return "";
    let rs = 1;
    if (c.vm === "restart") {
      const col = colOf(row, ci);
      for (let k = ri + 1; k < rows.length; k++) {
        const below = rows[k].find((x, xi) => colOf(rows[k], xi) === col);
        if (below?.vm !== "continue") break;
        rs++;
      }
    }
    return `<td${c.span > 1 ? ` colspan="${c.span}"` : ""}${rs > 1 ? ` rowspan="${rs}"` : ""}>${c.html}</td>`;
  }).join(""));
  return `<table>${out.map((r) => `<tr>${r}</tr>`).join("")}</table>`;
}

export function docxToHtml(buf: Uint8Array): string {
  const xml = openZip(buf).get("word/document.xml")!().toString("utf8");
  const body = xml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? "";
  const parts = [...body.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g)]
    .map((m) => (m[0].startsWith("<w:tbl") ? tableHtml(m[0]) : paraHtml(m[0])));
  return doc(parts.join("\n"));
}

export function xlsxToHtml(buf: Uint8Array): string {
  const book = readXlsx(buf);
  const grid = book.sheets.length ? book.grid(book.sheets[0]) : [];
  const width = Math.max(0, ...grid.map((r) => r.length));
  const rows = grid.map((r) => `<tr>${Array.from({ length: width }, (_, i) => `<td>${xmlEscape(String(r[i] ?? ""))}</td>`).join("")}</tr>`);
  return doc(`<table>${rows.join("")}</table>`);
}
