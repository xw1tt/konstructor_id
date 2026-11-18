// 0.31: чтение, запись, вставка и удаление строк таблиц Excel (и строк листа вне таблиц).
import { TABLES, type TableName } from "@idk/shared/workbook/schema";
import type { CellValue } from "@idk/shared/workbook/values";
import type { RowData, RowsTarget, TableData } from "@idk/shared/workbook/store";
import { isOurs, sideBySide } from "./common.ts";

declare const Excel: any;

export async function rawRead(name: TableName): Promise<TableData | null> {
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
    const fileCols = TABLES[name].columns
      .filter((c) => c.type === "file")
      .map((c) => headers.indexOf(c.header))
      .filter((i) => i >= 0);
    if (fileCols.length && rows.length) {
      const cells = rows.flatMap((_, ri) => fileCols.map((ci) => ({ ri, ci, cell: body.getCell(ri, ci).load("hyperlink") })));
      await ctx.sync();
      for (const { ri, ci, cell } of cells) links[ri][ci] = cell.hyperlink?.address ?? null;
    }
    return { name, headers, rows, links };
  });
}

/** Все таблицы одним Excel.run: значения — одним sync, гиперссылки столбцов «файл» всех таблиц — вторым (план 15). */
export async function rawReadMany(names: readonly TableName[]): Promise<Map<TableName, TableData | null>> {
  return Excel.run(async (ctx: any) => {
    const all = ctx.workbook.tables.load("items/name");
    await ctx.sync();
    const present = new Set((all.items as any[]).map((t) => t.name as string));
    const parts = names
      .filter((n) => present.has(n))
      .map((name) => {
        const t = ctx.workbook.tables.getItem(name);
        return { name, head: t.getHeaderRowRange().load("values"), body: t.getDataBodyRange().load("values,rowCount") };
      });
    await ctx.sync();
    const out = new Map<TableName, TableData | null>(names.map((n) => [n, null]));
    const cells: { links: (string | null)[][]; ri: number; ci: number; cell: any }[] = [];
    for (const { name, head, body } of parts) {
      const headers = (head.values[0] as unknown[]).map(String);
      const rows = (body.values as CellValue[][]).map((r) => r.map((v) => (v === "" ? null : v)));
      const links: (string | null)[][] = rows.map((r) => r.map(() => null));
      const fileCols = TABLES[name].columns
        .filter((c) => c.type === "file")
        .map((c) => headers.indexOf(c.header))
        .filter((i) => i >= 0);
      if (rows.length)
        for (let ri = 0; ri < rows.length; ri++) for (const ci of fileCols) cells.push({ links, ri, ci, cell: body.getCell(ri, ci).load("hyperlink") });
      out.set(name, { name, headers, rows, links });
    }
    if (cells.length) {
      await ctx.sync();
      for (const { links, ri, ci, cell } of cells) links[ri][ci] = cell.hyperlink?.address ?? null;
    }
    return out;
  });
}

export async function rawWrite(name: TableName, row: number, values: Record<string, CellValue>, links: Record<string, string | null> = {}) {
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

export async function rawInsert(name: TableName, at: number, rows: Record<string, CellValue>[]): Promise<number> {
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
        if (values.length > 1) await addTableRows(ctx, t, 1, values.slice(1));
        await ctx.sync();
        return 0;
      }
    }
    return addTableRows(ctx, t, index, values);
  });
}

/**
 * Вставка строк в таблицу через вставку целых строк листа. table.rows.add сдвигает вниз только столбцы
 * таблицы, и Excel отказывает («Недопустимая операция… переместить ячейки таблицы»), если ниже стоит
 * более широкая таблица (на «Реквизитах» под «Объектом» — «Организации»). Целые строки листа сдвигают
 * нижние таблицы целиком; вставка внутри таблицы её расширяет. Возвращает индекс первой новой строки.
 */
export async function addTableRows(ctx: any, t: any, index: number, values: unknown[][]): Promise<number> {
  const body = t.getDataBodyRange().load("rowIndex,rowCount,columnIndex,columnCount");
  const head = t.getHeaderRowRange().load("values");
  const ws = t.worksheet;
  t.load("name");
  await ctx.sync();
  const n = values.length,
    count = body.rowCount as number;
  const append = index >= count;
  // В конец: вставляем перед последней строкой (внутри таблицы), затем последнюю строку поднимаем на место.
  const at = append ? count - 1 : index;
  const rowsAt = (i: number, k = 1) => ws.getRangeByIndexes(body.rowIndex + i, body.columnIndex, k, body.columnCount);
  if (sideBySide(t.name as TableName)) rowsAt(at, n).insert("Down");
  else
    ws.getRangeByIndexes(body.rowIndex + at, 0, n, 1)
      .getEntireRow()
      .insert("Down");
  await ctx.sync();
  let first = at;
  // Вставленные строки листа Excel оформляет как строку выше — над первой строкой данных это заголовок (тёмная
  // заливка, белый жирный шрифт): оформление новых строк — с прежней строки таблицы.
  if (append) {
    rowsAt(at).copyFrom(rowsAt(at + n), "All");
    first = count;
    const target = rowsAt(first, n);
    target.clear("Contents");
    target.clear("Hyperlinks");
    for (let i = 0; i < n - 1; i++) rowsAt(first + i).copyFrom(rowsAt(at), "Formats");
  } else {
    for (let i = 0; i < n; i++) rowsAt(at + i).copyFrom(rowsAt(at + n), "Formats");
  }
  // Формулы — в ячейки формата «Общий»: в текстовом формате Excel показывает формулу текстом.
  const headers = (head.values[0] as unknown[]).map(String);
  const def = isOurs(t.name) ? TABLES[t.name as TableName] : null;
  const fcols = def ? headers.map((h, i) => (def.columns.find((c) => c.header === h)?.type === "formula" ? i : -1)).filter((i) => i >= 0) : [];
  for (const i of fcols) ws.getRangeByIndexes(body.rowIndex + first, body.columnIndex + i, n, 1).numberFormat = values.map(() => ["General"]);
  rowsAt(first, n).values = values;
  await ctx.sync();
  return first;
}

export async function rawRemove(name: TableName, rows: number[]) {
  await Excel.run(async (ctx: any) => {
    const t = ctx.workbook.tables.getItem(name);
    t.rows.load("count");
    const body = t.getDataBodyRange().load("rowIndex,columnIndex,columnCount");
    await ctx.sync();
    let count = t.rows.count as number;
    const side = sideBySide(name);
    for (const r of [...new Set(rows)].filter((x) => x >= 0 && x < count).sort((a, b) => b - a)) {
      // Последнюю строку таблицы Excel удалить не даст — очищаем её (кроме формул).
      if (count === 1) await clearRow(ctx, name, t, r);
      else {
        // Целая строка листа: удаление строки таблицы сдвинуло бы только её столбцы (см. addTableRows).
        if (side) t.worksheet.getRangeByIndexes(body.rowIndex + r, body.columnIndex, 1, body.columnCount).delete("Up");
        else
          t.worksheet
            .getRangeByIndexes(body.rowIndex + r, 0, 1, 1)
            .getEntireRow()
            .delete("Up");
        count--;
      }
    }
    await ctx.sync();
  });
}

export async function clearRow(ctx: any, name: TableName, t: any, row: number) {
  const head = t.getHeaderRowRange().load("values");
  await ctx.sync();
  (head.values[0] as unknown[]).map(String).forEach((h, i) => {
    if (TABLES[name].columns.find((c) => c.header === h)?.type === "formula") return;
    t.getDataBodyRange().getCell(row, i).clear("Contents");
  });
}

// ---------- Строки листа вне таблиц ----------

export function sheetRows(sheet: string): RowsTarget {
  const run = <T>(fn: (ctx: any, ws: any) => Promise<T>) => Excel.run((ctx: any) => fn(ctx, ctx.workbook.worksheets.getItem(sheet)));
  const width = async (ctx: any, ws: any) => {
    const used = ws.getUsedRangeOrNullObject(true).load("columnIndex,columnCount,rowIndex,rowCount");
    await ctx.sync();
    return used.isNullObject ? { cols: 1, rows: 0 } : { cols: used.columnIndex + used.columnCount, rows: used.rowIndex + used.rowCount };
  };
  return {
    count: () => run(async (ctx, ws) => (await width(ctx, ws)).rows),
    read: (row) =>
      run(async (ctx, ws): Promise<RowData> => {
        const { cols } = await width(ctx, ws);
        const r = ws.getRangeByIndexes(row, 0, 1, cols).load("formulas");
        await ctx.sync();
        return { values: r.formulas[0] as CellValue[], links: [] };
      }),
    write: (row, d) =>
      run(async (ctx, ws) => {
        if (!d.values.length) return;
        ws.getRangeByIndexes(row, 0, 1, d.values.length).formulas = [d.values.map((v) => v ?? "")];
        await ctx.sync();
      }),
    insertBlank: (at, n) =>
      run(async (ctx, ws) => {
        ws.getRange(`${at + 1}:${at + n}`).insert("Down");
        await ctx.sync();
        return at;
      }),
    remove: (rows) =>
      run(async (ctx, ws) => {
        for (const r of [...new Set(rows)].sort((a, b) => b - a)) ws.getRange(`${r + 1}:${r + 1}`).delete("Up");
        await ctx.sync();
      }),
  };
}

/** Отфильтрована ли таблица Excel. */
export async function isFiltered(name: TableName): Promise<boolean> {
  return Excel.run(async (ctx: any) => {
    const f = ctx.workbook.tables.getItem(name).autoFilter.load("isDataFiltered");
    await ctx.sync();
    return !!f.isDataFiltered;
  });
}

export async function clearFilters(name: TableName) {
  await Excel.run(async (ctx: any) => {
    ctx.workbook.tables.getItem(name).clearFilters();
    await ctx.sync();
  });
}

/** Номер строки листа (с 1) первой строки данных таблицы Excel. */
export async function tableSheetOffset(name: TableName): Promise<number> {
  return Excel.run(async (ctx: any) => {
    const body = ctx.workbook.tables.getItem(name).getDataBodyRange().load("rowIndex");
    await ctx.sync();
    return body.rowIndex + 1;
  });
}
