// 0.31: выделение, переходы, фильтр и события книги.
import type { TableName } from "@idk/shared/workbook/schema";
import type { CellValue } from "@idk/shared/workbook/values";
import { physicalHeader, type VirtualTable } from "@idk/shared/workbook/virtual";
import { visibleTableRows } from "../layout.ts";
import { locate, type ChangeEvent, type Located, type Selection } from "./common.ts";

declare const Excel: any;

/** Виртуальные таблицы (план 31): где лежит строка в Excel. */
export interface VirtualMap {
  isVirtual(name: TableName): Promise<boolean>;
  physical(name: TableName, row: number, header: string | null): Promise<{ table: TableName; row: number; column: string | null } | null>;
}

// ---------- Выделение и навигация ----------

/** Пишет в выделенную ячейку (левую верхнюю) значение fn(текущее); null от fn — ничего не писать. */
export async function writeActiveCell(fn: (current: CellValue) => CellValue | null): Promise<{ written: boolean }> {
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

export async function getSelection(): Promise<Selection> {
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
      ? []
      : (visible.areas.items as any[]).map((a) => ({ rowIndex: a.rowIndex, rowCount: a.rowCount }));
    const sheetRows = areas.length ? visibleTableRows(areas, 0, 1_048_576) : [active.rowIndex];
    let rows: number[] = loc.row !== null ? [loc.row] : [];
    if (loc.table) {
      const body = ctx.workbook.tables.getItem(loc.table).getDataBodyRange().load("rowIndex,rowCount");
      await ctx.sync();
      const vis = visibleTableRows(areas, body.rowIndex, body.rowCount);
      if (vis.length) rows = vis;
    }
    return {
      sheet: ws.name,
      table: loc.table,
      row: loc.row,
      column: loc.column,
      rows,
      sheetRow: active.rowIndex,
      sheetCol: active.columnIndex,
      sheetRows,
    };
  });
}

export async function selectCell(store: VirtualMap, table: TableName, row: number | null, header: string): Promise<void> {
  if (await store.isVirtual(table)) {
    const p = await store.physical(table, row ?? 0, header);
    if (p) return selectCell(store, p.table, p.row, p.column ?? header);
    table = "Материалы";
  }
  await Excel.run(async (ctx: any) => {
    const t = ctx.workbook.tables.getItem(table);
    const head = t.getHeaderRowRange().load("values");
    t.rows.load("count");
    t.worksheet.activate();
    await ctx.sync();
    const i = (head.values[0] as unknown[]).map(String).indexOf(header);
    if (i < 0) return;
    t.getDataBodyRange()
      .getCell(Math.min(Math.max(row ?? 0, 0), t.rows.count - 1), i)
      .select();
    await ctx.sync();
  });
}

export async function selectSheetCell(sheet: string, row: number, col: number) {
  await Excel.run(async (ctx: any) => {
    const ws = ctx.workbook.worksheets.getItem(sheet);
    ws.activate();
    ws.getCell(row, col).select();
    await ctx.sync();
  });
}

export async function filterBy(store: VirtualMap, table: TableName, header: string, value: string) {
  if (await store.isVirtual(table)) {
    header = physicalHeader(table as VirtualTable, header);
    table = "Материалы";
  }
  await Excel.run(async (ctx: any) => {
    const t = ctx.workbook.tables.getItem(table);
    t.worksheet.activate();
    t.clearFilters();
    t.columns.getItem(header).filter.applyValuesFilter([value]);
    await ctx.sync();
  });
}

// ---------- События ----------

export async function onSelection(cb: () => void): Promise<() => Promise<void>> {
  let handler: any, activated: any;
  await Excel.run(async (ctx: any) => {
    handler = ctx.workbook.worksheets.onSelectionChanged.add(async () => cb());
    // Переход на другой лист: выделение там не меняется, но панель должна сразу показать раздел листа.
    activated = ctx.workbook.worksheets.onActivated.add(async () => cb());
    await ctx.sync();
  });
  return () =>
    Excel.run(handler.context, async (ctx: any) => {
      handler.remove();
      activated.remove();
      await ctx.sync();
    });
}

export async function onChange(cb: (e: ChangeEvent) => void): Promise<() => Promise<void>> {
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
      } catch {
        /* лист мог быть удалён */
      }
      const norm = (v: unknown): CellValue => (v === undefined || v === "" ? null : (v as CellValue));
      cb({ ...loc, before: norm(e.details?.valueBefore), after: norm(e.details?.valueAfter), multi });
    });
    await ctx.sync();
  });
  return () =>
    Excel.run(handler.context, async (ctx: any) => {
      handler.remove();
      await ctx.sync();
    });
}
