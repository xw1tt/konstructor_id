import type { Db } from "../db.ts";
import { NORM_SECTIONS, type CatalogRow, type NormSection, type NormItem, type NormSearchResult } from "@idk/shared/normCatalog";
import { isPortalUrl } from "@idk/shared/normativ";

export type { NormItem, NormSearchResult };

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

/** Нормализация для поиска: нижний регистр, «ё» как «е», пробелы схлопнуты. */
export const searchKey = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

export const normCatalog = (db: Db) => ({
  /** Заменяет раздел целиком одной транзакцией. Строки с адресом не на protect.gost.ru отбрасываются. */
  replaceSection(section: NormSection, rows: CatalogRow[], at: string): void {
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM norm_catalog WHERE section=?").run(section);
      const ins = db.prepare("INSERT INTO norm_catalog (section, ord, designation, title, pages, status, url, search) VALUES (?,?,?,?,?,?,?,?)");
      rows.filter((r) => isPortalUrl(r.url)).forEach((r, i) =>
        ins.run(section, i, r.designation, r.title, r.pages, r.status, r.url, searchKey(`${r.designation} ${r.title}`)));
      db.prepare("INSERT INTO norm_sections (section, updated_at) VALUES (?, ?) ON CONFLICT(section) DO UPDATE SET updated_at=excluded.updated_at")
        .run(section, at);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  },

  search(p: { section?: NormSection; q?: string; offset?: number; limit?: number }): NormSearchResult {
    const words = searchKey(p.q ?? "").split(" ").filter(Boolean);
    const where = words.map(() => "instr(search, ?) > 0");
    const args: (string | number)[] = [...words];
    const cond = (extra: string[]) => (extra.length ? `WHERE ${extra.join(" AND ")}` : "");
    const counts = Object.fromEntries(NORM_SECTIONS.map((s) => [s.code, 0])) as Record<NormSection, number>;
    for (const r of db.prepare(`SELECT section, COUNT(*) AS n FROM norm_catalog ${cond(where)} GROUP BY section`).all(...args) as any[]) {
      if (r.section in counts) counts[r.section as NormSection] = Number(r.n);
    }
    const w = p.section ? [...where, "section = ?"] : where;
    const a = p.section ? [...args, p.section] : args;
    const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM norm_catalog ${cond(w)}`).get(...a) as any).n);
    const limit = Math.min(Math.max(1, Math.floor(p.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
    const offset = Math.max(0, Math.floor(p.offset ?? 0));
    const order = NORM_SECTIONS.map((s, i) => `WHEN '${s.code}' THEN ${i}`).join(" ");
    const items = (db.prepare(`SELECT id, section, designation, title, pages, status, url FROM norm_catalog ${cond(w)}
      ORDER BY CASE section ${order} END, ord LIMIT ? OFFSET ?`).all(...a, limit, offset) as any[])
      .map((r) => ({ id: Number(r.id), section: r.section, designation: r.designation, title: r.title, pages: Number(r.pages), status: r.status, url: r.url }));
    const updated: Partial<Record<NormSection, string>> = {};
    for (const r of db.prepare("SELECT section, updated_at FROM norm_sections").all() as any[]) updated[r.section as NormSection] = r.updated_at;
    return { total, counts, updated, items };
  },
});
