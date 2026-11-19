// Слой Office.js: книга объекта в Excel. Вся логика — в @idk/shared/workbook; здесь только чтение/запись,
// разметка, выделение и события. Требуется ExcelApi 1.9.
// 0.31: класс — фасад; работа с Excel разнесена по модулям excel/: rows (строки), markup и paint (разметка),
// migrate (перенос книги прежней версии), selection (выделение и события), sheets (видимость листов), settings.
import type { TableName } from "@idk/shared/workbook/schema";
import type { CellValue } from "@idk/shared/workbook/values";
import type { Report, RowsTarget, TableStore } from "@idk/shared/workbook/store";
import type { ImportantMap } from "@idk/shared/workbook/important";
import { withVirtualTables } from "@idk/shared/workbook/virtual";
import { currentHost, type HostStatus } from "./host.ts";
import type { ChangeEvent, MergeReport, Selection } from "./excel/common.ts";
import * as rows from "./excel/rows.ts";
import * as cfg from "./excel/settings.ts";
import * as sel from "./excel/selection.ts";
import * as sheets from "./excel/sheets.ts";
import * as markup from "./excel/markup.ts";
import { applyImportant } from "./excel/paint.ts";

export type { ChangeEvent, MergeReport, Selection };

export class ExcelPort implements TableStore {
  host(): HostStatus {
    return currentHost();
  }
  isSupported(): boolean {
    return this.host() === "ok";
  }

  // ---------- TableStore ----------
  // План 31: «Спецификация» и «ДокументыКачества» — виртуальные (из «Материалов»); raw — таблицы Excel.

  private readonly raw: TableStore = {
    read: (n) => rows.rawRead(n),
    readMany: (n) => rows.rawReadMany(n),
    write: (n, r, v, l) => rows.rawWrite(n, r, v, l),
    insert: (n, a, r) => rows.rawInsert(n, a, r),
    remove: (n, r) => rows.rawRemove(n, r),
    setting: (k) => this.setting(k),
    setSetting: (k, v) => this.setSetting(k, v),
    writeReport: (r) => this.writeReport(r),
  };
  private readonly store = withVirtualTables(this.raw);
  /** Итог последнего переноса книги прежней версии (план 31) или null. */
  lastMerge: MergeReport | null = null;

  read(name: TableName) {
    return this.store.read(name);
  }
  readMany(names: readonly TableName[]) {
    return this.store.readMany!(names);
  }
  write(name: TableName, row: number, values: Record<string, CellValue>, links: Record<string, string | null> = {}) {
    return this.store.write(name, row, values, links);
  }
  insert(name: TableName, at: number, rows: Record<string, CellValue>[]) {
    return this.store.insert(name, at, rows);
  }
  remove(name: TableName, rows: number[]) {
    return this.store.remove(name, rows);
  }
  isVirtual(name: TableName) {
    return this.store.isVirtual(name);
  }
  /** Ячейка Excel для строки и столбца таблицы (у виртуальной — в «Материалах»). */
  physical(name: TableName, row: number, header: string | null) {
    return this.store.physical(name, row, header);
  }
  /** Таблица Excel, в которой лежат строки таблицы name. */
  private async excelTable(name: TableName): Promise<TableName> {
    return (await this.store.isVirtual(name)) ? "Материалы" : name;
  }

  /** Отфильтрована ли таблица (панель сама ставит фильтр по акту). */
  async isFiltered(table: TableName): Promise<boolean> {
    return rows.isFiltered(await this.excelTable(table));
  }
  async clearFilters(table: TableName) {
    await rows.clearFilters(await this.excelTable(table));
  }

  // ---------- Настройки и отчёты ----------

  setting(key: string): Promise<string | null> {
    return cfg.setting(key);
  }
  setSetting(key: string, value: string) {
    return cfg.setSetting(key, value);
  }
  /** Отчётный лист: создаётся при первом вызове, иначе очищается и заполняется заново. */
  writeReport(report: Report) {
    return cfg.writeReport(report);
  }

  // ---------- Строки листа вне таблиц ----------

  sheetRows(sheet: string): RowsTarget {
    return rows.sheetRows(sheet);
  }

  // ---------- Выделение и навигация ----------

  /** Пишет в выделенную ячейку (левую верхнюю) значение fn(текущее); null от fn — ничего не писать. */
  writeActiveCell(fn: (current: CellValue) => CellValue | null): Promise<{ written: boolean }> {
    return sel.writeActiveCell(fn);
  }
  getSelection(): Promise<Selection> {
    return sel.getSelection();
  }
  selectCell(table: TableName, row: number | null, header: string): Promise<void> {
    return sel.selectCell(this.store, table, row, header);
  }
  selectSheetCell(sheet: string, row: number, col: number) {
    return sel.selectSheetCell(sheet, row, col);
  }
  /** План 17: видимость листов конструктора; активный лист, который надо скрыть, сначала сменяется первым видимым. */
  setSheetsVisible(visible: readonly string[], hidden: readonly string[]) {
    return sheets.setSheetsVisible(visible, hidden);
  }
  activateSheet(name: string) {
    return sheets.activateSheet(name);
  }
  filterBy(table: TableName, header: string, value: string) {
    return sel.filterBy(this.store, table, header, value);
  }
  /** Номер строки листа (с 1) первой строки данных таблицы — для сообщений «строка N». */
  async tableSheetOffset(table: TableName): Promise<number> {
    return rows.tableSheetOffset(await this.excelTable(table));
  }
  /** Первый столбец таблицы на листе (с 0); -1 — неизвестно. */
  async tableStartColumn(table: TableName): Promise<number> {
    return rows.tableStartColumn(await this.excelTable(table)).catch(() => -1);
  }

  // ---------- События ----------

  onSelection(cb: () => void): Promise<() => Promise<void>> {
    return sel.onSelection(cb);
  }
  onChange(cb: (e: ChangeEvent) => void): Promise<() => Promise<void>> {
    return sel.onChange(cb);
  }

  // ---------- Разметка ----------

  /** Создаёт недостающие листы и таблицы; в существующие (книга прежней версии) дописывает недостающие
   *  столбцы и поля «Объекта» и перекрашивает правила всех таблиц. Возвращает созданные таблицы. */
  async ensureBook(important: ImportantMap): Promise<TableName[]> {
    const { created, merge } = await markup.ensureBook(important);
    if (merge) this.lastMerge = merge;
    return created;
  }
  /** Виды работ из справочника шаблона → столбец листа «Списки» и имя «ВидыРабот» (источник списка «Вида работ»). */
  writeWorkList(names: string[]) {
    return markup.writeWorkList(names);
  }
  /** Перекраска заголовков и правил по карте важных столбцов (для всех таблиц книги). */
  applyImportant(map: ImportantMap) {
    return applyImportant(map);
  }
}
