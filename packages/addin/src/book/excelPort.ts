// Слой Office.js: книга объекта в Excel. Вся логика — в @idk/shared/workbook; здесь только чтение/запись,
// разметка, выделение и события. Требуется ExcelApi 1.9.
import {
  TABLES, SHEETS, TABLE_NAMES, OBJECT_FIELDS, OBJECT_REQUIRED_LABELS, SCHEMA_VERSION, keyColumn, type TableName, type ColumnDef,
} from "@idk/shared/workbook/schema";
import type { CellValue } from "@idk/shared/workbook/values";
import type { Report, RowData, RowsTarget, TableData, TableStore } from "@idk/shared/workbook/store";
import type { ImportantMap } from "@idk/shared/workbook/important";
import { currentHost, type HostStatus } from "./host.ts";
import { exampleColumn } from "@idk/shared/workbook/examples";
import {
  COLORS, LISTS_SHEET, applyValidation, colLetter, duplicateRule, exampleRule, importantRule, objectImportantRule, listName, promptFor,
  nextTableTop, textFormatted, visibleTableRows, missingColumns, missingObjectFields, negativeRule,
} from "./layout.ts";

/** Подписи над таблицами на листах с несколькими таблицами. */
const TABLE_TITLES: Partial<Record<TableName, string>> = {
  "Шифры": "Шифры рабочей документации", "АктыКомплектов": "Акты комплектов",
};

declare const Office: any;
declare const Excel: any;

export interface Selection {
  sheet: string;
  table: TableName | null;
  /** Индекс строки данных таблицы под активной ячейкой. */
  row: number | null;
  /** Индексы строк данных, попавших в выделение. */
  rows: number[];
  column: string | null;
  /** Строка и столбец листа (с 0) активной ячейки. */
  sheetRow: number;
  sheetCol: number;
  /** Строки листа (с 0), попавшие в выделение. */
  sheetRows: number[];
}

export interface ChangeEvent {
  table: TableName | null; row: number | null; column: string | null;
  before: CellValue; after: CellValue; multi: boolean;
}

const isOurs = (name: string): name is TableName => (TABLE_NAMES as string[]).includes(name);
const VERSION_SETTING = "idk.version";
const LAST_RULE_ROW = 5000;

interface Located { table: TableName | null; row: number | null; column: string | null; rows: number[] }

/** Какой нашей таблице принадлежит ячейка листа (rowIndex/columnIndex с 0). */
async function locate(ctx: any, ws: any, rowIndex: number, colIndex: number, rowCount = 1): Promise<Located> {
  ws.tables.load("items/name");
  await ctx.sync();
  const ours = (ws.tables.items as any[]).filter((t) => isOurs(t.name));
  const parts = ours.map((t) => {
    const body = t.getDataBodyRange().load("rowIndex,columnIndex,rowCount,columnCount");
    const head = t.getHeaderRowRange().load("values");
    return { t, body, head };
  });
  await ctx.sync();
  for (const { t, body, head } of parts) {
    const inCols = colIndex >= body.columnIndex && colIndex < body.columnIndex + body.columnCount;
    const inRows = rowIndex >= body.rowIndex - 1 && rowIndex < body.rowIndex + body.rowCount;
    if (!inCols || !inRows) continue;
    const row = rowIndex >= body.rowIndex ? rowIndex - body.rowIndex : null;
    const rows: number[] = [];
    for (let r = rowIndex; r < rowIndex + rowCount; r++) if (r >= body.rowIndex && r < body.rowIndex + body.rowCount) rows.push(r - body.rowIndex);
    return { table: t.name, row, column: String(head.values[0][colIndex - body.columnIndex]), rows };
  }
  return { table: null, row: null, column: null, rows: [] };
}

const settings = () => Office.context.document.settings;
const saveSettings = () => new Promise<void>((resolve, reject) =>
  settings().saveAsync((r: any) => (r.status === "succeeded" ? resolve() : reject(new Error(r.error?.message ?? "Не удалось сохранить настройки")))));

export class ExcelPort implements TableStore {
  host(): HostStatus { return currentHost(); }
  isSupported(): boolean { return this.host() === "ok"; }

  // ---------- TableStore ----------

  async read(name: TableName): Promise<TableData | null> {
    return Excel.run(async (ctx: any) => {
      const t = ctx.workbook.tables.getItemOrNullObject(name);
      await ctx.sync();
      if (t.isNullObject) return null;
      const head = t.getHeaderRowRange().load("values");
      const body = t.getDataBodyRange().load("values,rowCount");
      await ctx.sync();
      const headers = (head.values[0] as unknown[]).map(String);
      const rows = (body.values as CellValue[][]).map((r) => r.map((v) => (v === "" ? null : v)));
      const links: (string | null)[][] = rows.map((r) => r.map(() => null));
      const fileCols = TABLES[name].columns.filter((c) => c.type === "file").map((c) => headers.indexOf(c.header)).filter((i) => i >= 0);
      if (fileCols.length && rows.length) {
        const cells = rows.flatMap((_, ri) => fileCols.map((ci) => ({ ri, ci, cell: body.getCell(ri, ci).load("hyperlink") })));
        await ctx.sync();
        for (const { ri, ci, cell } of cells) links[ri][ci] = cell.hyperlink?.address ?? null;
      }
      return { name, headers, rows, links };
    });
  }

  async write(name: TableName, row: number, values: Record<string, CellValue>, links: Record<string, string | null> = {}) {
    await Excel.run(async (ctx: any) => {
      const t = ctx.workbook.tables.getItem(name);
      const head = t.getHeaderRowRange().load("values");
      const body = t.getDataBodyRange();
      await ctx.sync();
      const headers = (head.values[0] as unknown[]).map(String);
      for (const col of TABLES[name].columns) {
        if (col.type === "formula") continue;
        const i = headers.indexOf(col.header);
        if (i < 0) continue;
        const cell = body.getCell(row, i);
        if (col.header in values) cell.values = [[values[col.header] ?? ""]];
        if (col.header in links) {
          const address = links[col.header];
          // Текст ссылки задаём, только если пишется и значение — иначе в ячейке остаётся имя файла.
          if (address) cell.hyperlink = col.header in values ? { address, textToDisplay: String(values[col.header] ?? "") } : { address };
          else cell.clear("Hyperlinks");
        }
      }
      await ctx.sync();
    });
  }

  async insert(name: TableName, at: number, rows: Record<string, CellValue>[]): Promise<number> {
    if (!rows.length) return at;
    return Excel.run(async (ctx: any) => {
      const t = ctx.workbook.tables.getItem(name);
      const head = t.getHeaderRowRange().load("values");
      t.rows.load("count");
      await ctx.sync();
      const headers = (head.values[0] as unknown[]).map(String);
      const formula = (h: string) => TABLES[name].columns.find((c) => c.header === h && c.type === "formula")?.formula;
      const values = rows.map((r) => headers.map((h) => formula(h) ?? r[h] ?? ""));
      const index = Math.max(0, Math.min(at, t.rows.count));
      // В таблице всегда есть хотя бы одна строка: если она пустая, заполняем её вместо вставки.
      if (t.rows.count === 1) {
        const only = t.getDataBodyRange().load("values");
        await ctx.sync();
        if ((only.values[0] as unknown[]).every((v, i) => v === "" || formula(headers[i]))) {
          only.values = [values[0]];
          if (values.length > 1) await this.addTableRows(ctx, t, 1, values.slice(1));
          await ctx.sync();
          return 0;
        }
      }
      return this.addTableRows(ctx, t, index, values);
    });
  }

  /**
   * Вставка строк в таблицу через вставку целых строк листа. table.rows.add сдвигает вниз только столбцы
   * таблицы, и Excel отказывает («Недопустимая операция… переместить ячейки таблицы»), если ниже стоит
   * более широкая таблица (на «Реквизитах» под «Объектом» — «Организации»). Целые строки листа сдвигают
   * нижние таблицы целиком; вставка внутри таблицы её расширяет. Возвращает индекс первой новой строки.
   */
  private async addTableRows(ctx: any, t: any, index: number, values: unknown[][]): Promise<number> {
    const body = t.getDataBodyRange().load("rowIndex,rowCount,columnIndex,columnCount");
    const ws = t.worksheet;
    await ctx.sync();
    const n = values.length, count = body.rowCount as number;
    const append = index >= count;
    // В конец: вставляем перед последней строкой (внутри таблицы), затем последнюю строку поднимаем на место.
    const at = append ? count - 1 : index;
    const rowsAt = (i: number, k = 1) => ws.getRangeByIndexes(body.rowIndex + i, body.columnIndex, k, body.columnCount);
    ws.getRangeByIndexes(body.rowIndex + at, 0, n, 1).getEntireRow().insert("Down");
    await ctx.sync();
    let first = at;
    if (append) {
      rowsAt(at).copyFrom(rowsAt(at + n), "All");
      first = count;
      const target = rowsAt(first, n);
      target.clear("Contents");
      target.clear("Hyperlinks");
    }
    rowsAt(first, n).values = values;
    await ctx.sync();
    return first;
  }

  /** Отфильтрована ли таблица (панель сама ставит фильтр по акту). */
  async isFiltered(table: TableName): Promise<boolean> {
    return Excel.run(async (ctx: any) => {
      const f = ctx.workbook.tables.getItem(table).autoFilter.load("isDataFiltered");
      await ctx.sync();
      return !!f.isDataFiltered;
    });
  }

  async clearFilters(table: TableName) {
    await Excel.run(async (ctx: any) => {
      ctx.workbook.tables.getItem(table).clearFilters();
      await ctx.sync();
    });
  }

  async remove(name: TableName, rows: number[]) {
    await Excel.run(async (ctx: any) => {
      const t = ctx.workbook.tables.getItem(name);
      t.rows.load("count");
      const body = t.getDataBodyRange().load("rowIndex");
      await ctx.sync();
      let count = t.rows.count as number;
      for (const r of [...new Set(rows)].filter((x) => x >= 0 && x < count).sort((a, b) => b - a)) {
        // Последнюю строку таблицы Excel удалить не даст — очищаем её (кроме формул).
        if (count === 1) await this.clearRow(ctx, name, t, r);
        else {
          // Целая строка листа: удаление строки таблицы сдвинуло бы только её столбцы (см. addTableRows).
          t.worksheet.getRangeByIndexes(body.rowIndex + r, 0, 1, 1).getEntireRow().delete("Up");
          count--;
        }
      }
      await ctx.sync();
    });
  }

  private async clearRow(ctx: any, name: TableName, t: any, row: number) {
    const head = t.getHeaderRowRange().load("values");
    await ctx.sync();
    (head.values[0] as unknown[]).map(String).forEach((h, i) => {
      if (TABLES[name].columns.find((c) => c.header === h)?.type === "formula") return;
      t.getDataBodyRange().getCell(row, i).clear("Contents");
    });
  }

  async setting(key: string): Promise<string | null> {
    const v = settings().get(key);
    return v === null || v === undefined ? null : String(v);
  }

  async setSetting(key: string, value: string) {
    settings().set(key, value);
    await saveSettings();
  }

  /** Отчётный лист: создаётся при первом вызове, иначе очищается и заполняется заново. */
  async writeReport(report: Report) {
    await Excel.run(async (ctx: any) => {
      let ws = ctx.workbook.worksheets.getItemOrNullObject(report.sheet);
      await ctx.sync();
      if (ws.isNullObject) ws = ctx.workbook.worksheets.add(report.sheet);
      else ws.getRange().clear();
      const width = Math.max(1, ...report.rows.map((r) => r.length));
      const values = report.rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
      const all = ws.getRangeByIndexes(0, 0, values.length, width);
      all.values = values;
      all.format.font.name = "Times New Roman";
      all.format.font.size = 11;
      all.format.verticalAlignment = "Top";
      for (const edge of ["EdgeTop", "EdgeBottom", "EdgeLeft", "EdgeRight", "InsideVertical", "InsideHorizontal"])
        all.format.borders.getItem(edge).style = "Continuous";
      const head = ws.getRangeByIndexes(0, 0, 1, width);
      head.format.fill.color = COLORS.header;
      head.format.wrapText = true;
      for (const r of report.bold) ws.getRangeByIndexes(r, 0, 1, width).format.font.bold = true;
      for (const [r, c] of report.negative) ws.getRangeByIndexes(r, c, 1, 1).format.fill.color = COLORS.duplicate;
      report.widths.forEach((w, c) => { ws.getRangeByIndexes(0, c, 1, 1).format.columnWidth = w * 7; });
      ws.getRangeByIndexes(1, 1, Math.max(1, values.length - 1), 1).format.wrapText = true;
      ws.freezePanes.freezeRows(1);
      ws.activate();
      await ctx.sync();
    });
  }

  // ---------- Строки листа вне таблиц ----------

  sheetRows(sheet: string): RowsTarget {
    const run = <T>(fn: (ctx: any, ws: any) => Promise<T>) => Excel.run((ctx: any) => fn(ctx, ctx.workbook.worksheets.getItem(sheet)));
    const width = async (ctx: any, ws: any) => {
      const used = ws.getUsedRangeOrNullObject(true).load("columnIndex,columnCount,rowIndex,rowCount");
      await ctx.sync();
      return used.isNullObject ? { cols: 1, rows: 0 } : { cols: used.columnIndex + used.columnCount, rows: used.rowIndex + used.rowCount };
    };
    return {
      count: () => run(async (ctx, ws) => (await width(ctx, ws)).rows),
      read: (row) => run(async (ctx, ws): Promise<RowData> => {
        const { cols } = await width(ctx, ws);
        const r = ws.getRangeByIndexes(row, 0, 1, cols).load("formulas");
        await ctx.sync();
        return { values: r.formulas[0] as CellValue[], links: [] };
      }),
      write: (row, d) => run(async (ctx, ws) => {
        if (!d.values.length) return;
        ws.getRangeByIndexes(row, 0, 1, d.values.length).formulas = [d.values.map((v) => v ?? "")];
        await ctx.sync();
      }),
      insertBlank: (at, n) => run(async (ctx, ws) => {
        ws.getRange(`${at + 1}:${at + n}`).insert("Down");
        await ctx.sync();
        return at;
      }),
      remove: (rows) => run(async (ctx, ws) => {
        for (const r of [...new Set(rows)].sort((a, b) => b - a)) ws.getRange(`${r + 1}:${r + 1}`).delete("Up");
        await ctx.sync();
      }),
    };
  }

  // ---------- Выделение и навигация ----------

  /** Пишет в выделенную ячейку (левую верхнюю) значение fn(текущее); null от fn — ничего не писать. */
  async writeActiveCell(fn: (current: CellValue) => CellValue | null): Promise<{ written: boolean }> {
    return Excel.run(async (ctx: any) => {
      const cell = ctx.workbook.getSelectedRange().getCell(0, 0);
      cell.load("values");
      await ctx.sync();
      const next = fn((cell.values?.[0]?.[0] ?? null) === "" ? null : cell.values[0][0]);
      if (next === null) return { written: false };
      cell.values = [[next]];
      await ctx.sync();
      return { written: true };
    });
  }

  async getSelection(): Promise<Selection> {
    return Excel.run(async (ctx: any) => {
      const sel = ctx.workbook.getSelectedRange().load("rowIndex,columnIndex,rowCount");
      const active = ctx.workbook.getActiveCell().load("rowIndex,columnIndex");
      const ws = ctx.workbook.worksheets.getActiveWorksheet().load("name");
      await ctx.sync();
      const loc = await locate(ctx, ws, active.rowIndex, active.columnIndex, 1);
      // Только видимые строки выделения: скрытые фильтром строки других актов не трогаем.
      const visible = sel.getSpecialCellsOrNullObject("Visible");
      visible.load("areas/items/rowIndex,areas/items/rowCount");
      await ctx.sync();
      const areas: { rowIndex: number; rowCount: number }[] = visible.isNullObject
        ? [] : (visible.areas.items as any[]).map((a) => ({ rowIndex: a.rowIndex, rowCount: a.rowCount }));
      const sheetRows = areas.length ? visibleTableRows(areas, 0, 1_048_576) : [active.rowIndex];
      let rows: number[] = loc.row !== null ? [loc.row] : [];
      if (loc.table) {
        const body = ctx.workbook.tables.getItem(loc.table).getDataBodyRange().load("rowIndex,rowCount");
        await ctx.sync();
        const vis = visibleTableRows(areas, body.rowIndex, body.rowCount);
        if (vis.length) rows = vis;
      }
      return {
        sheet: ws.name, table: loc.table, row: loc.row, column: loc.column, rows,
        sheetRow: active.rowIndex, sheetCol: active.columnIndex, sheetRows,
      };
    });
  }

  async selectCell(table: TableName, row: number | null, header: string) {
    await Excel.run(async (ctx: any) => {
      const t = ctx.workbook.tables.getItem(table);
      const head = t.getHeaderRowRange().load("values");
      t.rows.load("count");
      t.worksheet.activate();
      await ctx.sync();
      const i = (head.values[0] as unknown[]).map(String).indexOf(header);
      if (i < 0) return;
      t.getDataBodyRange().getCell(Math.min(Math.max(row ?? 0, 0), t.rows.count - 1), i).select();
      await ctx.sync();
    });
  }

  async selectSheetCell(sheet: string, row: number, col: number) {
    await Excel.run(async (ctx: any) => {
      const ws = ctx.workbook.worksheets.getItem(sheet);
      ws.activate();
      ws.getCell(row, col).select();
      await ctx.sync();
    });
  }

  async activateSheet(name: string) {
    await Excel.run(async (ctx: any) => {
      ctx.workbook.worksheets.getItem(name).activate();
      await ctx.sync();
    });
  }

  async filterBy(table: TableName, header: string, value: string) {
    await Excel.run(async (ctx: any) => {
      const t = ctx.workbook.tables.getItem(table);
      t.worksheet.activate();
      t.clearFilters();
      t.columns.getItem(header).filter.applyValuesFilter([value]);
      await ctx.sync();
    });
  }

  /** Номер строки листа (с 1) первой строки данных таблицы — для сообщений «строка N». */
  async tableSheetOffset(table: TableName): Promise<number> {
    return Excel.run(async (ctx: any) => {
      const body = ctx.workbook.tables.getItem(table).getDataBodyRange().load("rowIndex");
      await ctx.sync();
      return body.rowIndex + 1;
    });
  }

  // ---------- События ----------

  async onSelection(cb: () => void): Promise<() => Promise<void>> {
    let handler: any, activated: any;
    await Excel.run(async (ctx: any) => {
      handler = ctx.workbook.worksheets.onSelectionChanged.add(async () => cb());
      // Переход на другой лист: выделение там не меняется, но панель должна сразу показать раздел листа.
      activated = ctx.workbook.worksheets.onActivated.add(async () => cb());
      await ctx.sync();
    });
    return () => Excel.run(handler.context, async (ctx: any) => { handler.remove(); activated.remove(); await ctx.sync(); });
  }

  async onChange(cb: (e: ChangeEvent) => void): Promise<() => Promise<void>> {
    let handler: any;
    await Excel.run(async (ctx: any) => {
      handler = ctx.workbook.worksheets.onChanged.add(async (e: any) => {
        const multi = String(e.address).includes(":");
        let loc: Located = { table: null, row: null, column: null, rows: [] };
        try {
          loc = await Excel.run(async (c2: any) => {
            const ws = c2.workbook.worksheets.getItem(e.worksheetId);
            const r = ws.getRange(e.address).load("rowIndex,columnIndex");
            await c2.sync();
            return locate(c2, ws, r.rowIndex, r.columnIndex);
          });
        } catch { /* лист мог быть удалён */ }
        const norm = (v: unknown): CellValue => (v === undefined || v === "" ? null : (v as CellValue));
        cb({ ...loc, before: norm(e.details?.valueBefore), after: norm(e.details?.valueAfter), multi });
      });
      await ctx.sync();
    });
    return () => Excel.run(handler.context, async (ctx: any) => { handler.remove(); await ctx.sync(); });
  }

  // ---------- Разметка ----------

  /** Создаёт недостающие листы и таблицы; в существующие (книга прежней версии) дописывает недостающие
   *  столбцы и поля «Объекта» и перекрашивает правила всех таблиц. Возвращает созданные таблицы. */
  async ensureBook(important: ImportantMap): Promise<TableName[]> {
    const created: TableName[] = [];
    await Excel.run(async (ctx: any) => {
      const sheets = ctx.workbook.worksheets;
      sheets.load("items/name");
      ctx.workbook.tables.load("items/name");
      await ctx.sync();
      const sheetNames = new Set((sheets.items as any[]).map((s) => s.name));
      const tableNames = new Set((ctx.workbook.tables.items as any[]).map((t) => t.name));

      await this.ensureLists(ctx, sheetNames);

      for (const sheet of SHEETS) {
        const fresh = !sheetNames.has(sheet.name);
        const ws = fresh ? sheets.add(sheet.name) : sheets.getItem(sheet.name);
        for (const name of sheet.tables) {
          if (tableNames.has(name)) {
            await this.upgradeTable(ctx, name, important[name] ?? []);
            continue;
          }
          // Новая таблица — ниже занятой части листа, чтобы не наложиться на существующие (в т. ч. переименованные).
          const used = ws.getUsedRangeOrNullObject(true).load("rowIndex,rowCount");
          await ctx.sync();
          const top = nextTableTop(used.isNullObject ? null : used.rowIndex + used.rowCount - 1);
          const def = TABLES[name];
          const bodyRows = name === "Объект" ? OBJECT_FIELDS.length : 1;
          if (sheet.tables.length > 1) ws.getRangeByIndexes(top - 1, 0, 1, 1).values = [[TABLE_TITLES[name] ?? name]];
          const t = ws.tables.add(ws.getRangeByIndexes(top, 0, 1 + bodyRows, def.columns.length), true);
          t.name = name;
          t.style = "TableStyleLight9";
          const headers = def.columns.map((c) => c.header);
          t.getHeaderRowRange().values = [headers];
          this.formatTable(t, def, important[name] ?? [], top + 2, bodyRows, headers);
          if (name === "Объект") {
            t.getDataBodyRange().getColumn(0).values = OBJECT_FIELDS.map((f) => [f.label]);
            this.objectPrompts(t, OBJECT_FIELDS.map((f) => f.label), 0);
          }
          await ctx.sync();
          created.push(name);
        }
        if (fresh) ws.freezePanes.freezeRows(sheet.tables.length > 1 ? 0 : 4);
      }
      await ctx.sync();
    });
    await this.setSetting(VERSION_SETTING, String(SCHEMA_VERSION));
    return created;
  }

  /** Подсказки ячеек «Значение» строк «Объекта» начиная с first. */
  private objectPrompts(t: any, labels: string[], first: number) {
    const values = t.getDataBodyRange().getColumn(1);
    labels.forEach((label, k) => {
      const f = OBJECT_FIELDS.find((x) => x.label === label);
      if (!f) return;
      values.getCell(first + k, 0).dataValidation.prompt = { showPrompt: true, ...promptFor({ ...TABLES["Объект"].columns[1], header: f.label, hint: f.hint }) };
    });
  }

  /** Существующая таблица: недостающие столбцы — в конец, недостающие поля «Объекта» — строками; правила — заново. */
  private async upgradeTable(ctx: any, name: TableName, important: string[]) {
    const def = TABLES[name];
    const t = ctx.workbook.tables.getItem(name);
    const head = t.getHeaderRowRange().load("values");
    const body = t.getDataBodyRange().load(name === "Объект" ? "rowIndex,rowCount,values" : "rowIndex,rowCount");
    await ctx.sync();
    const headers = (head.values[0] as unknown[]).map(String);
    const add = missingColumns(name, headers);
    for (const col of add) t.columns.add(null, null, col.header);
    if (add.length) await ctx.sync();
    const all = [...headers, ...add.map((c) => c.header)];
    for (const col of add) this.formatColumn(t, def, col, all.indexOf(col.header), body.rowCount);
    // Проверка данных и подсказки всех столбцов — заново: чинит списки, унаследованные дописанными столбцами в 0.8.
    for (const col of def.columns) {
      const i = all.indexOf(col.header);
      if (i >= 0 && !add.includes(col) && (def.name !== "Объект" || col.key !== "value"))
        applyValidation(t.columns.getItemAt(i).getDataBodyRange(), col, def.name);
    }
    if (add.length) {
      const h = t.getHeaderRowRange();
      h.format.font.bold = true;
      h.format.font.color = COLORS.headerText;
      h.format.wrapText = true;
    }
    if (name === "Объект") {
      const fi = headers.indexOf("Поле");
      const labels = (body.values as unknown[][]).map((r) => String(r[fi] ?? ""));
      const missing = missingObjectFields(labels);
      if (missing.length && fi >= 0) {
        const first = await this.addTableRows(ctx, t, body.rowCount, missing.map((l) => all.map((_, i) => (i === fi ? l : ""))));
        this.objectPrompts(t, missing, first);
      }
    }
    this.paint(t, def, important, body.rowIndex + 1, all);
    await ctx.sync();
  }
  /** Скрытый лист «Списки» с именованными диапазонами для перечислений (роль, тип, вид). */
  private async ensureLists(ctx: any, sheetNames: Set<string>) {
    const ws = sheetNames.has(LISTS_SHEET) ? ctx.workbook.worksheets.getItem(LISTS_SHEET) : ctx.workbook.worksheets.add(LISTS_SHEET);
    const enums = TABLE_NAMES.flatMap((t) => TABLES[t].columns.filter((c) => c.type === "enum").map((col) => ({ t, col })));
    const names = ctx.workbook.names;
    names.load("items/name");
    await ctx.sync();
    const existing = new Set((names.items as any[]).map((n) => n.name));
    const ranges: { name: string; range: any }[] = [];
    enums.forEach(({ t, col }, i) => {
      const values = col.values!.map((v) => [v]);
      const range = ws.getRangeByIndexes(0, i, values.length, 1);
      range.values = values;
      if (!existing.has(listName(t, col))) names.add(listName(t, col), range);
      // В новой версии в перечислении могут прибавиться значения («АВК» в «Виде» реестра) — расширяем диапазон имени.
      else ranges.push({ name: listName(t, col), range: range.load("address") });
    });
    if (ranges.length) {
      await ctx.sync();
      for (const r of ranges) names.getItem(r.name).formula = `=${r.range.address}`;
    }
    ws.visibility = "Hidden";
    await ctx.sync();
  }

  private formatColumn(t: any, def: (typeof TABLES)[TableName], col: ColumnDef, i: number, bodyRows: number) {
    const fill = (v: string) => Array.from({ length: Math.max(bodyRows, 1) }, () => [v]);
    const body = t.columns.getItemAt(i).getDataBodyRange();
    body.format.columnWidth = (col.width ?? 16) * 7;
    body.format.wrapText = col.type === "longtext" || (col.width ?? 16) >= 40;
    if (bodyRows > 0) {
      if (col.type === "date") body.numberFormat = fill("dd.mm.yyyy");
      if (textFormatted(col)) body.numberFormat = fill("@");
      if (col.type === "formula" && col.formula) body.formulas = fill(col.formula);
    }
    if (def.name !== "Объект" || col.key !== "value") applyValidation(body, col, def.name);
  }

  private formatTable(t: any, def: (typeof TABLES)[TableName], important: string[], firstRow: number, bodyRows: number, headers: string[]) {
    def.columns.forEach((col) => {
      const i = headers.indexOf(col.header);
      if (i >= 0) this.formatColumn(t, def, col, i, bodyRows);
    });
    const head = t.getHeaderRowRange();
    head.format.font.bold = true;
    head.format.font.color = COLORS.headerText;
    head.format.wrapText = true;
    head.format.rowHeight = 42;
    this.paint(t, def, important, firstRow, headers);
  }

  /** Цвета заголовков и правила «пусто в важном столбце» / «повтор ключа». headers — порядок столбцов в книге
   *  (в книге прежней версии дописанные столбцы стоят в конце). */
  private paint(t: any, def: (typeof TABLES)[TableName], important: string[], firstRow: number, headers: string[]) {
    const body = t.getDataBodyRange();
    body.conditionalFormats.clearAll();
    // Формулы правил пишутся для первой ячейки диапазона (таблицы начинаются со столбца A); firstRow — с 1.
    const last = headers.length - 1;
    const exIdx = headers.indexOf(exampleColumn(def.name).header);
    if (exIdx >= 0) {
      const ex = body.conditionalFormats.add("Custom");
      ex.custom.rule.formula = exampleRule(colLetter(exIdx), firstRow);
      ex.custom.format.font.color = COLORS.example;
      ex.custom.format.font.italic = true;
    }
    def.columns.forEach((col: ColumnDef) => {
      const i = headers.indexOf(col.header);
      if (i < 0) return;
      const headCell = t.getHeaderRowRange().getCell(0, i);
      headCell.format.fill.color = important.includes(col.header) ? COLORS.important : col.service ? COLORS.service : COLORS.header;
      const range = t.columns.getItemAt(i).getDataBodyRange();
      if (important.includes(col.header) && col.type !== "formula") {
        const cf = range.conditionalFormats.add("Custom");
        cf.custom.rule.formula = def.name === "Объект" && col.key === "value"
          ? objectImportantRule(colLetter(headers.indexOf("Поле")), colLetter(i), firstRow, OBJECT_REQUIRED_LABELS)
          : importantRule(colLetter(0), colLetter(last), colLetter(i), firstRow);
        cf.custom.format.fill.color = COLORS.empty;
      }
      if (def.name === "Спецификация" && col.key === "rest") {
        const cf = range.conditionalFormats.add("Custom");
        cf.custom.rule.formula = negativeRule(colLetter(i), firstRow);
        cf.custom.format.fill.color = COLORS.duplicate;
      }
      if (keyColumn(def.name)?.header === col.header && !def.allowDuplicates) {
        const cf = range.conditionalFormats.add("Custom");
        cf.custom.rule.formula = duplicateRule(colLetter(i), firstRow, LAST_RULE_ROW);
        cf.custom.format.fill.color = COLORS.duplicate;
      }
    });
  }

  /** Перекраска заголовков и правил по карте важных столбцов (для всех таблиц книги). */
  async applyImportant(map: ImportantMap) {
    await Excel.run(async (ctx: any) => {
      ctx.workbook.tables.load("items/name");
      await ctx.sync();
      const ours = (ctx.workbook.tables.items as any[]).filter((t) => isOurs(t.name))
        .map((t) => ({ t, body: t.getDataBodyRange().load("rowIndex"), head: t.getHeaderRowRange().load("values") }));
      await ctx.sync();
      for (const { t, body, head } of ours)
        this.paint(t, TABLES[t.name as TableName], map[t.name as TableName] ?? [], body.rowIndex + 1, (head.values[0] as unknown[]).map(String));
      await ctx.sync();
    });
  }
}
