// Сканы комплекта: где лежит файл (прикреплён к серверу, в папке сканов, полный путь) и его страницы.
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, resolve, win32 } from "node:path";
import { PDFDocument } from "pdf-lib";
import type { FileRef } from "@idk/shared/kit/request";
import type { Db } from "../db.ts";
import { getFile } from "../files/store.ts";

export type ScanMime = "application/pdf" | "image/jpeg" | "image/png";
export type Resolved = { ok: true; path: string; mime: ScanMime } | { ok: false; message: string };
export interface ScanContext { db: Db; dataDir: string; scanFolder: string }

const MIME: Record<string, ScanMime> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
const isFile = (p: string) => { try { return statSync(p).isFile(); } catch { return false; } };

/** Находит файл скана. Ссылка на файл сервера (/api/files/N) важнее имени. */
export function resolveScan(ref: FileRef, ctx: ScanContext): Resolved {
  const id = ref.link?.match(/\/api\/files\/(\d+)(?:[?#].*)?$/)?.[1];
  if (id) {
    const f = getFile(ctx.db, Number(id));
    if (!f) return { ok: false, message: `Прикреплённый файл не найден на сервере: ${ref.name || ref.link}` };
    const path = join(ctx.dataDir, "files", f.path);
    if (!isFile(path)) return { ok: false, message: `Файл скана отсутствует на диске сервера: ${f.name}. Прикрепите его заново` };
    return { ok: true, path, mime: f.mime as ScanMime };
  }
  const name = ref.name.trim();
  if (!name) return { ok: false, message: "Нет скана: укажите файл в столбце «Скан»" };
  const mime = MIME[extname(name).toLowerCase()];
  if (!mime) return { ok: false, message: `Поддерживаются только PDF, JPG и PNG: ${name}` };
  let path: string;
  if (isAbsolute(name) || win32.isAbsolute(name)) path = name;
  else if (!ctx.scanFolder.trim()) return { ok: false, message: `Укажите «Папка сканов» в «Объекте» или полный путь к файлу: ${name}` };
  else path = resolve(ctx.scanFolder.trim(), name);
  if (!isFile(path)) return { ok: false, message: `Файл не найден: ${path}` };
  return { ok: true, path, mime };
}

const A4: [number, number] = [595.28, 841.89];

/** Документ pdf-lib со страницами скана: PDF как есть, картинка — вписана в лист А4 (альбомный, если шире высоты). */
export async function loadScan(r: { path: string; mime: ScanMime }): Promise<PDFDocument> {
  const bytes = await readFile(r.path);
  if (r.mime === "application/pdf") {
    try {
      return await PDFDocument.load(bytes, { updateMetadata: false });
    } catch (e) {
      if (/encrypt/i.test(String((e as Error).message))) throw new Error(`PDF защищён паролем — снимите защиту: ${r.path}`);
      throw new Error(`PDF повреждён или не читается: ${r.path}`);
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
