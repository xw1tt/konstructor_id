import type { Db } from "../db.ts";
import { camel, snake } from "./util.ts";

/** Простой CRUD для таблицы, поля объекта ↔ колонки (camelCase ↔ snake_case). */
export function crud<T extends { id: number }, I extends Record<string, unknown>>(
  db: Db, table: string, fields: (keyof I & string)[], orderBy: string,
) {
  const cols = fields.map(snake);
  const vals = (o: I) => fields.map((f) => o[f] as any);
  return {
    list: () => (db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all() as any[]).map((r) => camel<T>(r)!),
    get: (id: number) => camel<T>(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) as any),
    create(o: I): T {
      const r = db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...vals(o));
      return this.get(Number(r.lastInsertRowid))!;
    },
    update(id: number, o: I): T | undefined {
      const r = db.prepare(`UPDATE ${table} SET ${cols.map((c) => c + "=?").join(",")} WHERE id=?`).run(...vals(o), id);
      return r.changes ? this.get(id) : undefined;
    },
    delete: (id: number) => db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id).changes > 0,
  };
}
