// 0.31: видимость и переключение листов.
declare const Excel: any;

/** План 17: видимость листов конструктора; активный лист, который надо скрыть, сначала сменяется первым видимым. */
export async function setSheetsVisible(visible: readonly string[], hidden: readonly string[]) {
  await Excel.run(async (ctx: any) => {
    const sheets = ctx.workbook.worksheets.load("items/name");
    const active = ctx.workbook.worksheets.getActiveWorksheet().load("name");
    await ctx.sync();
    const present = new Set((sheets.items as any[]).map((w) => w.name as string));
    for (const n of visible) if (present.has(n)) ctx.workbook.worksheets.getItem(n).visibility = "Visible";
    await ctx.sync();
    const first = visible.find((n) => present.has(n));
    if (hidden.includes(active.name) && first) ctx.workbook.worksheets.getItem(first).activate();
    for (const n of hidden) if (present.has(n)) ctx.workbook.worksheets.getItem(n).visibility = "Hidden";
    await ctx.sync();
  });
}

export async function activateSheet(name: string) {
  await Excel.run(async (ctx: any) => {
    const ws = ctx.workbook.worksheets.getItem(name);
    // Лист мог быть скрыт «Только нужными листами» (план 17): переход из раздела панели его показывает.
    ws.visibility = "Visible";
    ws.activate();
    await ctx.sync();
  });
}
