import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Текст каждой страницы PDF. */
export async function pdfPages(buf: Uint8Array): Promise<string[]> {
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out.push(c.items.map((it: any) => it.str).join(" ").replace(/\s+/g, " "));
  }
  return out;
}
