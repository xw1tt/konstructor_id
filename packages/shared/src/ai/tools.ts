// План 19: инструменты помощника — описания для модели и исполнение на данных книги. Правки не применяются:
// каждое верное предложение становится «Предложением №N» для карточки «Предлагаемые изменения».
import type { ToolDef, ToolCall } from "./model.ts";
import { TABLES, TABLE_NAMES, column, type TableName } from "../workbook/schema.ts";
import { cellText } from "../workbook/values.ts";
import type { Book } from "../workbook/records.ts";
import type { ImportantMap } from "../workbook/important.ts";
import { buildBundle } from "../workbook/bundle.ts";
import type { Catalog } from "../catalog/model.ts";
import { completeness, actWorks } from "../catalog/need.ts";
import { docLabel, type UserTemplate } from "../forms/template.ts";
import { FORM_SET_LABELS } from "../templates.ts";
import { describeChange, isTable, showValue, toCell, validateChange, type BookChange } from "./changes.ts";
import { ojrRows } from "../ojr.ts";
import type { CellValue } from "../workbook/values.ts";
import type { NameMask } from "./mask.ts";

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const str = (description: string) => ({ type: "string", description });
const VALUES = { type: "object", description: "Значения по заголовкам столбцов: {\"Заголовок\": \"значение\"}. Даты — ДД.ММ.ГГГГ.", additionalProperties: true };

export const BOOK_TOOLS: ToolDef[] = [
  { name: "list_tables", description: "Таблицы книги объекта: лист, число строк и столбцы (тип, обязательность, список допустимых значений).", parameters: obj({}) },
  { name: "read_rows", description: "Строки таблицы книги с номерами (номер нужен для правок). Отбор — по тексту в столбце или во всей строке.",
    parameters: obj({ table: str("Таблица, как в list_tables"), column: str("Столбец для отбора (необязательно)"), contains: str("Текст для отбора (необязательно)"),
      offset: { type: "integer", description: "Пропустить строк" }, limit: { type: "integer", description: "Сколько строк (до 50, по умолчанию 20)" } }, ["table"]) },
  { name: "check_act", description: "Проверка акта: ошибки, мешающие печати (как при печати), и полнота документов по справочнику и шаблону.",
    parameters: obj({ act: str("Номер акта (столбец «Номер акта» таблицы «Акты»)") }, ["act"]) },
  { name: "get_catalog", description: "Справочник видов работ и документов (разделы, виды работ, коды документов). Отбор — по тексту.",
    parameters: obj({ query: str("Текст для отбора (необязательно)") }) },
  { name: "get_template", description: "Шаблон книги: название, набор форм, документы по порядку.", parameters: obj({}) },
  { name: "search_book", description: "Найти текст во всей книге (без учёта регистра, по части слова): где встречается фамилия, марка, номер и т. п. Возвращает таблицу, номер строки, столбец и значение.",
    parameters: obj({ text: str("Что искать, например «Беляц»"), table: str("Только в этой таблице (необязательно)") }, ["text"]) },
  { name: "check_ojr", description: "Сверить общий журнал работ с актами: раздел 3 (по датам: работы и подписант) или 5 (исполнительная документация) — чего не хватает, что лишнее, что отличается от «Заполнить из актов».",
    parameters: obj({ section: { type: "integer", enum: [3, 5], description: "Раздел журнала: 3 или 5" } }, ["section"]) },
  { name: "propose_replace", description: "Предложить заменить текст во всех ячейках, где он встречается (пользователь подтвердит одним предложением). Без учёта регистра; можно ограничить таблицей и столбцом.",
    parameters: obj({ find: str("Что заменить (точный текст, как в книге)"), replace: str("На что заменить"), table: str("Только в этой таблице (необязательно)"), column: str("Только в этом столбце (необязательно)") }, ["find", "replace"]) },
  { name: "propose_add_rows", description: "Предложить добавить строки в таблицу (пользователь подтвердит). Ссылки на другие таблицы — значением их ключевого столбца.",
    parameters: obj({ table: str("Таблица"), rows: { type: "array", items: VALUES, description: "Строки" } }, ["table", "rows"]) },
  { name: "propose_update", description: "Предложить изменить ячейки одной строки (пользователь подтвердит).",
    parameters: obj({ table: str("Таблица"), row: { type: "integer", description: "Номер строки из read_rows" }, values: VALUES }, ["table", "row", "values"]) },
  { name: "propose_delete", description: "Предложить удалить строки (пользователь подтвердит).",
    parameters: obj({ table: str("Таблица"), rows: { type: "array", items: { type: "integer" }, description: "Номера строк из read_rows" } }, ["table", "rows"]) },
];

/** Предложение не по книге (план 20): дополнения справочника, метки формы. */
export type ExtraChange =
  | { kind: "catalog"; add: import("../catalog/model.ts").UserCatalog }
  /** План 21: несколько правок книги одним предложением (замена текста). */
  | { kind: "batch"; changes: BookChange[] }
  | { kind: "form"; token: string; templateId: string; choices: Record<string, string>; replacements: { text: string; field: string }[] }
  /** Настройки печати и бланков шаблона. */
  | import("./templateTools.ts").TemplateChange;
export interface Proposal { id: number; change: BookChange | ExtraChange; lines: string[] }

export interface ToolContext {
  book: Book;
  important: ImportantMap;
  catalog: Catalog | null;
  template: UserTemplate;
  mask: NameMask;
  proposals: Proposal[];
}

const json = (v: unknown) => JSON.stringify(v);
const err = (message: string) => json({ error: message });

function listTables(ctx: ToolContext) {
  return TABLE_NAMES.filter((t) => !ctx.book.missing.includes(t)).map((t) => ({
    table: t, sheet: TABLES[t].sheet, rows: ctx.book.tables[t]?.length ?? 0,
    columns: TABLES[t].columns.filter((c) => c.type !== "formula").map((c) => {
      const flags = [c.type, (ctx.important[t] ?? []).includes(c.header) ? "обязательный" : "", c.isKey ? "ключ" : "", c.ref ? `ссылка на ${c.ref}` : "", c.type === "file" ? "только вручную" : ""].filter(Boolean).join(", ");
      return c.values ? `${c.header} (${flags}: ${c.values.join(" | ")})` : `${c.header} (${flags})`;
    }),
  }));
}

function readRows(ctx: ToolContext, a: Record<string, unknown>) {
  const t = a.table;
  if (!isTable(t)) return err(`Нет таблицы «${String(t)}»`);
  const cols = TABLES[t].columns;
  const filterCol = a.column ? cols.find((c) => c.header === String(a.column).trim()) : null;
  if (a.column && !filterCol) return err(`В таблице «${t}» нет столбца «${String(a.column)}»`);
  const needle = cellText((a.contains as string) ?? null).toLowerCase();
  const rows = (ctx.book.tables[t] ?? []).filter((r) => {
    if (!needle) return true;
    const vals = filterCol ? [showValue(filterCol, r.v[filterCol.key] ?? null)] : cols.map((c) => showValue(c, r.v[c.key] ?? null));
    return vals.some((v) => v.toLowerCase().includes(needle));
  });
  const offset = Math.max(0, Number(a.offset) || 0);
  const limit = Math.min(50, Math.max(1, Number(a.limit) || 20));
  return ctx.mask.mask(json({
    table: t, total: rows.length, offset,
    rows: rows.slice(offset, offset + limit).map((r) => ({
      row: r.row + 1,
      values: Object.fromEntries(cols.map((c) => [c.header, showValue(c, r.v[c.key] ?? null)]).filter(([, v]) => v !== "")),
    })),
  }));
}

const STATUS: Record<string, string> = { print: "печатается", scan: "скан есть", noScan: "нет скана", noForm: "нет формы", noData: "нет данных" };

function checkAct(ctx: ToolContext, a: Record<string, unknown>) {
  const act = cellText((a.act as string) ?? null);
  if (!act) return err("Укажите номер акта");
  const { issues } = buildBundle(ctx.book, act, ctx.important);
  const out: Record<string, unknown> = {
    act,
    printIssues: issues.map((i) => `«${i.table}»${i.row !== null ? `, строка ${i.row + 1}` : ""}, «${i.column}»: ${i.message}`),
  };
  if (ctx.catalog) {
    out.workKinds = actWorks(ctx.catalog, ctx.book, act);
    out.documents = completeness(ctx.template, ctx.catalog, ctx.book, act).map((d) => `${d.label}: ${STATUS[d.status] ?? d.status}${d.number ? ` (${d.number})` : ""}`);
  }
  return ctx.mask.mask(json(out));
}

function getCatalog(ctx: ToolContext, a: Record<string, unknown>) {
  if (!ctx.catalog) return err("Справочник не загружен: сервер не запущен");
  const q = cellText((a.query as string) ?? null).toLowerCase();
  const hit = (s: string) => !q || s.toLowerCase().includes(q);
  const sections = ctx.catalog.sections.map((s) => ({
    section: `${s.code} — ${s.name}`,
    works: s.works.filter((w) => hit(`${s.name} ${w.code} ${w.name} ${w.docs.join(" ")}`)).map((w) => `${w.code} — ${w.name}: ${w.docs.join(", ")}`),
  })).filter((s) => s.works.length || hit(s.section));
  const docs = ctx.catalog.docs.filter((d) => hit(`${d.code} ${d.name} ${d.source}`)).map((d) => `${d.code} — ${d.name}${d.source ? ` (${d.source})` : ""}; ${d.make}; ${d.scope === "kit" ? "на комплект" : "на акт"}`);
  return json({ sections: sections.slice(0, 40), docs: docs.slice(0, 120) });
}

function getTemplate(ctx: ToolContext) {
  const t = ctx.template;
  return json({ name: t.name, formSet: FORM_SET_LABELS[t.print?.formSet ?? "sbd"], docs: t.docs.map(docLabel) });
}

/** Столбцы, в которых можно искать и заменять текст. */
const textCols = (t: TableName) => TABLES[t].columns.filter((c) => c.type !== "formula" && c.type !== "file" && !c.service);
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function searchBook(ctx: ToolContext, a: Record<string, unknown>) {
  const text = cellText((a.text as string) ?? null).trim();
  if (text.length < 2) return err("Слишком короткий текст для поиска");
  if (a.table && !isTable(a.table)) return err(`Нет таблицы «${String(a.table)}»`);
  const needle = text.toLowerCase();
  const hits: { table: string; sheet: string; row: number; column: string; value: string }[] = [];
  let total = 0;
  for (const t of (a.table ? [a.table as TableName] : TABLE_NAMES)) {
    for (const r of ctx.book.tables[t] ?? []) for (const c of TABLES[t].columns) {
      const v = showValue(c, r.v[c.key] ?? null);
      if (!v.toLowerCase().includes(needle)) continue;
      total++;
      if (hits.length < 60) hits.push({ table: t, sheet: TABLES[t].sheet, row: r.row + 1, column: c.header, value: v.length > 200 ? v.slice(0, 200) + "…" : v });
    }
  }
  return ctx.mask.mask(json({ text, total, hits, note: total > hits.length ? `Показаны первые ${hits.length}` : undefined }));
}

const dmy = (v: CellValue) => showValue({ key: "d", header: "", type: "date", hint: "" }, v);

function checkOjr(ctx: ToolContext, a: Record<string, unknown>) {
  const section = Number(a.section);
  if (section !== 3 && section !== 5) return err("section — 3 или 5");
  const exp = ojrRows(ctx.book);
  const t: TableName = section === 3 ? "ОЖР3" : "ОЖР5";
  if (ctx.book.missing.includes(t)) return err(`В книге нет таблицы «${t}» — нужно «Обновить разметку»`);
  const have = ctx.book.tables[t] ?? [];
  const norm = (v: CellValue) => cellText(v).replace(/\s+/g, " ").trim();
  const out: Record<string, unknown> = { section, table: t, sheet: TABLES[t].sheet, expectedRows: section === 3 ? exp.s3.length : exp.s5.length, bookRows: have.length };
  if (section === 3) {
    const H = (k: string) => column("ОЖР3", k).header;
    const want = new Map(exp.s3.map((r) => [dmy(r[H("date")]), r]));
    const got = new Map(have.map((r) => [dmy(r.v.date), r]));
    out.missingDates = [...want.keys()].filter((d) => !got.has(d)).map((d) => `${d}: акты ${cellText(want.get(d)![H("acts")])}`);
    out.extraDates = [...got.keys()].filter((d) => !want.has(d)).map((d) => `${d}, строка ${got.get(d)!.row + 1}`);
    out.different = [...want.entries()].filter(([d]) => got.has(d)).flatMap(([d, w]) => {
      const g = got.get(d)!;
      const diff: string[] = [];
      if (norm(w[H("works")]) !== norm(g.v.works)) diff.push(`работы: в журнале «${norm(g.v.works).slice(0, 150)}», по актам «${norm(w[H("works")]).slice(0, 150)}»`);
      if (norm(w[H("signer")]) !== norm(g.v.signer)) diff.push(`представитель: в журнале «${norm(g.v.signer)}», по актам «${norm(w[H("signer")])}»`);
      return diff.length ? [`${d} (строка ${g.row + 1}): ${diff.join("; ")}`] : [];
    });
  } else {
    const H = (k: string) => column("ОЖР5", k).header;
    const want = new Map(exp.s5.map((r) => [norm(r[H("name")]), r]));
    const got = new Map(have.map((r) => [norm(r.v.name), r]));
    out.missing = [...want.keys()].filter((n) => !got.has(n)).map((n) => n.slice(0, 200));
    out.extra = [...got.entries()].filter(([n]) => !want.has(n)).map(([n, r]) => `строка ${r.row + 1}: ${n.slice(0, 200)}`);
    out.different = [...want.entries()].filter(([n]) => got.has(n) && norm(want.get(n)![H("signed")]) !== norm(got.get(n)!.v.signed))
      .map(([n, w]) => `«${n.slice(0, 120)}» (строка ${got.get(n)!.row + 1}): в журнале «${norm(got.get(n)!.v.signed)}», по актам «${norm(w[H("signed")])}»`);
  }
  for (const k of Object.keys(out)) if (Array.isArray(out[k]) && (out[k] as unknown[]).length > 40) out[k] = [...(out[k] as unknown[]).slice(0, 40), `… и ещё ${(out[k] as unknown[]).length - 40}`];
  out.actIssues = exp.issues.map((i) => i.message);
  out.hint = "Исправить журнал целиком — кнопка «Заполнить из актов» на листе журнала (ручные условия производства работ сохраняются).";
  return ctx.mask.mask(json(out));
}

function proposeReplace(ctx: ToolContext, a: Record<string, unknown>) {
  const find = cellText((a.find as string) ?? null);
  const repl = cellText((a.replace as string) ?? null);
  if (find.trim().length < 2) return err("find — не короче 2 символов");
  if (a.table && !isTable(a.table)) return err(`Нет таблицы «${String(a.table)}»`);
  const re = new RegExp(esc(find), "gi");
  const changes: BookChange[] = [];
  const lines: string[] = [];
  let cellsN = 0;
  for (const t of (a.table ? [a.table as TableName] : TABLE_NAMES)) {
    const cols = textCols(t).filter((c) => !a.column || c.header === String(a.column).trim());
    if (a.column && a.table && !cols.length) return err(`В таблице «${t}» нет столбца «${String(a.column)}», в котором можно заменять текст`);
    for (const r of ctx.book.tables[t] ?? []) {
      const values: Record<string, CellValue> = {};
      for (const c of cols) {
        if (c.type === "date" || c.type === "number" || c.type === "int") continue;
        const old = cellText(r.v[c.key] ?? null);
        if (!re.test(old)) { re.lastIndex = 0; continue; }
        re.lastIndex = 0;
        const next = old.replace(re, repl);
        const v = toCell(t, c, next);
        if (!v.ok) return err(`${v.error} (строка ${r.row + 1}: «${next}»)`);
        values[c.header] = v.value;
        cellsN++;
        if (lines.length < 60) lines.push(`«${TABLES[t].sheet}» (${t}), строка ${r.row + 1}, ${c.header}: «${old}» → «${next}»`);
      }
      if (Object.keys(values).length) changes.push({ kind: "update", table: t, row: r.row, values });
    }
  }
  if (!changes.length) return err(`Текст «${find}» не найден${a.table ? ` в «${String(a.table)}»` : ""} — проверь написание через search_book`);
  if (cellsN > 500) return err(`Слишком много ячеек (${cellsN}) — ограничь таблицей или столбцом`);
  if (cellsN > lines.length) lines.push(`… и ещё ${cellsN - lines.length}`);
  const id = ctx.proposals.length + 1;
  ctx.proposals.push({ id, change: { kind: "batch", changes }, lines: [`Заменить «${find}» на «${repl}» — ячеек: ${cellsN}`, ...lines] });
  return json({ ok: true, proposal: id, cells: cellsN, note: `Предложение №${id} (одна замена во всех ячейках) будет показано пользователю.` });
}

/** Исполняет вызов инструмента книги. Неизвестный инструмент — null (другие наборы инструментов). */
export function execBookTool(ctx: ToolContext, call: ToolCall): string | null {
  const a = ctx.mask.unmaskDeep(call.arguments ?? {});
  switch (call.name) {
    case "list_tables": return json(listTables(ctx));
    case "read_rows": return readRows(ctx, a);
    case "check_act": return checkAct(ctx, a);
    case "get_catalog": return getCatalog(ctx, a);
    case "get_template": return getTemplate(ctx);
    case "search_book": return searchBook(ctx, a);
    case "check_ojr": return checkOjr(ctx, a);
    case "propose_replace": return proposeReplace(ctx, a);
    case "propose_add_rows": case "propose_update": case "propose_delete": {
      const kind = call.name === "propose_add_rows" ? "add" : call.name === "propose_update" ? "update" : "delete";
      const v = validateChange(ctx.book, kind, a);
      if (!v.ok) return err(v.error);
      const id = ctx.proposals.length + 1;
      ctx.proposals.push({ id, change: v.change, lines: describeChange(ctx.book, v.change) });
      return json({ ok: true, proposal: id, note: `Предложение №${id} будет показано пользователю; он сам решит, применять ли его. Не пиши, что изменения уже внесены.` });
    }
    default: return null;
  }
}
