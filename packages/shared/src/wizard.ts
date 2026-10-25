// План 17: мастер первого акта — данные пяти шагов, проверка шага и строки книги (те же таблицы, что заполняются вручную).
import { OBJECT_FIELDS, ROLE_BOOK_LABELS, column, type TableName } from "./workbook/schema.ts";
import { cellText, isoToExcelSerial, type CellValue } from "./workbook/values.ts";
import type { Book } from "./workbook/records.ts";
import type { BookRecords } from "./workbook/write.ts";
import type { RoleCode } from "./roles.ts";

export const WIZARD_STEPS = ["Объект", "Участники", "Шифр раздела", "Материалы", "Акт"] as const;

export interface WizOrg { shortName: string; fullName: string; inn: string; ogrn: string; address: string }
export interface WizRep { role: RoleCode; fullName: string; position: string; org: string; authorityDoc: string; nrsNumber: string }
export interface WizMaterial { name: string; mark: string; unit: string; manufacturer: string; quantity: string }
export type OrgRole = "developer" | "builder" | "designer" | "performer";
export const ORG_ROLES: readonly { key: OrgRole; label: string }[] = [
  { key: "developer", label: "Застройщик (технический заказчик)" },
  { key: "builder", label: "Лицо, осуществляющее строительство" },
  { key: "designer", label: "Проектировщик" },
  { key: "performer", label: "Выполнивший работы" },
];

export interface WizardData {
  object: { name: string; address: string; city: string };
  orgs: Record<OrgRole, WizOrg>;
  reps: WizRep[];
  section: { code: string; name: string };
  materials: WizMaterial[];
  /** Даты — ГГГГ-ММ-ДД (поле даты браузера). */
  act: { number: string; date: string; works: string; dateStart: string; dateEnd: string; normative: string; nextWorks: string };
}

const org = (): WizOrg => ({ shortName: "", fullName: "", inn: "", ogrn: "", address: "" });
const rep = (role: RoleCode): WizRep => ({ role, fullName: "", position: "", org: "", authorityDoc: "", nrsNumber: "" });

export function emptyWizard(): WizardData {
  return {
    object: { name: "", address: "", city: "" },
    orgs: { developer: org(), builder: org(), designer: org(), performer: org() },
    reps: [rep("developer_control"), rep("builder"), rep("builder_control"), rep("performer")],
    section: { code: "", name: "" },
    materials: [{ name: "", mark: "", unit: "", manufacturer: "", quantity: "" }],
    act: { number: "", date: "", works: "", dateStart: "", dateEnd: "", normative: "", nextWorks: "" },
  };
}

/** Организация роли «Выполнивший работы» не указана — работы выполнило лицо, осуществляющее строительство. */
export const performerOf = (d: WizardData): WizOrg => (d.orgs.performer.shortName.trim() ? d.orgs.performer : d.orgs.builder);

const NEED = "Заполните";
const num = (s: string) => Number(s.replace(",", ".").replace(/\s/g, ""));

/** Ошибки шага: ключ поля → текст. Пусто — шаг заполнен. */
export function stepErrors(step: number, d: WizardData, book?: Book): Record<string, string> {
  const e: Record<string, string> = {};
  const req = (key: string, v: string) => { if (!v.trim()) e[key] = NEED; };
  if (step === 0) req("object.name", d.object.name);
  if (step === 1) {
    for (const r of ["developer", "builder", "designer"] as const) {
      const o = d.orgs[r];
      for (const f of ["shortName", "fullName", "inn", "ogrn", "address"] as const) req(`orgs.${r}.${f}`, o[f]);
    }
    const p = d.orgs.performer;
    if (p.shortName.trim()) for (const f of ["fullName", "inn", "ogrn", "address"] as const) req(`orgs.performer.${f}`, p[f]);
    const names = new Set(ORG_ROLES.map((r) => d.orgs[r.key].shortName.trim()).filter(Boolean));
    d.reps.forEach((r, i) => {
      if (!r.fullName.trim()) return; // пустая строка представителя — не нужна
      for (const f of ["position", "org", "authorityDoc"] as const) req(`reps.${i}.${f}`, r[f]);
      if (r.org.trim() && !names.has(r.org.trim())) e[`reps.${i}.org`] = "Выберите организацию из участников";
    });
    if (!d.reps.some((r) => r.fullName.trim())) e["reps"] = "Добавьте хотя бы одного представителя";
  }
  if (step === 2) req("section.code", d.section.code);
  if (step === 3) {
    const filled = d.materials.filter((m) => m.name.trim());
    if (!filled.length) e["materials"] = "Добавьте хотя бы один материал";
    d.materials.forEach((m, i) => {
      if (!m.name.trim()) return;
      if (m.name.includes(";")) e[`materials.${i}.name`] = "Без «;»";
      req(`materials.${i}.unit`, m.unit);
      req(`materials.${i}.manufacturer`, m.manufacturer);
      if (m.quantity.trim() && !(num(m.quantity) >= 0)) e[`materials.${i}.quantity`] = "Число";
    });
  }
  if (step === 4) {
    const a = d.act;
    for (const f of ["number", "date", "works", "dateStart", "dateEnd", "normative", "nextWorks"] as const) req(`act.${f}`, a[f]);
    if (a.dateStart && a.dateEnd && a.dateStart > a.dateEnd) e["act.dateEnd"] = "Раньше начала работ";
    if (a.dateEnd && a.date && a.dateEnd > a.date) e["act.date"] = "Раньше окончания работ";
    if (book && a.number.trim() && (book.tables["Акты"] ?? []).some((r) => norm(r.v.baseNumber) === a.number.trim().toLowerCase()))
      e["act.number"] = "Такой акт уже есть в книге";
  }
  return e;
}

/** Ошибки всех шагов (для «Создать акт»). */
export const allErrors = (d: WizardData, book?: Book) => Object.assign({}, ...WIZARD_STEPS.map((_, i) => stepErrors(i, d, book))) as Record<string, string>;

const H = (t: TableName, key: string) => column(t, key).header;
const norm = (v: CellValue | undefined) => cellText(v ?? null).trim().toLowerCase();
const date = (iso: string) => (iso ? isoToExcelSerial(iso) : null);

/** Строки книги из данных мастера; организации, представители, шифр и материалы, уже имеющиеся в книге, не повторяются. */
export function wizardRecords(book: Book, d: WizardData): BookRecords {
  const has = (t: TableName, key: string, v: string) => (book.tables[t] ?? []).some((r) => norm(r.v[key]) === v.trim().toLowerCase());
  const out: BookRecords = {};
  const push = (t: TableName, rec: Record<string, CellValue>) => (out[t] ??= []).push(rec);
  const performer = performerOf(d);

  const field = (key: string, value: string) => {
    const f = OBJECT_FIELDS.find((x) => x.key === key)!;
    if (value.trim()) push("Объект", { "Поле": f.label, "Значение": value.trim() });
  };
  field("name", d.object.name);
  field("address", d.object.address);
  field("city", d.object.city);
  field("developer", d.orgs.developer.shortName);
  field("builder", d.orgs.builder.shortName);
  field("designer", d.orgs.designer.shortName);
  field("performer", performer.shortName);

  const seenOrg = new Set<string>();
  for (const o of [d.orgs.developer, d.orgs.builder, d.orgs.designer, d.orgs.performer]) {
    const k = o.shortName.trim().toLowerCase();
    if (!k || seenOrg.has(k) || has("Организации", "shortName", o.shortName)) continue;
    seenOrg.add(k);
    push("Организации", {
      [H("Организации", "shortName")]: o.shortName.trim(), [H("Организации", "fullName")]: o.fullName.trim(),
      [H("Организации", "inn")]: o.inn.trim(), [H("Организации", "ogrn")]: o.ogrn.trim(), [H("Организации", "address")]: o.address.trim(),
    });
  }
  const repsInBook = new Set((book.tables["Представители"] ?? []).map((r) => `${norm(r.v.fullName)}|${norm(r.v.org)}`));
  for (const r of d.reps) {
    if (!r.fullName.trim()) continue;
    const k = `${r.fullName.trim().toLowerCase()}|${r.org.trim().toLowerCase()}`;
    if (repsInBook.has(k)) continue;
    repsInBook.add(k);
    push("Представители", {
      [H("Представители", "role")]: ROLE_BOOK_LABELS[r.role], [H("Представители", "position")]: r.position.trim(),
      [H("Представители", "fullName")]: r.fullName.trim(), [H("Представители", "org")]: r.org.trim(),
      [H("Представители", "authorityDoc")]: r.authorityDoc.trim(), [H("Представители", "nrsNumber")]: r.nrsNumber.trim() || null,
    });
  }
  if (!has("Шифры", "code", d.section.code)) {
    push("Шифры", { [H("Шифры", "code")]: d.section.code.trim(), [H("Шифры", "name")]: d.section.name.trim(), [H("Шифры", "designer")]: d.orgs.designer.shortName.trim() });
  }
  const mats = d.materials.filter((m) => m.name.trim());
  for (const m of mats) {
    if (has("Материалы", "name", m.name)) continue;
    push("Материалы", {
      [H("Материалы", "name")]: m.name.trim(), [H("Материалы", "mark")]: m.mark.trim(), [H("Материалы", "unit")]: m.unit.trim(),
      [H("Материалы", "manufacturer")]: m.manufacturer.trim(),
    });
  }
  const a = d.act;
  push("Акты", {
    [H("Акты", "baseNumber")]: a.number.trim(), [H("Акты", "date")]: date(a.date), [H("Акты", "section")]: d.section.code.trim(),
    [H("Акты", "works")]: a.works.trim(), [H("Акты", "dateStart")]: date(a.dateStart), [H("Акты", "dateEnd")]: date(a.dateEnd),
    [H("Акты", "normative")]: a.normative.trim(), [H("Акты", "nextWorks")]: a.nextWorks.trim(),
    [H("Акты", "performerOrg")]: performer.shortName.trim(),
  });
  for (const m of mats) {
    // Название материала — как в книге, если он там уже есть (регистр и пробелы).
    const existing = (book.tables["Материалы"] ?? []).find((r) => norm(r.v.name) === m.name.trim().toLowerCase());
    push("МатериалыАктов", {
      [H("МатериалыАктов", "act")]: a.number.trim(),
      [H("МатериалыАктов", "material")]: existing ? cellText(existing.v.name) : m.name.trim(),
      [H("МатериалыАктов", "quantity")]: m.quantity.trim() ? num(m.quantity) : null,
    });
  }
  return out;
}
