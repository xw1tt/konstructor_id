// Минимальный .xlsx для тестов: zip (deflate) с книгой, общими строками и листами.
import { writeZip } from "../../src/zip/zip.ts";
import type { CellValue } from "@idk/shared/workbook/values";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i: number) => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

const zip = (files: Record<string, string>): Uint8Array => new Uint8Array(writeZip(Object.entries(files)));

/** Книга .xlsx: строки листов → ячейки; строки — общие (по умолчанию) или inline (`shared: false`). */
export function makeXlsx(sheets: Record<string, CellValue[][]>, opts: { shared?: boolean } = {}): Uint8Array {
  const shared = opts.shared ?? true, strings: string[] = [];
  const names = Object.keys(sheets);
  const files: Record<string, string> = {
    "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
      names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
      names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
  };
  names.forEach((n, si) => {
    const rows = sheets[n].map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
      const ref = `${colName(c)}${r + 1}`;
      if (v === null || v === "") return "";
      if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
      if (typeof v === "boolean") return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
      if (!shared) return `<c r="${ref}" t="inlineStr"><is><t>${esc(String(v))}</t></is></c>`;
      strings.push(String(v));
      return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`;
    }).join("")}</row>`).join("");
    files[`xl/worksheets/sheet${si + 1}.xml`] = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  files["xl/sharedStrings.xml"] = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${
    strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`;
  return zip(files);
}
