// План 17: только нужные листы — какие таблицы нужны документам шаблона книги и какие листы можно скрыть.
import { SHEETS, type SheetName, type TableName } from "./schema.ts";
import type { Book } from "./records.ts";
import type { UserTemplate } from "../forms/template.ts";
import { ACT_DOC_DEFS, isActDocKind } from "../docs/defs.ts";
import { PROTO_DEFS, isProtoKind } from "../protocols/defs.ts";

/** Настройка книги «Только нужные листы»: «0» — выключено, иначе (в том числе не задано) — включено. */
export const NEEDED_SHEETS_SETTING = "idk.neededSheets";
export const neededSheetsOn = (v: string | null | undefined) => v !== "0";

/** Нужны всегда (основа любой книги): реквизиты, участники, материалы и документы качества, акты, комплекты и реестр.
 *  Остальные листы — по документам шаблона; лист с данными (не примерами) виден всегда. */
export const ALWAYS_TABLES: readonly TableName[] = [
  "Объект", "Организации", "Шифры", "Представители", "Материалы", "ДокументыКачества", "Акты",
  "Комплекты", "АктыКомплектов", "РеестрИД",
];

/** Таблицы, нужные встроенным документам шаблона (свои документы таблиц не добавляют). */
export function neededTables(template: UserTemplate): Set<TableName> {
  const out = new Set<TableName>(ALWAYS_TABLES);
  for (const d of template.docs) {
    if (d.kind !== "builtin") continue;
    if (isActDocKind(d.doc)) for (const t of ACT_DOC_DEFS[d.doc].tables) out.add(t);
    else if (isProtoKind(d.doc)) { out.add(PROTO_DEFS[d.doc].table); out.add("Протоколы"); out.add("ПереченьОборудования"); }
  }
  return out;
}

/** Видимые и скрытые листы. Лист скрывается, если ни одна его таблица не нужна и в них нет строк данных;
 *  «Реквизиты» видны всегда; выключено — все листы видны. */
export function sheetPlan(template: UserTemplate, book: Book, enabled: boolean): { visible: SheetName[]; hidden: SheetName[] } {
  const need = neededTables(template);
  const visible: SheetName[] = [], hidden: SheetName[] = [];
  for (const s of SHEETS) {
    const keep = !enabled || s.name === "Реквизиты" || s.tables.some((t) => need.has(t) || (book.tables[t]?.length ?? 0) > 0);
    (keep ? visible : hidden).push(s.name);
  }
  return { visible, hidden };
}
