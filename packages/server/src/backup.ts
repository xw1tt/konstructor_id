import { cpSync, existsSync, linkSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "./db.ts";

const KEEP = 30;

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** Копирует дерево жёсткими ссылками (мгновенно, без лишнего места); при ошибке — обычным копированием. */
function linkTree(src: string, dst: string) {
  for (const name of readdirSync(src)) {
    if (name === "tmp") continue;
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) {
      mkdirSync(d, { recursive: true });
      linkTree(s, d);
    } else {
      try { linkSync(s, d); } catch { cpSync(s, d); }
    }
  }
}

/** Ежедневная копия базы и файлов в backups/ГГГГ-ММ-ДД; хранит 30 последних. null — копия за сегодня уже есть. */
export function runDailyBackup(dataDir: string, now = new Date()): string | null {
  const root = join(dataDir, "backups");
  const target = join(root, dayOf(now));
  if (existsSync(target)) return null;
  mkdirSync(target, { recursive: true });
  const dbPath = join(dataDir, "db.sqlite");
  if (existsSync(dbPath)) {
    const db = openDb(dbPath);
    try {
      db.prepare("VACUUM INTO ?").run(join(target, "db.sqlite"));
    } finally {
      db.close();
    }
  }
  const files = join(dataDir, "files");
  if (existsSync(files)) {
    mkdirSync(join(target, "files"), { recursive: true });
    linkTree(files, join(target, "files"));
  }
  const all = readdirSync(root).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(root, old), { recursive: true, force: true });
  return target;
}
