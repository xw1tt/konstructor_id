// 0.31: перенос книги прежней версии (план 31) — старые «Спецификация» и «ДокументыКачества» в «Материалы».
import { SHEETS } from "@idk/shared/workbook/schema";
import type { TableData } from "@idk/shared/workbook/store";
import { planMerge } from "@idk/shared/workbook/mergeOld";
import { BACKUP_SHEET, type MergeReport, type OldTables } from "./common.ts";
import { rawInsert, rawRead, rawWrite } from "./rows.ts";

declare const Excel: any;

/**
 * План 31: книга прежней версии — таблицы «Спецификация» и «ДокументыКачества» читаются, копируются значениями на
 * скрытый лист-архив и удаляются (до дописывания столбцов в «Материалы»: в 0.26 документы стояли справа от них).
 */
export async function takeOldTables(): Promise<OldTables | null> {
  const spec = await rawRead("Спецификация");
  const docs = await rawRead("ДокументыКачества");
  if (!spec && !docs) return null;
  const sheets: string[] = [];
  await Excel.run(async (ctx: any) => {
    const book = ctx.workbook;
    let ws = book.worksheets.getItemOrNullObject(BACKUP_SHEET);
    await ctx.sync();
    if (ws.isNullObject) ws = book.worksheets.add(BACKUP_SHEET);
    else ws.getRange().clear();
    // Значения и адреса сканов (отдельным столбцом), таблицы — одна под другой.
    const block = (t: TableData) => [
      [t.name, ...t.headers.map(() => "")],
      [...t.headers, "Адрес скана"],
      ...t.rows.map((r, i) => [...r.map((v) => v ?? ""), t.links[i]?.find((l) => l) ?? ""]),
      [],
    ];
    const width = Math.max(...[spec, docs].filter(Boolean).map((t) => t!.headers.length + 1));
    const rows = [spec, docs]
      .filter(Boolean)
      .flatMap((t) => block(t!))
      .map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
    const range = ws.getRangeByIndexes(0, 0, rows.length, width);
    range.numberFormat = rows.map((r) => r.map(() => "@"));
    range.values = rows.map((r) => r.map((v) => (typeof v === "number" ? v : String(v))));
    await ctx.sync();
    for (const t of [spec, docs]) {
      if (!t) continue;
      const tb = book.tables.getItem(t.name);
      tb.worksheet.load("name");
      const all = tb.getRange().load("rowIndex,columnIndex,rowCount,columnCount");
      await ctx.sync();
      sheets.push(tb.worksheet.name);
      const ows = tb.worksheet;
      tb.delete();
      // С подписью над таблицей (на листах с несколькими таблицами).
      ows.getRangeByIndexes(Math.max(all.rowIndex - 1, 0), all.columnIndex, all.rowCount + 1, all.columnCount).clear();
      await ctx.sync();
    }
    ws.visibility = "Hidden";
    await ctx.sync();
  });
  return { spec, docs, sheets };
}

/** План 31: строки старых таблиц — в «Материалы» (поля позиции РКЦ и группы «Док.N»); опустевшие старые листы — прочь. */
export async function mergeOld(old: OldTables): Promise<MergeReport | null> {
  const mat = await rawRead("Материалы");
  if (!mat) return null;
  const plan = planMerge(mat, old.spec, old.docs);
  for (const u of plan.updates) await rawWrite("Материалы", u.row, u.values, u.links);
  if (plan.appended.length) {
    const first = await rawInsert(
      "Материалы",
      mat.rows.length,
      plan.appended.map((a) => a.values),
    );
    for (const [i, a] of plan.appended.entries())
      if (Object.keys(a.links).length)
        await rawWrite("Материалы", first + i, Object.fromEntries(Object.keys(a.links).map((h) => [h, a.values[h] ?? null])), a.links);
  }
  await Excel.run(async (ctx: any) => {
    for (const name of [...new Set(old.sheets)]) {
      if (SHEETS.some((x) => x.name === name)) continue;
      const ws = ctx.workbook.worksheets.getItemOrNullObject(name);
      await ctx.sync();
      if (ws.isNullObject) continue;
      ws.tables.load("count");
      const used = ws.getUsedRangeOrNullObject(true);
      await ctx.sync();
      // Лист без таблиц и данных — удаляем; что-то своё на нём осталось — не трогаем.
      if (ws.tables.count === 0 && used.isNullObject) ws.delete();
      await ctx.sync();
    }
  });
  return { docs: plan.docs, positions: plan.positions, problems: plan.problems, backup: BACKUP_SHEET };
}
