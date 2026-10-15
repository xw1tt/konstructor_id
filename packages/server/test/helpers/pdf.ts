import { PDFDocument } from "pdf-lib";
export async function makePdf(pages: number, tag = ""): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage().drawText(`p${i} ${tag}`);
  return doc.save();
}
