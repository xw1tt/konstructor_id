// 0.31: разметка книги — листы, таблицы, недостающие столбцы и поля «Объекта», лист «Списки».
import { TABLES, SHEETS, OBJECT_FIELDS, SCHEMA_VERSION, WORK_LIST, type TableName } from "@idk/shared/workbook/schema";
import type { ImportantMap } from "@idk/shared/workbook/important";
import { COLORS, LISTS_SHEET, applyValidation, listName, promptFor, nextTableTop, missingColumns, missingObjectFields } from "../layout.ts";
import { REAL_TABLES, TABLE_TITLES, VERSION_SETTING, workListColumn, type MergeReport } from "./common.ts";
import { addTableRows } from "./rows.ts";
import { setting, setSetting } from "./settings.ts";
import { mergeOld, takeOldTables } from "./migrate.ts";
import { formatColumn, formatTable, paint } from "./paint.ts";

declare const Excel: any;

// ---------- Разметка ----------

/** Создаёт недостающие листы и таблицы; в существующие (книга прежней версии) дописывает недостающие
 *  столбцы и поля «Объекта» и перекрашивает правила всех таблиц. Возвращает созданные таблицы. */
export async function ensureBook(important: ImportantMap): Promise<{ created: TableName[]; merge: MergeReport | null }> {
  const created: TableName[] = [];
  // План 31: старые «Спецификация» и «ДокументыКачества» — в архив и прочь, их строки потом сводятся в «Материалы».
  const old = await takeOldTables();
  // 0.27.4: в книгах 0.27–0.27.3 «Закрыто» и «Остаток» «Материалов» — формулы текстом, перенесённые строки — с
  // оформлением заголовка. Чинится один раз: оформление тела таблицы — заново, формулы — в формат «Общий».
  const was = Number(await setting(VERSION_SETTING));
  const repair = was >= 13 && was < 14;
  await Excel.run(async (ctx: any) => {
    const sheets = ctx.workbook.worksheets;
    sheets.load("items/name");
    ctx.workbook.tables.load("items/name");
    await ctx.sync();
    const sheetNames = new Set((sheets.items as any[]).map((s) => s.name));
    const tableNames = new Set((ctx.workbook.tables.items as any[]).map((t) => t.name));

    await ensureLists(ctx, sheetNames);

    for (const sheet of SHEETS) {
      const fresh = !sheetNames.has(sheet.name);
      const ws = fresh ? sheets.add(sheet.name) : sheets.getItem(sheet.name);
      for (const name of sheet.tables) {
        if (TABLES[name].virtual) continue;
        if (tableNames.has(name)) {
          await upgradeTable(ctx, name, important[name] ?? [], repair);
          continue;
        }
        // Новая таблица — ниже занятой части листа, чтобы не наложиться на существующие (в т. ч. переименованные);
        // на листе «рядом» — справа от предыдущей таблицы листа, на той же строке заголовка.
        const def = TABLES[name];
        let top: number,
          left = 0;
        const prevName = sheet.side
          ? sheet.tables
              .slice(0, sheet.tables.indexOf(name))
              .reverse()
              .find((x) => tableNames.has(x) || created.includes(x))
          : undefined;
        if (prevName) {
          const pr = ctx.workbook.tables.getItem(prevName).getHeaderRowRange().load("rowIndex,columnIndex,columnCount");
          await ctx.sync();
          top = pr.rowIndex;
          left = pr.columnIndex + pr.columnCount + 1;
        } else {
          const used = ws.getUsedRangeOrNullObject(true).load("rowIndex,rowCount");
          await ctx.sync();
          top = nextTableTop(used.isNullObject ? null : used.rowIndex + used.rowCount - 1);
        }
        const bodyRows = name === "Объект" ? OBJECT_FIELDS.length : 1;
        if (sheet.tables.length > 1) {
          const title = ws.getRangeByIndexes(top - 1, left, 1, 1);
          title.values = [[TABLE_TITLES[name] ?? name]];
          title.format.font.bold = true;
        }
        const t = ws.tables.add(ws.getRangeByIndexes(top, left, 1 + bodyRows, def.columns.length), true);
        t.name = name;
        t.style = "TableStyleLight9";
        const headers = def.columns.map((c) => c.header);
        t.getHeaderRowRange().values = [headers];
        formatTable(t, def, important[name] ?? [], top + 2, bodyRows, headers, left);
        if (name === "Объект") {
          t.getDataBodyRange().getColumn(0).values = OBJECT_FIELDS.map((f) => [f.label]);
          objectPrompts(
            t,
            OBJECT_FIELDS.map((f) => f.label),
            0,
          );
        }
        await ctx.sync();
        created.push(name);
      }
      if (fresh) ws.freezePanes.freezeRows(sheet.tables.length > 1 && !sheet.side ? 0 : 4);
    }
    await ctx.sync();
  });
  const merge = old ? await mergeOld(old) : null;
  await setSetting(VERSION_SETTING, String(SCHEMA_VERSION));
  return { created, merge };
}

/** Подсказки ячеек «Значение» строк «Объекта» начиная с first. */
export function objectPrompts(t: any, labels: string[], first: number) {
  const values = t.getDataBodyRange().getColumn(1);
  labels.forEach((label, k) => {
    const f = OBJECT_FIELDS.find((x) => x.label === label);
    if (!f) return;
    values.getCell(first + k, 0).dataValidation.prompt = {
      showPrompt: true,
      ...promptFor({ ...TABLES["Объект"].columns[1], header: f.label, hint: f.hint }),
    };
  });
}

/** Существующая таблица: недостающие столбцы — в конец, недостающие поля «Объекта» — строками; правила — заново. */
export async function upgradeTable(ctx: any, name: TableName, important: string[], repair = false) {
  const def = TABLES[name];
  const t = ctx.workbook.tables.getItem(name);
  const head = t.getHeaderRowRange().load("values");
  const body = t.getDataBodyRange().load(name === "Объект" ? "rowIndex,rowCount,columnIndex,values" : "rowIndex,rowCount,columnIndex");
  await ctx.sync();
  const headers = (head.values[0] as unknown[]).map(String);
  const add = missingColumns(name, headers);
  for (const col of add) t.columns.add(null, null, col.header);
  if (add.length) await ctx.sync();
  const all = [...headers, ...add.map((c) => c.header)];
  for (const col of add) formatColumn(t, def, col, all.indexOf(col.header), body.rowCount);
  if (repair && name === "Материалы") {
    // Значения не трогаются: снимается только прямое оформление тела, затем форматы столбцов — заново.
    t.getDataBodyRange().clear("Formats");
    for (const col of def.columns) if (!add.includes(col) && all.includes(col.header)) formatColumn(t, def, col, all.indexOf(col.header), body.rowCount);
    t.getDataBodyRange().format.autofitRows();
  }
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
      const first = await addTableRows(
        ctx,
        t,
        body.rowCount,
        missing.map((l) => all.map((_, i) => (i === fi ? l : ""))),
      );
      objectPrompts(t, missing, first);
    }
  }
  paint(t, def, important, body.rowIndex + 1, all, body.columnIndex);
  await ctx.sync();
}
/** Виды работ из справочника шаблона → столбец листа «Списки» и имя «ВидыРабот» (источник списка «Вида работ»). */
export async function writeWorkList(names: string[]) {
  await Excel.run(async (ctx: any) => {
    const sheets = ctx.workbook.worksheets;
    sheets.load("items/name");
    await ctx.sync();
    const sheetNames = new Set<string>((sheets.items as any[]).map((w) => w.name));
    await ensureLists(ctx, sheetNames);
    const ws = ctx.workbook.worksheets.getItem(LISTS_SHEET);
    const col = workListColumn();
    ws.getRangeByIndexes(0, col, 1, 1).getEntireColumn().clear("Contents");
    const values = names.length ? names.map((n) => [n]) : [[""]];
    const range = ws.getRangeByIndexes(0, col, values.length, 1);
    range.values = values;
    range.load("address");
    await ctx.sync();
    ctx.workbook.names.getItem(WORK_LIST).formula = `=${range.address}`;
    await ctx.sync();
  });
}

/** Скрытый лист «Списки» с именованными диапазонами для перечислений (роль, тип, вид). */
export async function ensureLists(ctx: any, sheetNames: Set<string>) {
  const ws = sheetNames.has(LISTS_SHEET) ? ctx.workbook.worksheets.getItem(LISTS_SHEET) : ctx.workbook.worksheets.add(LISTS_SHEET);
  const enums = REAL_TABLES.flatMap((t) => TABLES[t].columns.filter((c) => c.type === "enum").map((col) => ({ t, col })));
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
  // «ВидыРабот» — заготовка в одну пустую ячейку, чтобы проверка данных «Вида работ» не ссылалась на несуществующее имя;
  // значения пишет writeWorkList из справочника шаблона.
  if (!existing.has(WORK_LIST)) names.add(WORK_LIST, ws.getRangeByIndexes(0, workListColumn(), 1, 1));
  ws.visibility = "Hidden";
  await ctx.sync();
}
