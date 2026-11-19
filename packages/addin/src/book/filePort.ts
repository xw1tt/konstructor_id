// 0.39: слой книги для сохранённого файла .xlsx без Excel — снимок таблиц, прочитанный сервером (/api/book-file).
// Только чтение: обзор, акты, проверка, печать и сборка комплектов работают; правки — в Excel.
import type { TableName } from "@idk/shared/workbook/schema";
import type { CellValue } from "@idk/shared/workbook/values";
import type { RowsTarget, TableData, TableStore } from "@idk/shared/workbook/store";
import { withVirtualTables } from "@idk/shared/workbook/virtual";
import type { HostStatus } from "./host.ts";
import type { BookPort, MergeReport, Selection } from "./bookPort.ts";

export const READ_ONLY = "Книга открыта из файла только для просмотра и печати — изменить её можно в Excel";

export interface BookSnapshot {
  name: string;
  tables: Partial<Record<TableName, TableData>>;
  settings: Record<string, string>;
}

const readOnly = async (): Promise<never> => {
  throw new Error(READ_ONLY);
};

export class FilePort implements BookPort {
  lastMerge: MergeReport | null = null;
  private readonly store;

  constructor(readonly snapshot: BookSnapshot) {
    const raw: TableStore = {
      read: async (n) => snapshot.tables[n] ?? null,
      write: readOnly,
      insert: readOnly,
      remove: readOnly,
      setting: async (k) => snapshot.settings[k] ?? null,
      // Выбор шаблона и «нужных листов» в окне — на время просмотра, в файл не пишется.
      setSetting: async (k, v) => void (snapshot.settings[k] = v),
      writeReport: readOnly,
    };
    this.store = withVirtualTables(raw);
  }

  host(): HostStatus {
    return "ok";
  }
  isSupported() {
    return true;
  }
  read(name: TableName) {
    return this.store.read(name);
  }
  async readMany(names: readonly TableName[]) {
    return this.store.readMany ? this.store.readMany(names) : new Map(await Promise.all(names.map(async (n) => [n, await this.store.read(n)] as const)));
  }
  write(_n: TableName, _r: number, _v: Record<string, CellValue>, _l?: Record<string, string | null>): Promise<void> {
    return readOnly();
  }
  insert(_n: TableName, _a: number, _r: Record<string, CellValue>[]): Promise<number> {
    return readOnly();
  }
  remove(_n: TableName, _r: number[]): Promise<void> {
    return readOnly();
  }
  isVirtual(name: TableName) {
    return this.store.isVirtual(name);
  }
  physical(name: TableName, row: number, header: string | null) {
    return this.store.physical(name, row, header);
  }
  async isFiltered() {
    return false;
  }
  async clearFilters() {}
  setting(key: string) {
    return this.store.setting(key);
  }
  setSetting(key: string, value: string) {
    return this.store.setSetting(key, value);
  }
  writeReport(): Promise<void> {
    return readOnly();
  }
  sheetRows(): RowsTarget {
    return { count: async () => 0, read: async () => ({ values: [], links: [] }), write: readOnly, insertBlank: readOnly, remove: readOnly };
  }
  writeActiveCell(): Promise<{ written: boolean }> {
    return readOnly();
  }
  async getSelection(): Promise<Selection> {
    return { sheet: "", table: null, row: null, rows: [], column: null, sheetRow: 0, sheetCol: 0, sheetRows: [] };
  }
  // Переходы к ячейкам и листам в файле без Excel — некуда; молча ничего не делать.
  async selectCell() {}
  async selectSheetCell() {}
  async setSheetsVisible() {}
  async activateSheet(_name?: string) {}
  async filterBy() {}
  /** Номера строк в сообщениях: в файле неизвестны — как у таблицы со строки 2 под заголовком. */
  async tableSheetOffset() {
    return 2;
  }
  async onSelection() {
    return async () => {};
  }
  async onChange() {
    return async () => {};
  }
  ensureBook(_important?: unknown): Promise<TableName[]> {
    return readOnly();
  }
  async writeWorkList() {}
  async applyImportant() {}
}
