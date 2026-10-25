// План 15: таблицы книги, прочитанные панелью. Полное чтение — одним заходом (readMany); после правки ячеек
// перечитываются только изменённые таблицы, книга собирается заново из всех прочитанных.
import { bookFromTables, readTables, type Book } from "@idk/shared/workbook/records";
import type { TableName } from "@idk/shared/workbook/schema";
import type { TableData, TableStore } from "@idk/shared/workbook/store";

export class BookCache {
  private tables = new Map<TableName, TableData | null>();
  constructor(private store: TableStore) {}

  async full(): Promise<Book> {
    this.tables = await readTables(this.store);
    return bookFromTables(this.tables);
  }

  /** changed — таблицы изменённых ячеек; null — изменение вне наших таблиц (могли измениться границы). */
  async refresh(changed: readonly (TableName | null)[]): Promise<Book> {
    const names = [...new Set(changed)];
    if (!this.tables.size || !names.length || names.some((n) => n === null || !this.tables.get(n))) return this.full();
    try {
      for (const n of names as TableName[]) this.tables.set(n, await this.store.read(n));
    } catch {
      return this.full();
    }
    return bookFromTables(this.tables);
  }

  /** Прочитанная таблица (для карточки строки) или undefined, если ещё не читалась. */
  table(name: TableName): TableData | null | undefined { return this.tables.get(name); }
}
