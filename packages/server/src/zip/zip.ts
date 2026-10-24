// Zip без зависимостей: чтение (центральный каталог, ленивая распаковка с пределом) и запись (deflate).
// Нужен для .xlsx (РКЦ) и для форм пользователя (.docx/.xlsx).
import { inflateRawSync, deflateRawSync, crc32 } from "node:zlib";

export class ZipError extends Error {}

/** Предел распакованного размера одной записи: защита от «zip-бомбы» на общем локальном сервере. */
export const MAX_ENTRY_BYTES = 200 * 1024 * 1024;
export const ZIP_NOT = "Это не архив zip";
export const ZIP_BROKEN = "Повреждённый архив";
export const ZIP_TOO_BIG = "Файл в архиве слишком большой";

/** Каталог архива: имя → функция распаковки (распаковывается только то, что прочитали). */
export function openZip(data: Uint8Array): Map<string, () => Buffer> {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new ZipError(ZIP_NOT);
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map<string, () => Buffer>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError(ZIP_BROKEN);
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    out.set(name, () => {
      try {
        if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error();
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const raw = buf.subarray(start, start + size);
        if (method === 0) return Buffer.from(raw);
        if (method === 8) return inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") throw new ZipError(ZIP_TOO_BIG);
      }
      throw new ZipError(ZIP_BROKEN);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Архив из файлов (deflate), в переданном порядке; имена — UTF-8. */
export function writeZip(files: [string, Buffer | string][]): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const [name, content] of files) {
    const raw = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const data = deflateRawSync(raw), fn = Buffer.from(name, "utf8"), crc = crc32(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(fn.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(fn.length, 28);
    c.writeUInt32LE(off, 42);
    local.push(h, fn, data);
    central.push(c, fn);
    off += 30 + fn.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...local, cd, end]);
}
