// Печать акта из книги: сборка пакета, проверка, задание печати на сервере, окно предпросмотра.
import { TABLES, type TableName } from "@idk/shared/workbook/schema";
import { ACT_DOC_DEFS, isActDocKind } from "@idk/shared/docs/defs";
import type { PrintKind } from "@idk/shared/acts/schemas";
import { buildBundle, type ActBundle, type Issue } from "@idk/shared/workbook/bundle";
import { cellText } from "@idk/shared/workbook/values";
import { PROTO_DEFS, isProtoKind, type ProtoKind } from "@idk/shared/protocols/defs";
import { buildProtoBundle } from "@idk/shared/protocols/bundle";
import { findHeader } from "@idk/shared/protocols/find";
import { buildCableBundle } from "@idk/shared/workbook/cables";
import type { Book } from "@idk/shared/workbook/records";
import type { ImportantMap } from "@idk/shared/workbook/important";
import type { PrintOptions, TemplateCode } from "@idk/shared/templates";
import { apiSend } from "../api.ts";

declare const Office: any;

export interface IssueLine { text: string; table: TableName; row: number | null; column: string }

/** Ошибки проверки как строки «лист, строка N, «столбец»: сообщение»; offsets — строка листа первой строки данных. */
export function issueLines(issues: Issue[], offsets: Partial<Record<TableName, number>>): IssueLine[] {
  return issues.map((i) => {
    const sheet = TABLES[i.table].sheet;
    const off = offsets[i.table];
    const where = i.row !== null && off !== undefined ? `${sheet}, строка ${off + i.row}` : sheet;
    return { text: `${where}, «${i.column}»: ${i.message}`, table: i.table, row: i.row, column: i.column };
  });
}

/** Порт книги — то, что нужно строкам ошибок: ячейка Excel для виртуальной таблицы и номер строки листа. */
interface IssuePort {
  physical(name: TableName, row: number, header: string | null): Promise<{ table: TableName; row: number; column: string | null } | null>;
  isVirtual(name: TableName): Promise<boolean>;
  tableSheetOffset(table: TableName): Promise<number>;
}

/**
 * Строки ошибок с номерами строк листа. Ошибка виртуальной таблицы (план 31: документ качества, позиция РКЦ)
 * указывает на ячейку «Материалов» — строку материала и столбец «Док.N: …», куда и ведёт переход.
 */
export async function sheetIssueLines(port: IssuePort, issues: Issue[]): Promise<IssueLine[]> {
  const mapped: Issue[] = [];
  for (const i of issues) {
    if (!(await port.isVirtual(i.table).catch(() => false))) { mapped.push(i); continue; }
    const p = await port.physical(i.table, i.row ?? 0, i.column).catch(() => null);
    mapped.push(p ? { ...i, table: p.table, row: i.row === null ? null : p.row, column: p.column ?? i.column } : { ...i, table: "Материалы" });
  }
  const offsets: Partial<Record<TableName, number>> = {};
  for (const t of new Set(mapped.map((i) => i.table))) offsets[t] = await port.tableSheetOffset(t).catch(() => undefined as any);
  return issueLines(mapped, offsets);
}

export const previewJobUrl = (id: string, doc: PrintKind, origin: string) =>
  `${origin}/addin/preview.html?src=${encodeURIComponent(`/api/print-jobs/${id}/${doc}`)}`;

function openPreview(url: string) {
  if (typeof Office !== "undefined" && Office?.context?.ui?.displayDialogAsync) {
    Office.context.ui.displayDialogAsync(url, { height: 90, width: 70, displayInIframe: false });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/**
 * Пакет протокола или акта плана 13 для печати: шапка в «Протоколах» по акту (документ «на комплект» — по комплекту,
 * в который входит акт) или по комплекту.
 */
export function protoBundleFor(book: Book, kind: ProtoKind, where: { act?: string; kit?: string }, important: ImportantMap):
  { bundle: ActBundle | null; issues: Issue[] } {
  const def = PROTO_DEFS[kind];
  let head = where.kit !== undefined ? findHeader(book, def.code, { kit: where.kit }) : undefined;
  if (where.act !== undefined) {
    head = def.scope === "act" ? findHeader(book, def.code, { act: where.act })
      : (book.tables["АктыКомплектов"] ?? []).filter((r) => cellText(r.v.act) === where.act)
        .map((r) => findHeader(book, def.code, { kit: cellText(r.v.kit) })).find(Boolean)
        ?? findHeader(book, def.code, { act: where.act });
  }
  if (!head) {
    const of = where.act !== undefined ? `акта «${where.act}»` : `комплекта «${where.kit}»`;
    return { bundle: null, issues: [{ table: "Протоколы", row: null, column: "№ документа", message: `Нет строки «${def.code}» в таблице «Протоколы» для ${of}` }] };
  }
  return buildProtoBundle(book, cellText(head.v.number), important);
}

/** Пакет для печати документа: протокол или акт плана 13, кабельный (КЖ, протокол изоляции) или пакет акта. */
function printBundle(book: Book, where: { act?: string; kit?: string }, important: ImportantMap, doc: PrintKind | null, options?: PrintOptions) {
  if (isProtoKind(doc)) return protoBundleFor(book, doc, where, important);
  const act = where.act ?? "";
  // Пакет по описанию документа (план 15): кабельный — КЖ и протокол изоляции.
  return doc && isActDocKind(doc) && ACT_DOC_DEFS[doc].bundle === "cable"
    ? buildCableBundle(book, act, important, doc as "kj" | "ip", { set: options?.formSet }) : buildBundle(book, act, important);
}

/** Проверяет акт; при ошибках возвращает их, иначе создаёт задание печати и открывает предпросмотр. Документ «на комплект»
 *  печатается из карточки комплекта: where.kit. */
export async function printAct(book: Book, actNumber: string, important: ImportantMap, doc: PrintKind, template: TemplateCode,
  options?: PrintOptions, where: { act?: string; kit?: string } = { act: actNumber }): Promise<Issue[]> {
  const { bundle, issues } = printBundle(book, where, important, doc, options);
  if (!bundle) return issues;
  const { id } = await apiSend<{ id: string }>("POST", "/api/print-jobs", { ...bundle, template, options });
  openPreview(previewJobUrl(id, doc, location.origin));
  return [];
}

export const previewFormUrl = (id: string, origin: string) =>
  `${origin}/addin/preview.html?src=${encodeURIComponent(`/api/form-jobs/${id}`)}`;

/** Пакет акта для своей формы: для КЖ/протокола — кабельный, протокола или акта плана 13 — его пакет, иначе обычный. */
export function bundleFor(book: Book, actNumber: string, important: ImportantMap, doc: PrintKind | null, options?: PrintOptions) {
  return printBundle(book, { act: actNumber }, important, doc, options);
}

/** Печать документа по своей форме шаблона: проверка акта, задание на сервере, предпросмотр. */
export async function printForm(book: Book, actNumber: string, important: ImportantMap, templateId: string, key: string, doc: PrintKind | null,
  where: { act?: string; kit?: string } = { act: actNumber }, options?: PrintOptions): Promise<{ issues: Issue[]; job?: { id: string; warnings: string[]; name: string } }> {
  const { bundle, issues } = printBundle(book, where, important, doc, options);
  if (!bundle) return { issues };
  const job = await apiSend<{ id: string; warnings: string[]; name: string }>("POST", "/api/form-jobs", { bundle, template: templateId, doc: key });
  openPreview(previewFormUrl(job.id, location.origin));
  return { issues: [], job };
}
