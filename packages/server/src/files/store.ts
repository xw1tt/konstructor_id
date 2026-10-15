import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, renameSync, rmSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { Readable } from "node:stream";
import { PDFDocument } from "pdf-lib";
import type { FileRow } from "@idk/shared/schemas";
import type { Db } from "../db.ts";
import { HttpError } from "../http/router.ts";

export const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export const tooBig = (limit: number) =>
  new HttpError(413, `Файл больше ${limit >= 1048576 ? Math.round(limit / 1048576) + " МБ" : limit + " байт"}`);

export async function countPages(path: string, mime: string): Promise<number> {
  if (mime !== "application/pdf") return 1;
  try {
    const doc = await PDFDocument.load(await readFile(path), { ignoreEncryption: true, updateMetadata: false });
    return doc.getPageCount();
  } catch {
    throw new HttpError(400, "Не удалось прочитать PDF: файл повреждён или это не PDF");
  }
}

const toRow = (r: any): FileRow => ({ id: r.id, sha256: r.sha256, name: r.name, mime: r.mime, size: r.size, pages: r.pages });

export function getFile(db: Db, id: number): (FileRow & { path: string }) | undefined {
  const r = db.prepare("SELECT * FROM files WHERE id=?").get(id) as any;
  return r ? { ...toRow(r), path: r.path } : undefined;
}

/** Сохраняет поток в files/<xx>/<sha256>.<ext>; одинаковое содержимое хранится один раз. */
export async function saveFile(
  db: Db, dataDir: string, stream: Readable, meta: { name: string; mime: string }, limit: number,
): Promise<FileRow> {
  const ext = ALLOWED_MIME[meta.mime];
  if (!ext) throw new HttpError(415, "Поддерживаются только PDF, JPEG и PNG");
  const tmpDir = join(dataDir, "files", "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const tmp = join(tmpDir, randomUUID());
  const hash = createHash("sha256");
  let size = 0;
  const out = createWriteStream(tmp);
  try {
    for await (const chunk of stream) {
      size += (chunk as Buffer).length;
      if (size > limit) throw tooBig(limit);
      hash.update(chunk as Buffer);
      if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
    }
    await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
    const sha256 = hash.digest("hex");
    const existing = db.prepare("SELECT * FROM files WHERE sha256=?").get(sha256) as any;
    if (existing) {
      rmSync(tmp, { force: true });
      return toRow(existing);
    }
    const pages = await countPages(tmp, meta.mime);
    const rel = join(sha256.slice(0, 2), `${sha256}.${ext}`);
    const abs = join(dataDir, "files", rel);
    mkdirSync(dirname(abs), { recursive: true });
    if (!existsSync(abs)) renameSync(tmp, abs);
    else rmSync(tmp, { force: true });
    const r = db.prepare("INSERT INTO files (sha256, name, mime, size, pages, path) VALUES (?,?,?,?,?,?)")
      .run(sha256, meta.name, meta.mime, size, pages, rel);
    return toRow(db.prepare("SELECT * FROM files WHERE id=?").get(Number(r.lastInsertRowid)));
  } catch (e) {
    out.destroy();
    rmSync(tmp, { force: true });
    throw e;
  }
}
