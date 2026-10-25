// Реестр ИД комплекта: строки «Заполнить из актов» (спецификация плана 7, §3.4) и запись их в книгу.
import { TABLES, keyColumn, column, docTypeFromBook, type RegistryKind, type TableName } from "../workbook/schema.ts";
import { cellText, parseDateCell, parseNumberCell, splitRefs, type CellValue } from "../workbook/values.ts";
import type { Book, BookRow } from "../workbook/records.ts";
import type { TableStore } from "../workbook/store.ts";
import type { Issue } from "../workbook/bundle.ts";
import type { QualityDoc } from "../schemas.ts";
import type { ActMaterialInput } from "../acts/schemas.ts";
import { QUALITY_DOC_LABELS, type QualityDocType } from "../roles.ts";
import { docNumberFor, formatDateShort, withNo } from "../acts/format.ts";
import type { FormSet } from "../templates.ts";
import { avkDefaultNumber, rimDocDate, rimDocName, rimDocOrder } from "../acts/rows.ts";
import type { PrintKind } from "../acts/schemas.ts";
import type { TemplateDoc, UserTemplate } from "../forms/template.ts";
import type { Catalog } from "../catalog/model.ts";
import { actDocs, kitDocs } from "../catalog/need.ts";
import { PROTO_DEFS, PROTO_KINDS } from "../protocols/defs.ts";
import { findHeader } from "../protocols/find.ts";
import { ACT_DOC_DEFS, AOSR_NAME, RIM_NAME, VD_NAME, VOR_NAME, KJ_NAME, PROTOCOL_NAME, AVK_NAME, type ActDocKind } from "../docs/defs.ts";

export { KJ_NAME, PROTOCOL_NAME, AVK_NAME, RP_NAME, TI_NAMES } from "../docs/defs.ts";
export const LAB_NAME = "Свидетельство о регистрации электролаборатории";
/** Наименования СБД по виду реестра (для ОЖР). */
export const DOC_NAMES: Partial<Record<RegistryKind, string>> = { "ВОР": VOR_NAME, "АОСР": AOSR_NAME, "РИМ": RIM_NAME, "ВД": VD_NAME };

/** Строка реестра: значения по заголовкам таблицы «РеестрИД» и адрес прикреплённого скана. */
export interface RegistryRecord { values: Record<string, CellValue>; link: string | null }

const H = (key: string) => column("РеестрИД", key).header;
const txt = cellText;
const iso = (v: CellValue) => { const p = parseDateCell(v); return p.ok ? p.value : null; };
const short = (v: CellValue) => formatDateShort(iso(v));
const period = (from: CellValue, to: CellValue) => {
  const a = iso(from), b = iso(to);
  if (a && b) return `от ${formatDateShort(a)} до ${formatDateShort(b)}`;
  return formatDateShort(a ?? b);
};

/** Номер «№…» и дата «от ДД.ММ.ГГГГ» из текста свидетельства электролаборатории. */
export function labCertificateParts(text: string): { number: string; date: string } {
  const n = text.match(/№\s*([^\s,;]+)/)?.[1] ?? "";
  const d = text.match(/от\s+(\d{2}\.\d{2}\.\d{4})/)?.[1] ?? "";
  return { number: n ? `№${n}` : "", date: d ? `от ${d} г.` : "" };
}

/** Строки книги одного комплекта и акты комплекта по порядку. */
export function kitActs(book: Book, kit: string): { kitRow: BookRow | undefined; acts: string[] } {
  const rows = (t: TableName) => book.tables[t] ?? [];
  const kitRow = rows("Комплекты").find((r) => txt(r.v.number) === kit);
  const acts = rows("АктыКомплектов").filter((r) => txt(r.v.kit) === kit).map((r) => txt(r.v.act)).filter(Boolean);
  return { kitRow, acts: [...new Set(acts)] };
}

/** Документы качества книги в виде QualityDoc (id — строка таблицы + 1), материалы — по строкам «Материалов». */
function qualityDocs(book: Book): { docs: QualityDoc[]; rowOf: Map<number, BookRow>; matId: (name: string) => number | null } {
  const mats = book.tables["Материалы"] ?? [];
  const matId = (name: string) => { const r = mats.find((m) => txt(m.v.name) === name); return r ? r.row + 1 : null; };
  const rowOf = new Map<number, BookRow>();
  const docs: QualityDoc[] = [];
  for (const r of book.tables["ДокументыКачества"] ?? []) {
    const type = docTypeFromBook(txt(r.v.type));
    if (!type) continue;
    const ids = splitRefs(r.v.materials).map(matId).filter((x): x is number => x !== null);
    const sheets = parseNumberCell(r.v.sheets);
    docs.push({
      id: r.row + 1, type: type as QualityDocType, number: txt(r.v.number), issueDate: iso(r.v.issueDate), validUntil: iso(r.v.validUntil),
      sheets: sheets.ok ? Math.max(0, Math.round(sheets.value ?? 0)) : 0, fileId: null, materialIds: ids, registryName: txt(r.v.registryName),
    });
    rowOf.set(r.row + 1, r);
  }
  return { docs, rowOf, matId };
}

/** Строки реестра комплекта из актов (порядок образца СБД). Шаблон пользователя: встроенные документы — только
 *  входящие в шаблон, свои (форма или скан) — после АОСР/РИМ/ВД акта, в порядке шаблона. Без шаблона — все встроенные
 *  (как «СБД»). Со справочником (план 12) — документы акта по его «Виду работ» (actDocs), документы «на комплект» —
 *  одной строкой «<код>» без акта в конце блока комплекта (kitDocs). */
export function registryRows(book: Book, kit: string, template?: UserTemplate, catalog?: Catalog): { rows: RegistryRecord[]; issues: Issue[] } {
  const own = (d: TemplateDoc): d is Extract<TemplateDoc, { kind: "custom" }> => d.kind === "custom" && (!!d.form || !!d.scan);
  const onKit = (d: TemplateDoc) => d.kind === "custom" && d.scope === "kit";
  /** Документы шаблона, нужные акту (без справочника — все документы шаблона). */
  const docsOf = (act: string): TemplateDoc[] | null =>
    !template ? null : catalog ? actDocs(template, catalog, book, act).docs : template.docs.filter((d) => !onKit(d));
  const issues: Issue[] = [];
  const rows = (t: TableName) => book.tables[t] ?? [];
  // Набор форм шаблона (план 14): нумерация и наименования строк.
  const set: FormSet = template?.print?.formSet ?? "sbd";
  const ti = set === "ti";
  const { kitRow, acts } = kitActs(book, kit);
  if (!kitRow) {
    issues.push({ table: "Комплекты", row: null, column: "№ реестра", message: `Комплект «${kit}» не найден на листе «Комплекты»` });
    return { rows: [], issues };
  }
  if (!acts.length) {
    issues.push({ table: "АктыКомплектов", row: null, column: "Акт", message: `В комплект «${kit}» не включены акты (таблица «Акты комплектов»)` });
    return { rows: [], issues };
  }
  const { docs, rowOf, matId } = qualityDocs(book);
  const out: RegistryRecord[] = [];
  const seenDocs = new Set<number>();
  let measuring = false;
  /** Свидетельства о поверке и лаборатории — один раз на комплект, перед первым протоколом лаборатории. */
  const addMeasuring = (code: string) => {
    if (measuring) return;
    measuring = true;
    for (const i of rows("СредстваИзмерений"))
      add("Поверка", "", withNo(txt(i.v.certificate)), `Свидетельство о поверке: ${txt(i.v.name)} ${txt(i.v.type)}`, period(i.v.checkedOn, i.v.nextCheck), code, i);
    const lab = rows("Электролаборатория")[0];
    if (lab) {
      const p = labCertificateParts(txt(lab.v.certificate));
      add("Лаборатория", "", p.number, LAB_NAME, p.date, code, lab);
    }
  };
  const add = (kind: RegistryKind, act: string, number: string, name: string, date: string, code: string, src?: BookRow, fileKey = "file") =>
    out.push({
      values: {
        [H("kit")]: kit, [H("kind")]: kind, [H("act")]: act || null, [H("number")]: number, [H("name")]: name.trim(), [H("date")]: date,
        [H("copies")]: 1, [H("code")]: code, [H("file")]: src ? txt(src.v[fileKey]) || null : null, [H("sheets")]: null,
      },
      link: src?.link[fileKey] ?? null,
    });

  for (const n of acts) {
    const act = rows("Акты").find((r) => txt(r.v.baseNumber) === n);
    if (!act) {
      issues.push({ table: "АктыКомплектов", row: null, column: "Акт", message: `Акт «${n}» не найден на листе «База актов»` });
      continue;
    }
    const need = docsOf(n);
    // Без шаблона — все встроенные документы «СБД» (РП — только явно в шаблоне, план 14).
    const inTpl = (k: PrintKind) => (!need ? k !== "rp" : need.some((d) => d.kind === "builtin" && d.doc === k));
    const custom = (need ?? []).filter(own);
    const of = (t: TableName) => rows(t).filter((r) => txt(r.v.act) === n);
    const code = txt(act.v.section);
    const date = short(act.v.date);
    const aosrNo = withNo(docNumberFor(n, "aosr", set));
    const actMats = of("МатериалыАктов");
    // Документы акта по описаниям (план 15): ВОР, АОСР, РИМ/РМ, РП, ВД — строка, если у акта есть их данные.
    const ctx = { aosrNo, date, works: txt(act.v.works) };
    for (const k of ["vor", "aosr", "rim", "rp", "vd"] as const satisfies readonly ActDocKind[]) {
      const def = ACT_DOC_DEFS[k];
      if (!inTpl(k) || (def.rowsFrom && !of(def.rowsFrom).length)) continue;
      const number = k === "vor" ? "б/н" : k === "aosr" ? aosrNo : withNo(docNumberFor(n, k, set));
      add(def.registry, n, number, def.name(set, ctx), date, code);
    }
    for (const d of custom) add("Свой документ", n, withNo(`${n}.${d.code}`), d.name, date, code);
    for (const s of of("Схемы")) {
      const name = txt(s.v.kind) === "Прочее" ? txt(s.v.name) : `Исполнительная схема ${txt(s.v.name)}`;
      add("Схема", n, withNo(txt(s.v.number)), name, short(s.v.date), code, s);
    }
    if (of("КабельныйЖурнал").length && (inTpl("kj") || inTpl("ip"))) {
      const doc = of("ДокументыКабелей")[0];
      const jc = doc ? txt(doc.v.journalCode) : "";
      if (inTpl("kj")) {
        if (ti) add("КЖ", n, withNo(docNumberFor(n, "kj", set)), KJ_NAME, doc ? short(doc.v.journalDate) || date : date, code);
        else add("КЖ", n, jc ? `№ ${jc}` : "", KJ_NAME, doc ? short(doc.v.journalDate) : "", code);
      }
      if (ti && inTpl("ip")) {
        add("Протокол", n, withNo(docNumberFor(n, "ip", set)), ACT_DOC_DEFS.ip.name(set, ctx), doc ? period(doc.v.dateFrom, doc.v.dateTo) || date : date, code);
        addMeasuring(code);
      } else if (doc && txt(doc.v.protocolNumber) && inTpl("ip")) {
        add("Протокол", n, withNo(txt(doc.v.protocolNumber)), PROTOCOL_NAME, period(doc.v.dateFrom, doc.v.dateTo), code);
        addMeasuring(code);
      }
    }
    // Протоколы и акты плана 13 «на акт» — после протокола изоляции; лабораторные — с поверками и свидетельством.
    for (const k of PROTO_KINDS) {
      const def = PROTO_DEFS[k];
      if (def.scope !== "act" || !inTpl(k)) continue;
      const h = findHeader(book, def.code, { act: n });
      if (!h) continue;
      if (def.signer === "lab") addMeasuring(code);
      add("Акт/протокол", n, withNo(txt(h.v.number)), def.name, period(h.v.dateFrom, h.v.dateTo), code);
    }
    // Акт входного контроля материалов акта — перед их документами качества (как в образце СБД).
    if (actMats.length && inTpl("avk")) {
      const avkDate = iso(act.v.avkDate) ?? iso(act.v.dateStart) ?? iso(act.v.date);
      add("АВК", n, withNo(txt(act.v.avkNumber) || avkDefaultNumber(n, code)), AVK_NAME, formatDateShort(avkDate), code);
    }
    // Документы качества материалов акта — в порядке РИМ, каждый один раз на комплект.
    const ams: ActMaterialInput[] = actMats
      .map((r, i) => ({ materialId: matId(txt(r.v.material)) ?? -1, position: "", quantity: null, sortOrder: i }))
      .filter((a) => a.materialId > 0);
    const byMat = new Map(ams.map((a) => [a.materialId, docs.filter((d) => d.materialIds.includes(a.materialId))]));
    const materials = (book.tables["Материалы"] ?? []).map((m) => ({ id: m.row + 1, name: txt(m.v.name), mark: "", article: "", manufacturer: "", unit: "" }));
    for (const d of rimDocOrder(ams, byMat)) {
      if (seenDocs.has(d.id)) continue;
      seenDocs.add(d.id);
      if (ti) add("Документ качества", n, d.number.replace(/^№\s*/, ""), QUALITY_DOC_LABELS[d.type], d.issueDate ? formatDateShort(d.issueDate) : "б/д", code, rowOf.get(d.id));
      else add("Документ качества", n, withNo(d.number), `${QUALITY_DOC_LABELS[d.type]}: ${rimDocName(d, ams, materials)}`, rimDocDate(d), code, rowOf.get(d.id));
    }
  }
  // Документы «на комплект» (скан свидетельства и т. п.) — одна строка на комплект, номер — код документа.
  const kitCode = txt(kitRow.v.section) || txt(rows("Акты").find((r) => txt(r.v.baseNumber) === acts[0])?.v.section ?? null);
  const kitLevel = !template ? null : catalog ? kitDocs(template, catalog, book, acts) : template.docs;
  if (kitLevel) for (const d of kitLevel.filter(own).filter(onKit)) add("Свой документ", "", d.code, d.name, "", kitCode);
  // Протоколы и акты плана 13 «на комплект» — по шапке комплекта (или акта комплекта), одна строка на документ.
  for (const k of PROTO_KINDS) {
    const def = PROTO_DEFS[k];
    if (def.scope !== "kit" || (kitLevel && !kitLevel.some((d) => d.kind === "builtin" && d.doc === k))) continue;
    const h = findHeader(book, def.code, { kit });
    if (!h) continue;
    if (def.signer === "lab") addMeasuring(kitCode);
    add("Акт/протокол", "", withNo(txt(h.v.number)), def.name, period(h.v.dateFrom, h.v.dateTo), kitCode);
  }
  return { rows: out, issues };
}

/** Заменяет строки комплекта в таблице «РеестрИД» строками из актов (на место первой из прежних). Возвращает число строк. */
export async function fillRegistry(store: TableStore, book: Book, kit: string, template?: UserTemplate): Promise<{ count: number; issues: Issue[] }> {
  const { rows, issues } = registryRows(book, kit, template);
  if (issues.length) return { count: 0, issues };
  const t = await store.read("РеестрИД");
  if (!t) throw new Error("Таблица «РеестрИД» не найдена");
  const ki = t.headers.indexOf(H("kit"));
  const old = t.rows.map((r, i) => (txt(r[ki] ?? null) === kit ? i : -1)).filter((i) => i >= 0);
  const at = old.length ? old[0] : t.rows.length;
  if (old.length) await store.remove("РеестрИД", old);
  const first = await store.insert("РеестрИД", at, rows.map((r) => r.values));
  for (const [i, r] of rows.entries()) if (r.link) await store.write("РеестрИД", first + i, {}, { [H("file")]: r.link });
  return { count: rows.length, issues: [] };
}

export const KIT_KEY = keyColumn("Комплекты")!;
export const REGISTRY_TABLE = TABLES["РеестрИД"];
