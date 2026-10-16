// Книга в памяти — для тестов логики без Excel. Формульные ячейки хранятся как null.
import { TABLES, TABLE_NAMES, type TableName } from "./schema.ts";
import type { CellValue } from "./values.ts";
import type { TableData, TableStore } from "./store.ts";

interface MemTable { headers: string[]; formula: boolean[]; rows: CellValue[][]; links: (string | null)[][] }

export class MemoryWorkbook implements TableStore {
  private tables = new Map<TableName, MemTable>();
  private settings = new Map<string, string>();

  constructor(init: Partial<Record<TableName, Record<string, CellValue>[]>> = {}) {
    for (const name of TABLE_NAMES) {
      const cols = TABLES[name].columns;
      const t: MemTable = { headers: cols.map((c) => c.header), formula: cols.map((c) => c.type === "formula"), rows: [], links: [] };
      this.tables.set(name, t);
      for (const rec of init[name] ?? []) this.push(t, t.rows.length, rec);
    }
  }

  private push(t: MemTable, at: number, rec: Record<string, CellValue>) {
    t.rows.splice(at, 0, t.headers.map((h, i) => (t.formula[i] ? null : rec[h] ?? null)));
    t.links.splice(at, 0, t.headers.map(() => null));
  }

  drop(name: TableName) { this.tables.delete(name); }

  private get(name: TableName): MemTable {
    const t = this.tables.get(name);
    if (!t) throw new Error(`Таблица «${name}» не найдена`);
    return t;
  }

  async read(name: TableName): Promise<TableData | null> {
    const t = this.tables.get(name);
    if (!t) return null;
    return { name, headers: [...t.headers], rows: t.rows.map((r) => [...r]), links: t.links.map((r) => [...r]) };
  }

  async write(name: TableName, row: number, values: Record<string, CellValue>, links: Record<string, string | null> = {}) {
    const t = this.get(name);
    if (row < 0 || row >= t.rows.length) throw new Error(`Нет строки ${row} в таблице «${name}»`);
    t.headers.forEach((h, i) => {
      if (t.formula[i]) return;
      if (h in values) t.rows[row][i] = values[h];
      if (h in links) t.links[row][i] = links[h];
    });
  }

  async insert(name: TableName, at: number, rows: Record<string, CellValue>[]) {
    const t = this.get(name);
    const pos = Math.max(0, Math.min(at, t.rows.length));
    rows.forEach((r, i) => this.push(t, pos + i, r));
  }

  async remove(name: TableName, rows: number[]) {
    const t = this.get(name);
    for (const r of [...new Set(rows)].sort((a, b) => b - a)) {
      if (r < 0 || r >= t.rows.length) continue;
      t.rows.splice(r, 1);
      t.links.splice(r, 1);
    }
  }

  async setting(key: string) { return this.settings.get(key) ?? null; }
  async setSetting(key: string, value: string) { this.settings.set(key, value); }
}
