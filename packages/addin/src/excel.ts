// Работа с листами Excel через Office.js. Вне Excel эти функции недоступны (inExcel() === false).
declare const Office: any;
declare const Excel: any;

export function inExcel(): boolean {
  return typeof Office !== "undefined" && typeof Excel !== "undefined" && !!Office?.context?.host;
}

/** Значения используемого диапазона активного листа как строки. */
export async function readActiveSheetUsedRange(): Promise<string[][]> {
  return Excel.run(async (ctx: any) => {
    const range = ctx.workbook.worksheets.getActiveWorksheet().getUsedRange(true);
    range.load("text");
    await ctx.sync();
    return (range.text as string[][]) ?? [];
  });
}

/** Создаёт новый лист (имя дополняется номером при совпадении) и записывает строки. */
export async function writeToNewSheet(name: string, rows: string[][]): Promise<void> {
  if (!rows.length) return;
  await Excel.run(async (ctx: any) => {
    const sheets = ctx.workbook.worksheets;
    sheets.load("items/name");
    await ctx.sync();
    const names = new Set((sheets.items as { name: string }[]).map((s) => s.name));
    let final = name;
    for (let i = 2; names.has(final); i++) final = `${name} (${i})`;
    const ws = sheets.add(final);
    const cols = rows[0].length;
    const range = ws.getRangeByIndexes(0, 0, rows.length, cols);
    range.numberFormat = rows.map((r) => r.map(() => "@"));
    range.values = rows;
    ws.getRangeByIndexes(0, 0, 1, cols).format.font.bold = true;
    range.format.autofitColumns();
    ws.activate();
    await ctx.sync();
  });
}
