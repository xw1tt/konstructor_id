// План 19: инструменты помощника — описания для модели и исполнение на данных книги. Правки не применяются:
// каждое верное предложение становится «Предложением №N» для карточки «Предлагаемые изменения».
import type { ToolDef, ToolCall } from "./model.ts";
import { TABLES, TABLE_NAMES, type TableName } from "../workbook/schema.ts";
import { cellText } from "../workbook/values.ts";
import type { Book } from "../workbook/records.ts";
import type { ImportantMap } from "../workbook/important.ts";
import { buildBundle } from "../workbook/bundle.ts";
import type { Catalog } from "../catalog/model.ts";
import { completeness, actWorks } from "../catalog/need.ts";
import { docLabel, type UserTemplate } from "../forms/template.ts";
import { FORM_SET_LABELS } from "../templates.ts";
import { describeChange, isTable, showValue, validateChange, type BookChange } from "./changes.ts";
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
  | { kind: "form"; token: string; templateId: string; choices: Record<string, string>; replacements: { text: string; field: string }[] };
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

/** Исполняет вызов инструмента книги. Неизвестный инструмент — null (другие наборы инструментов). */
export function execBookTool(ctx: ToolContext, call: ToolCall): string | null {
  const a = ctx.mask.unmaskDeep(call.arguments ?? {});
  switch (call.name) {
    case "list_tables": return json(listTables(ctx));
    case "read_rows": return readRows(ctx, a);
    case "check_act": return checkAct(ctx, a);
    case "get_catalog": return getCatalog(ctx, a);
    case "get_template": return getTemplate(ctx);
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
