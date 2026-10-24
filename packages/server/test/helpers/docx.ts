// Минимальный .docx для тестов: тело документа (содержимое <w:body>) и дополнительные части (колонтитулы).
import { writeZip } from "../../src/zip/zip.ts";

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

export function makeDocx(body: string, parts: Record<string, string> = {}): Buffer {
  return writeZip([
    ["[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ["word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}</w:body></w:document>`],
    ...Object.entries(parts).map(([k, v]) => [k, `<?xml version="1.0"?><w:hdr ${NS}>${v}</w:hdr>`] as [string, string]),
  ]);
}

export const p = (...runs: string[]) => `<w:p>${runs.join("")}</w:p>`;
export const r = (text: string, rPr = "") => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
export const tr = (...cells: string[]) => `<w:tr>${cells.map((c) => `<w:tc>${p(r(c))}</w:tc>`).join("")}</w:tr>`;
