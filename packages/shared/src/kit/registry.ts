// Реестр ИД комплекта: строки «Заполнить из актов» (спецификация плана 7, §3.4) и запись их в книгу.
import { TABLES, keyColumn, column, docTypeFromBook, type RegistryKind, type TableName } from "../workbook/schema.ts";
import { cellText, parseDateCell, parseNumberCell, splitRefs, type CellValue } from "../workbook/values.ts";
import type { Book, BookRow } from "../workbook/records.ts";
import type { TableStore } from "../workbook/store.ts";
import type { Issue } from "../workbook/bundle.ts";
import type { QualityDoc } from "../schemas.ts";
import type { ActMaterialInput } from "../acts/schemas.ts";
import { QUALITY_DOC_LABELS, type QualityDocType } from "../roles.ts";
import { docNumber, formatDateShort, withNo } from "../acts/format.ts";
import { avkDefaultNumber, rimDocDate, rimDocName, rimDocOrder } from "../acts/rows.ts";
import type { PrintKind } from "../acts/schemas.ts";
import type { UserTemplate } from "../forms/template.ts";

export const KJ_NAME = "Кабельный журнал";
export const PROTOCOL_NAME = "Протокол проверки сопротивления изоляции проводов, кабелей и обмоток электрических машин";
export const LAB_NAME = "Свидетельство о регистрации электролаборатории";
export const AVK_NAME = "Акт входного контроля, технических средств и материалов";
export const DOC_NAMES: Partial<Record<RegistryKind, string>> = {
  "ВОР": "Ведомость объемов выполненных работ",
  "АОСР": "Акт освидетельствования скрытых работ",
  "РИМ": "Реестр использованных материалов",
  "ВД": "Ведомость смонтированного оборудования, технических средств и материалов",
};

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

/** Строки реестра комплекта по актам (порядок образца СБД). */
/** Строки реестра комплекта из актов. Шаблон пользователя: встроенные документы — только входящие в шаблон,
 *  свои документы — после АОСР/РИМ/ВД акта, в порядке шаблона. Без шаблона — все встроенные (как «СБД»). */
export function registryRows(book: Book, kit: string, template?: UserTemplate): { rows: RegistryRecord[]; issues: Issue[] } {
  const inTpl = (k: PrintKind) => !template || template.docs.some((d) => d.kind === "builtin" && d.doc === k);
  const custom = (template?.docs ?? []).flatMap((d) => (d.kind === "custom" ? [d] : []));
  const issues: Issue[] = [];
  const rows = (t: TableName) => book.tables[t] ?? [];
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
    const of = (t: TableName) => rows(t).filter((r) => txt(r.v.act) === n);
    const code = txt(act.v.section);
    const date = short(act.v.date);
    if (of("ВОР").length && inTpl("vor")) add("ВОР", n, "б/н", DOC_NAMES["ВОР"]!, date, code);
    if (inTpl("aosr")) add("АОСР", n, withNo(docNumber(n, "aosr")), `${DOC_NAMES["АОСР"]} ${txt(act.v.works)}`, date, code);
    const actMats = of("МатериалыАктов");
    if (actMats.length) {
      if (inTpl("rim")) add("РИМ", n, withNo(docNumber(n, "rim")), DOC_NAMES["РИМ"]!, date, code);
      if (inTpl("vd")) add("ВД", n, withNo(docNumber(n, "vd")), DOC_NAMES["ВД"]!, date, code);
    }
    for (const d of custom) add("Свой документ", n, withNo(`${n}.${d.code}`), d.name, date, code);
    for (const s of of("Схемы")) {
      const name = txt(s.v.kind) === "Прочее" ? txt(s.v.name) : `Исполнительная схема ${txt(s.v.name)}`;
      add("Схема", n, withNo(txt(s.v.number)), name, short(s.v.date), code, s);
    }
    if (of("КабельныйЖурнал").length && (inTpl("kj") || inTpl("ip"))) {
      const doc = of("ДокументыКабелей")[0];
      const jc = doc ? txt(doc.v.journalCode) : "";
      if (inTpl("kj")) add("КЖ", n, jc ? `№ ${jc}` : "", KJ_NAME, doc ? short(doc.v.journalDate) : "", code);
      if (doc && txt(doc.v.protocolNumber) && inTpl("ip")) {
        add("Протокол", n, withNo(txt(doc.v.protocolNumber)), PROTOCOL_NAME, period(doc.v.dateFrom, doc.v.dateTo), code);
        if (!measuring) {
          measuring = true;
          for (const i of rows("СредстваИзмерений"))
            add("Поверка", "", withNo(txt(i.v.certificate)), `Свидетельство о поверке: ${txt(i.v.name)} ${txt(i.v.type)}`, period(i.v.checkedOn, i.v.nextCheck), code, i);
          const lab = rows("Электролаборатория")[0];
          if (lab) {
            const p = labCertificateParts(txt(lab.v.certificate));
            add("Лаборатория", "", p.number, LAB_NAME, p.date, code, lab);
          }
        }
      }
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
      add("Документ качества", n, withNo(d.number), `${QUALITY_DOC_LABELS[d.type]}: ${rimDocName(d, ams, materials)}`, rimDocDate(d), code, rowOf.get(d.id));
    }
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
