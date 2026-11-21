// Сканы комплекта: где лежит файл (прикреплён к серверу, в папке сканов, полный путь) и его страницы.
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import type { FileRef } from "@idk/shared/kit/request";
import type { Db } from "../db.ts";
import { locateScan, scanFolders, type ScanMime } from "../files/locate.ts";

export type { ScanMime };
export type Resolved = { ok: true; path: string; mime: ScanMime } | { ok: false; message: string };
export interface ScanContext {
  db: Db;
  dataDir: string;
  /** «Папка сканов» объекта; несколько — через «;». */
  scanFolder: string;
}

/** Находит файл скана на этом компьютере (0.46.9: по отпечатку, номеру с проверкой имени, имени в папках сканов). */
export function resolveScan(ref: FileRef, ctx: ScanContext): Resolved {
  const r = locateScan(ctx.db, ctx.dataDir, { link: ref.link, name: ref.name }, scanFolders(ctx.scanFolder));
  if (!r.ok) return r;
  return r.from === "store" ? { ok: true, path: r.abs, mime: r.file.mime as ScanMime } : { ok: true, path: r.path, mime: r.mime };
}

const A4: [number, number] = [595.28, 841.89];

/** Документ pdf-lib со страницами скана: PDF как есть, картинка — вписана в лист А4 (альбомный, если шире высоты). */
export async function loadScan(r: { path: string; mime: ScanMime }): Promise<PDFDocument> {
  const bytes = await readFile(r.path);
  if (r.mime === "application/pdf") {
    try {
      return await PDFDocument.load(bytes, { updateMetadata: false });
    } catch (e) {
      if (/encrypt/i.test(String((e as Error).message))) throw new Error(`PDF защищён паролем — снимите защиту: ${r.path}`, { cause: e });
      throw new Error(`PDF повреждён или не читается: ${r.path}`, { cause: e });
    }
  }
  const doc = await PDFDocument.create();
  let img;
  try {
    img = r.mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    throw new Error(`Картинка повреждена или не читается: ${r.path}`);
  }
  const [w, h] = img.width > img.height ? [A4[1], A4[0]] : A4;
  const s = Math.min(w / img.width, h / img.height);
  const page = doc.addPage([w, h]);
  page.drawImage(img, { x: (w - img.width * s) / 2, y: (h - img.height * s) / 2, width: img.width * s, height: img.height * s });
  return doc;
}
