// План 12, задача 4: какие документы нужны акту и комплекту (по «Виду работ» акта) и что из них уже есть.
import type { Catalog, CatalogWork } from "./model.ts";
import type { TemplateDoc, UserTemplate } from "../forms/template.ts";
import { BUILTIN_DOC_LABELS, docLabel } from "../forms/template.ts";
import type { Book, BookRow } from "../workbook/records.ts";
import { cellText, splitRefs } from "../workbook/values.ts";
import { kitActs } from "../kit/registry.ts";
import { PROTO_DEFS, isProtoKind } from "../protocols/defs.ts";
import { findHeader } from "../protocols/find.ts";

const txt = cellText;
const norm = (s: string) => s.trim().toLowerCase();
/** Номер документа реестра без «№» и пробелов — для сравнения. */
const normNumber = (s: string) => s.replace(/^№\s*/, "").trim();

const actRow = (book: Book, act: string): BookRow | undefined =>
  (book.tables["Акты"] ?? []).find((r) => txt(r.v.baseNumber) === act);

/** Код документа шаблона: код справочника, код своего документа или подпись встроенного («АОСР»). */
export function docCode(d: TemplateDoc): string {
  if (d.catalog) return d.catalog;
  return d.kind === "custom" ? d.code : BUILTIN_DOC_LABELS[d.doc];
}

/** Документ на акт или на комплект: свой — по scope, протокол или акт плана 13 — по описанию, прочие встроенные — на акт. */
const docScope = (d: TemplateDoc): "act" | "kit" =>
  d.kind === "custom" ? (d.scope === "kit" ? "kit" : "act") : isProtoKind(d.doc) ? PROTO_DEFS[d.doc].scope : "act";

/** Виды работ акта: значения «Вида работ» по названию или коду справочника; неизвестные — в unknown. */
export function actWorks(c: Catalog, book: Book, act: string): { works: string[]; unknown: string[] } {
  const row = actRow(book, act);
  const all: CatalogWork[] = c.sections.flatMap((s) => s.works);
  const works: string[] = [];
  const unknown: string[] = [];
  for (const v of row ? splitRefs(row.v.workKinds ?? null) : []) {
    const w = all.find((x) => norm(x.code) === norm(v) || norm(x.name) === norm(v));
    if (!w) unknown.push(v);
    else if (!works.includes(w.code)) works.push(w.code);
  }
  return { works, unknown };
}

/** Коды «Без документов» акта (сравнение без учёта регистра). */
const skipped = (book: Book, act: string): Set<string> =>
  new Set(splitRefs(actRow(book, act)?.v.skipDocs ?? null).map(norm));

/** Нужен ли документ акту: без «Вида работ» — все; иначе — непривязанные и те, чьи виды работ пересекаются с актом. */
function needed(d: TemplateDoc, listed: boolean, works: string[]): boolean {
  if (!listed) return true;
  const bound = d.works ?? [];
  return bound.length === 0 || bound.some((w) => works.includes(w));
}

function docsFor(t: UserTemplate, c: Catalog, book: Book, act: string, scope: "act" | "kit") {
  const { works, unknown } = actWorks(c, book, act);
  const listed = works.length + unknown.length > 0;
  const skip = skipped(book, act);
  const docs = t.docs.filter((d) => docScope(d) === scope && needed(d, listed, works) && !skip.has(norm(docCode(d))));
  return { docs, unknown };
}

/** Документы шаблона «на акт», нужные акту; неизвестные виды работ — предупреждение, не ошибка. */
export function actDocs(t: UserTemplate, c: Catalog, book: Book, act: string): { docs: TemplateDoc[]; unknown: string[] } {
  return docsFor(t, c, book, act, "act");
}

/** Документы «на комплект», нужные хотя бы одному акту комплекта (каждый — один раз). */
export function kitDocs(t: UserTemplate, c: Catalog, book: Book, acts: string[]): TemplateDoc[] {
  const out: TemplateDoc[] = [];
  for (const a of acts) for (const d of docsFor(t, c, book, a, "kit").docs) if (!out.includes(d)) out.push(d);
  return out;
}

/** print — печатает конструктор/своя форма; scan — скан есть; noScan — скана нет; noForm — у своего документа нет формы;
 *  noData — у протокола или акта плана 13 нет строки в «Протоколах». */
export type Status = "print" | "scan" | "noScan" | "noForm" | "noData";

export interface DocState { doc: TemplateDoc; label: string; status: Status; number: string }

/** Есть ли в «Реестре ИД» строка с этим номером (и комплектом/актом, если заданы) и непустым «Сканом». */
function hasScan(book: Book, number: string, where: { kit?: string; act?: string | null }): boolean {
  return (book.tables["РеестрИД"] ?? []).some((r) =>
    normNumber(txt(r.v.number)) === normNumber(number)
    && (where.kit === undefined || txt(r.v.kit) === where.kit)
    && (where.act === undefined || (where.act === null ? !txt(r.v.act) : true))
    && (txt(r.v.file) !== "" || !!r.link?.file));
}

function stateOf(book: Book, d: TemplateDoc, number: string, where: { kit?: string; act?: string | null }): DocState {
  const label = docLabel(d);
  if (d.kind === "builtin" && isProtoKind(d.doc)) {
    const head = findHeader(book, PROTO_DEFS[d.doc].code, where.act ? { act: where.act } : { kit: where.kit });
    return { doc: d, label, status: head ? "print" : "noData", number: head ? txt(head.v.number) : "" };
  }
  if (d.kind === "builtin") return { doc: d, label, status: "print", number: "" };
  if (d.scan) return { doc: d, label, status: hasScan(book, number, where) ? "scan" : "noScan", number };
  return { doc: d, label, status: d.form ? "print" : "noForm", number };
}

/** Полнота акта: по каждому нужному документу — статус; номер своего документа «<номер акта>.<код>». */
export function completeness(t: UserTemplate, c: Catalog, book: Book, act: string): DocState[] {
  return actDocs(t, c, book, act).docs.map((d) => stateOf(book, d, `${act}.${docCode(d)}`, { act }));
}

/** Чего не хватает комплекту: документы актов без скана/формы и документы «на комплект» (act = null). */
export function kitShortage(t: UserTemplate, c: Catalog, book: Book, kit: string): { act: string | null; label: string; status: Status }[] {
  const { acts } = kitActs(book, kit);
  const out: { act: string | null; label: string; status: Status }[] = [];
  const bad = (s: DocState) => s.status === "noScan" || s.status === "noForm" || s.status === "noData";
  for (const a of acts) for (const s of completeness(t, c, book, a)) if (bad(s)) out.push({ act: a, label: s.label, status: s.status });
  for (const d of kitDocs(t, c, book, acts)) {
    const s = stateOf(book, d, docCode(d), { kit, act: null });
    if (bad(s)) out.push({ act: null, label: s.label, status: s.status });
  }
  return out;
}
