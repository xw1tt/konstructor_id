// Этап 1: доступ к PostgreSQL — тонкий интерфейс над pg (облако) и PGlite (тесты, запуск без PostgreSQL).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Всё внутри — одной транзакцией; ошибка — откат. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const MIGRATIONS = fileURLToPath(new URL("../migrations/", import.meta.url));

/** Применяет новые миграции по порядку имён файлов; каждая — в своей транзакции. */
export async function migrate(db: Db, dir = MIGRATIONS): Promise<string[]> {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).map((r) => r.name));
  const applied: string[] = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    const sql = readFileSync(join(dir, name), "utf8");
    await db.tx(async (t) => {
      await t.query(sql);
      await t.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    applied.push(name);
  }
  return applied;
}

/** PostgreSQL в WebAssembly: в памяти (тесты) или в папке (локальный запуск). */
export async function pgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(dataDir);
  const wrap = (q: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (s: string) => Promise<unknown> }): Db => ({
    async query<T>(sql: string, params: unknown[] = []) {
      // Несколько операторов без параметров (миграции) — exec.
      if (!params.length && /;\s*\S/.test(sql.trim().replace(/;\s*$/, ""))) { await q.exec(sql); return [] as T[]; }
      return (await q.query(sql, params)).rows as T[];
    },
    tx: async <T>(fn: (db: Db) => Promise<T>) => pg.transaction(async (t) => fn(wrap(t as never))) as Promise<T>,
    close: async () => { await pg.close(); },
  });
  return wrap(pg as never);
}

/** PostgreSQL в облаке (строка подключения DATABASE_URL). */
export async function pgDb(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  // bigint (деньги в копейках) — числом: суммы далеко от 2^53.
  pg.types.setTypeParser(20, (v: string) => Number(v));
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db: Db = {
    async query<T>(sql: string, params: unknown[] = []) { return (await pool.query(sql, params)).rows as T[]; },
    async tx<T>(fn: (db: Db) => Promise<T>) {
      const c = await pool.connect();
      const inner: Db = { query: async <R>(s: string, p: unknown[] = []) => (await c.query(s, p)).rows as R[], tx: (f) => f(inner), close: async () => {} };
      try { await c.query("BEGIN"); const r = await fn(inner); await c.query("COMMIT"); return r; }
      catch (e) { await c.query("ROLLBACK"); throw e; }
      finally { c.release(); }
    },
    close: async () => { await pool.end(); },
  };
  return db;
}
