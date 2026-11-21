// 0.46.9: где скан на ЭТОМ компьютере. Ссылка в книге — номер файла в хранилище программы (/api/files/N), а на другом
// компьютере у того же номера другой файл или нет никакого. Поэтому: ссылка с отпечатком содержимого (?sha=…) находит
// файл по отпечатку — в хранилище или в папках сканов; старая ссылка без отпечатка проверяется по имени файла из ячейки,
// не совпало — файл ищется по имени в папках сканов (с подпапками).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve, win32 } from "node:path";
import type { FileRow } from "@idk/shared/schemas";
import type { Db } from "../db.ts";
import { getFile } from "./store.ts";

export type ScanMime = "application/pdf" | "image/jpeg" | "image/png";
export const SCAN_MIME: Record<string, ScanMime> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

export type Located =
  | { ok: true; from: "store"; file: FileRow & { path: string }; abs: string }
  | { ok: true; from: "folder"; path: string; name: string; mime: ScanMime }
  | { ok: false; message: string };

/** Номер файла и отпечаток из ссылки «…/api/files/12?sha=…». */
export function parseScanLink(link: string | null | undefined): { id: number | null; sha: string | null } {
  const m = /\/api\/files\/(\d+)(?:\?([^#]*))?(?:#.*)?$/.exec(link ?? "");
  if (!m) return { id: null, sha: null };
  const sha = new URLSearchParams(m[2] ?? "").get("sha");
  return { id: Number(m[1]), sha: sha && /^[0-9a-f]{64}$/i.test(sha) ? sha.toLowerCase() : null };
}

/** Папки сканов: несколько — через «;» или с новой строки. */
export const scanFolders = (s: string | null | undefined) =>
  String(s ?? "")
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
/** Имя файла из ячейки «Скан» (без пути); адрес вместо имени — имени нет. */
export const cellFileName = (name: string | null | undefined) => {
  const n = String(name ?? "").trim();
  if (!n || /^https?:\/\//i.test(n)) return "";
  return win32.basename(n);
};

const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

interface Entry {
  path: string;
  name: string;
  size: number;
  mtime: number;
}
const MAX_FILES = 50_000;
const index = new Map<string, { at: number; files: Entry[] }>();
/** Файлы сканов папки с подпапками (список помнится 30 секунд). */
export function folderFiles(folder: string, fresh = false): Entry[] {
  const hit = index.get(folder);
  if (hit && !fresh && Date.now() - hit.at < 30_000) return hit.files;
  const files: Entry[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 12 || files.length >= MAX_FILES) return;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(dir, n);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (st.isFile() && SCAN_MIME[extname(n).toLowerCase()]) files.push({ path: p, name: n, size: st.size, mtime: st.mtimeMs });
    }
  };
  walk(folder, 0);
  index.set(folder, { at: Date.now(), files });
  return files;
}

const hashes = new Map<string, string>();
export function fileSha(e: Entry): string {
  const key = `${e.path}|${e.size}|${e.mtime}`;
  let h = hashes.get(key);
  if (!h) {
    h = createHash("sha256").update(readFileSync(e.path)).digest("hex");
    hashes.set(key, h);
  }
  return h;
}

const fromStore = (dataDir: string, file: FileRow & { path: string }): Located => {
  const abs = join(dataDir, "files", file.path);
  return isFile(abs) ? { ok: true, from: "store", file, abs } : { ok: false, message: `Файл скана отсутствует на диске программы: ${file.name}` };
};
const fromFolder = (e: Entry): Located => ({ ok: true, from: "folder", path: e.path, name: e.name, mime: SCAN_MIME[extname(e.name).toLowerCase()] });

export function fileBySha(db: Db, sha: string): (FileRow & { path: string }) | undefined {
  const r = db.prepare("SELECT id FROM files WHERE sha256=?").get(sha) as { id: number } | undefined;
  return r ? getFile(db, r.id) : undefined;
}

/**
 * Скан строки: { link — адрес из ячейки, name — текст ячейки }. Порядок: отпечаток (хранилище, затем папки сканов);
 * номер файла, если имя совпадает с ячейкой (или имени в ячейке нет); имя — в папках сканов, затем в хранилище;
 * полный путь или имя в папке сканов — как раньше.
 */
export function locateScan(db: Db, dataDir: string, ref: { link: string | null; name: string }, folders: string[]): Located {
  const first = locateIn(db, dataDir, ref, folders, false);
  // Не нашли по запомненному списку папки — файлы могли только что положить: список заново.
  return first.ok || !folders.length ? first : locateIn(db, dataDir, ref, folders, true);
}

function locateIn(db: Db, dataDir: string, ref: { link: string | null; name: string }, folders: string[], fresh: boolean): Located {
  const { id, sha } = parseScanLink(ref.link);
  const name = cellFileName(ref.name);
  const all = () => folders.flatMap((f) => folderFiles(f, fresh));
  if (sha) {
    const f = fileBySha(db, sha);
    if (f) return fromStore(dataDir, f);
    const list = all();
    const same = [...list.filter((e) => name && norm(e.name) === norm(name)), ...list];
    const hit = same.find((e) => fileSha(e) === sha);
    if (hit) return fromFolder(hit);
  }
  if (id !== null) {
    const f = getFile(db, id);
    if (f && !sha && (!name || norm(f.name) === norm(name))) return fromStore(dataDir, f);
  }
  if (!name) {
    if (id !== null || sha)
      return { ok: false, message: `Прикреплённый файл не найден на этом компьютере (${ref.link}). Положите сканы в «Папку сканов» и привяжите заново` };
    return { ok: false, message: "Нет скана: укажите файл в столбце «Скан»" };
  }
  const raw = String(ref.name).trim();
  if ((isAbsolute(raw) || win32.isAbsolute(raw)) && isFile(raw)) {
    const mime = SCAN_MIME[extname(raw).toLowerCase()];
    if (!mime) return { ok: false, message: `Поддерживаются только PDF, JPG и PNG: ${raw}` };
    return { ok: true, from: "folder", path: raw, name: basename(raw), mime };
  }
  if (!SCAN_MIME[extname(name).toLowerCase()]) return { ok: false, message: `Поддерживаются только PDF, JPG и PNG: ${name}` };
  // Имя относительно папки сканов (как раньше) — затем по имени в подпапках.
  for (const f of folders) {
    const p = resolve(f, raw);
    if (isFile(p)) return { ok: true, from: "folder", path: p, name, mime: SCAN_MIME[extname(name).toLowerCase()] };
  }
  const byName = all().filter((e) => norm(e.name) === norm(name));
  if (byName.length) {
    const shas = new Set(byName.map(fileSha));
    if (shas.size === 1) return fromFolder(byName[0]);
    return {
      ok: false,
      message: `В папке сканов несколько разных файлов «${name}»: ${byName
        .slice(0, 3)
        .map((e) => e.path)
        .join("; ")}${byName.length > 3 ? "…" : ""}. Переименуйте их или прикрепите нужный заново`,
    };
  }
  const inStore = (db.prepare("SELECT id, name FROM files").all() as { id: number; name: string }[]).filter((r) => norm(r.name) === norm(name));
  const stored = [...new Set(inStore.map((r) => getFile(db, r.id)!.sha256))];
  if (stored.length === 1) return fromStore(dataDir, getFile(db, inStore[0].id)!);
  if (!folders.length)
    return { ok: false, message: `Скан «${name}» не найден на этом компьютере. Укажите «Папка сканов» в «Объекте» — файл найдётся по имени` };
  return { ok: false, message: `Файл не найден: ${folders.map((f) => resolve(f, raw)).join("; ")} (искали и в подпапках)` };
}
