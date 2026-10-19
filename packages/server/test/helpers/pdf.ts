import { PDFDocument } from "pdf-lib";
export async function makePdf(pages: number, tag = ""): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage().drawText(`p${i} ${tag}`);
  return doc.save();
}

/** PNG 2×1 (шире высоты) — для альбомного листа и логотипов. */
export const PNG_WIDE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAJ/gH/YyfwPQAAAABJRU5ErkJggg==", "base64");
