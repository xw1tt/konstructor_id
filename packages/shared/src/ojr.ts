// Общий журнал работ (приказ Минстроя России от 02.12.2022 № 1026/пр): разделы 3 и 5 из актов книги.
import { column, roleFromBook, type TableName } from "./workbook/schema.ts";
import { cellText, isoToExcelSerial, joinRefs, parseDateCell, parseNumberCell, type CellValue } from "./workbook/values.ts";
import type { Book, BookRow } from "./workbook/records.ts";
import type { TableStore } from "./workbook/store.ts";
import type { Issue } from "./workbook/bundle.ts";
import type { Representative } from "./schemas.ts";
import type { RoleCode } from "./roles.ts";
import { activeRepresentatives } from "./rules.ts";
import { docNumber, formatDateShort, withNo } from "./acts/format.ts";
import { avkDefaultNumber } from "./acts/rows.ts";
import { AVK_NAME, KJ_NAME, PROTOCOL_NAME, DOC_NAMES } from "./kit/registry.ts";
import type { OjrRequest } from "./ojrPrint.ts";
import { isHoliday } from "./holidays.ts";

const txt = cellText;
const iso = (v: CellValue) => { const p = parseDateCell(v); return p.ok ? p.value : null; };
const H3 = (k: string) => column("ОЖР3", k).header;
const H5 = (k: string) => column("ОЖР5", k).header;

/** Даты периода включительно, кроме воскресений и нерабочих праздничных дней. */
export function workDays(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && !isHoliday(iso)) out.push(iso);
  }
  return out;
}

/** Представители книги в виде Representative (без проверки организаций — журналу нужны должность и ФИО). */
function reps(book: Book): Representative[] {
  return (book.tables["Представители"] ?? []).flatMap((r) => {
    const role = roleFromBook(txt(r.v.role));
    if (!role) return [];
    const n = parseNumberCell(r.v.sortOrder);
    return [{
      id: r.row + 1, role, position: txt(r.v.position), fullName: txt(r.v.fullName), orgId: 1, authorityDoc: "", nrsNumber: "",
      nrsDate: null, validFrom: iso(r.v.validFrom), validTo: iso(r.v.validTo), sortOrder: n.ok ? Math.round(n.value ?? 0) : 0, actText: "",
    }];
  });
}

const who = (r: Representative | undefined) => (r ? [r.position, r.fullName].filter(Boolean).join(" ") : "");
const uniq = (list: string[]) => [...new Set(list.filter(Boolean))];

export interface OjrRows {
  s3: Record<string, CellValue>[];
  s5: Record<string, CellValue>[];
  /** Предупреждения (акт без дат и т.п.) — заполнению не мешают. */
  issues: Issue[];
}

export function ojrRows(book: Book): OjrRows {
  const issues: Issue[] = [];
  const rows = (t: TableName) => book.tables[t] ?? [];
  const all = reps(book);
  const byName = (name: string, role?: RoleCode) =>
    all.find((r) => r.fullName === name && (!role || r.role === role)) ?? all.find((r) => r.fullName === name);
  const active = (role: RoleCode, date: string) => activeRepresentatives(all, role, date);
  const acts = rows("Акты");

  // ---- Раздел 3: дата → работы актов и подписанты (по порядку актов).
  const days = new Map<string, { works: string[]; signers: string[]; acts: string[] }>();
  for (const a of acts) {
    const n = txt(a.v.baseNumber);
    const from = iso(a.v.dateStart), to = iso(a.v.dateEnd);
    if (!from || !to) {
      issues.push({ table: "Акты", row: a.row, column: column("Акты", "dateStart").header, message: `Нет дат работ — акт «${n}» не попал в раздел 3 журнала` });
      continue;
    }
    const works = txt(a.v.works);
    const date = iso(a.v.date) ?? to;
    const signer = who(byName(txt(a.v.vorContractor), "performer") ?? active("performer", date).at(-1));
    for (const day of workDays(from, to)) {
      const e = days.get(day) ?? { works: [], signers: [], acts: [] };
      e.works.push(works);
      e.signers.push(signer);
      e.acts.push(n);
      days.set(day, e);
    }
  }
  const conditions = txt(book.object.workConditions);
  const s3 = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, e]) => ({
    [H3("date")]: isoToExcelSerial(day),
    [H3("conditions")]: conditions || null,
    [H3("works")]: uniq(e.works).join("\n"),
    [H3("signer")]: uniq(e.signers).join("\n") || null,
    [H3("acts")]: joinRefs(uniq(e.acts)),
  }));

  // ---- Раздел 5: исполнительная документация актов, по дате подписания.
  const docs: { date: string; seq: number; name: string; signers: string[]; act: string }[] = [];
  let seq = 0;
  const add = (date: string | null, name: string, signers: string[], act: string) =>
    docs.push({ date: date ?? "", seq: seq++, name: name.trim(), signers: uniq(signers), act });
  const lab = rows("Электролаборатория")[0];
  for (const a of acts) {
    const n = txt(a.v.baseNumber);
    const date = iso(a.v.date);
    const of = (t: TableName) => rows(t).filter((r) => txt(r.v.act) === n);
    const hasMats = of("МатериалыАктов").length > 0;
    const at = date ?? iso(a.v.dateEnd) ?? "";
    const roles: RoleCode[] = ["developer_control", "builder", "builder_control", "designer", "performer", "other"];
    const appx = hasMats
      ? `, приложения: ${DOC_NAMES["РИМ"]!.toLowerCase()} ${withNo(docNumber(n, "rim"))}, ${DOC_NAMES["ВД"]!.toLowerCase()} ${withNo(docNumber(n, "vd"))}`
      : "";
    add(date, `${DOC_NAMES["АОСР"]} ${withNo(docNumber(n, "aosr"))} ${txt(a.v.works)}${appx}`, roles.flatMap((r) => active(r, at).map(who)), n);
    for (const s of of("Схемы")) {
      const name = txt(s.v.kind) === "Прочее" ? `${txt(s.v.name)} ${withNo(txt(s.v.number))}` : `Исполнительная схема ${withNo(txt(s.v.number))} ${txt(s.v.name)}`;
      const sd = iso(s.v.date) ?? at;
      add(sd, name, [...active("performer", sd).map(who), ...active("builder_control", sd).map(who)], n);
    }
    if (hasMats) {
      const ad = iso(a.v.avkDate) ?? iso(a.v.dateStart) ?? at;
      const customer = byName(txt(a.v.vorCustomer)) ?? active("developer_control", ad)[0];
      const contractor = byName(txt(a.v.vorContractor), "performer") ?? active("performer", ad).at(-1);
      add(ad, `${AVK_NAME} ${withNo(txt(a.v.avkNumber) || avkDefaultNumber(n, txt(a.v.section)))}`, [who(customer), who(contractor)], n);
    }
    if (of("КабельныйЖурнал").length) {
      const doc: BookRow | undefined = of("ДокументыКабелей")[0];
      const jd = doc ? iso(doc.v.journalDate) : null;
      const code = doc ? txt(doc.v.journalCode) : "";
      const kjDate = jd ?? at;
      add(kjDate, `${KJ_NAME}${code ? ` № ${code}` : ""}`,
        [...active("performer", kjDate).reverse().map(who), ...active("developer_control", kjDate).map(who)], n);
      if (doc && txt(doc.v.protocolNumber)) {
        add(iso(doc.v.dateTo) ?? iso(doc.v.dateFrom) ?? kjDate,
          `Протокол ${withNo(txt(doc.v.protocolNumber))} ${PROTOCOL_NAME.replace(/^Протокол /, "")}`,
          lab ? [`Руководитель электролаборатории ${txt(lab.v.head)}`, `Испытания провёл ${txt(lab.v.tester)}`] : [], n);
      }
    }
  }
  docs.sort((x, y) => x.date.localeCompare(y.date) || x.seq - y.seq);
  const s5 = docs.map((x) => ({
    [H5("name")]: x.name,
    [H5("signed")]: [x.date ? formatDateShort(x.date) : "", ...x.signers].filter(Boolean).join("\n"),
    [H5("act")]: x.act,
  }));
  return { s3, s5, issues };
}

/** Перестраивает листы ОЖР из актов; исправленные вручную условия раздела 3 сохраняются по дате. */
export async function fillOjr(store: TableStore, book: Book): Promise<OjrRows> {
  const res = ojrRows(book);
  const kept = new Map<string, CellValue>();
  for (const r of book.tables["ОЖР3"] ?? []) {
    const day = iso(r.v.date);
    if (day && txt(r.v.conditions)) kept.set(day, r.v.conditions);
  }
  for (const r of res.s3) {
    const day = iso(r[H3("date")]);
    if (day && kept.has(day)) r[H3("conditions")] = kept.get(day)!;
  }
  for (const [t, recs] of [["ОЖР3", res.s3], ["ОЖР5", res.s5]] as const) {
    const old = (book.tables[t] ?? []).map((r) => r.row);
    if (old.length) await store.remove(t, old);
    const data = await store.read(t);
    if (recs.length) await store.insert(t, data?.rows.length ?? 0, recs);
  }
  return res;
}

/** Задание печати раздела из листа книги (строки как на листе, по порядку). null — лист пуст. */
export function ojrPrintRequest(book: Book, section: 3 | 5): OjrRequest | null {
  const name = txt(book.object.name);
  if (section === 3) {
    const rows = (book.tables["ОЖР3"] ?? []).map((r) => {
      const day = iso(r.v.date);
      return { date: day ? day.split("-").reverse().join(".") : txt(r.v.date), conditions: txt(r.v.conditions), works: txt(r.v.works), signer: txt(r.v.signer) };
    });
    return rows.length ? { section: 3, objectName: name, rows } : null;
  }
  const rows = (book.tables["ОЖР5"] ?? []).map((r) => ({ name: txt(r.v.name), signed: txt(r.v.signed) }));
  return rows.length ? { section: 5, objectName: name, rows } : null;
}
