// 0.31: настройки документа и отчётные листы.
import type { Report } from "@idk/shared/workbook/store";
import { COLORS } from "../layout.ts";
import { settings, saveSettings } from "./common.ts";

declare const Excel: any;

export async function setting(key: string): Promise<string | null> {
  const v = settings().get(key);
  return v === null || v === undefined ? null : String(v);
}

export async function setSetting(key: string, value: string) {
  settings().set(key, value);
  await saveSettings();
}

/** Отчётный лист: создаётся при первом вызове, иначе очищается и заполняется заново. */
export async function writeReport(report: Report) {
  await Excel.run(async (ctx: any) => {
    let ws = ctx.workbook.worksheets.getItemOrNullObject(report.sheet);
    await ctx.sync();
    if (ws.isNullObject) ws = ctx.workbook.worksheets.add(report.sheet);
    else ws.getRange().clear();
    const width = Math.max(1, ...report.rows.map((r) => r.length));
    const values = report.rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
    const all = ws.getRangeByIndexes(0, 0, values.length, width);
    for (const c of report.text) if (c < width) ws.getRangeByIndexes(0, c, values.length, 1).numberFormat = values.map(() => ["@"]);
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
    report.widths.forEach((w, c) => {
      ws.getRangeByIndexes(0, c, 1, 1).format.columnWidth = w * 7;
    });
    ws.getRangeByIndexes(1, 1, Math.max(1, values.length - 1), 1).format.wrapText = true;
    ws.freezePanes.freezeRows(1);
    ws.activate();
    await ctx.sync();
  });
}
