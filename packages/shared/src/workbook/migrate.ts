// Перенос данных из базы сервера в книгу объекта.
import { z } from "zod";
import { ObjectInfo, Organization, Section, Representative, Material, QualityDoc, FileRow } from "../schemas.ts";
import { Act, ActMaterialInput, ActDocumentInput, VorLineInput } from "../acts/schemas.ts";
import { QUALITY_DOC_LABELS } from "../roles.ts";
import { OBJECT_FIELDS, ROLE_BOOK_LABELS, SCHEME_KINDS, type TableName } from "./schema.ts";
import { isoToExcelSerial, cellText, joinRefs, type CellValue } from "./values.ts";
import type { TableStore } from "./store.ts";

export const ExportData = z.object({
  object: ObjectInfo,
  organizations: z.array(Organization),
  sections: z.array(Section),
  representatives: z.array(Representative),
  materials: z.array(Material),
  qualityDocs: z.array(QualityDoc),
  acts: z.array(z.object({
    act: Act, materials: z.array(ActMaterialInput), documents: z.array(ActDocumentInput), vor: z.array(VorLineInput),
  })),
  files: z.array(FileRow),
});
export type ExportData = z.infer<typeof ExportData>;

export type BookRecords = Partial<Record<TableName, Record<string, CellValue>[]>>;
export type BookLinks = Partial<Record<TableName, Record<string, string>[]>>;

export const isEmptyExport = (e: ExportData) => !e.organizations.length && !e.materials.length && !e.acts.length;

const serial = (iso: string | null) => (iso ? isoToExcelSerial(iso) : null);

const ruDate = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : null);

/** Ключи книги должны быть уникальны, а в базе повторы возможны: повтор получает уточнение в скобках. */
function uniqueKeys<T extends { id: number }>(items: T[], name: (x: T) => string, hint: (x: T) => string = () => ""): Map<number, string> {
  const used = new Set<string>();
  const out = new Map<number, string>();
  for (const x of items) {
    const base = name(x).trim();
    let k = base;
    const h = hint(x).trim();
    if (used.has(k) && h) k = `${base} (${h})`;
    for (let n = 2; used.has(k); n++) k = `${base} (${n})`;
    used.add(k);
    out.set(x.id, k);
  }
  return out;
}

export function exportToBook(e: ExportData, _origin: string): BookRecords {
  const orgKeys = uniqueKeys(e.organizations, (o) => o.shortName);
  // «;» разделяет материалы в документе качества — в наименовании заменяется запятой.
  const matKeys = uniqueKeys(e.materials, (m) => m.name.replace(/;/g, ","), (m) => m.mark || m.article);
  const repKeys = uniqueKeys(e.representatives, (r) => r.fullName);
  const secKeys = uniqueKeys(e.sections, (s) => s.code);
  const actKeys = uniqueKeys(e.acts.map((a) => a.act), (a) => a.baseNumber);
  const orgName = (id: number | null) => (id === null ? null : orgKeys.get(id) ?? null);
  const matName = (id: number) => matKeys.get(id) ?? "";
  const repName = (id: number | null) => (id === null ? null : repKeys.get(id) ?? null);
  const fileName = (id: number | null) => (id === null ? null : e.files.find((f) => f.id === id)?.name ?? null);
  const sectionCode = (id: number | null) => (id === null ? null : secKeys.get(id) ?? null);
  const actNo = (id: number) => actKeys.get(id)!;
  const objectValue: Record<string, CellValue> = {
    name: e.object.name, address: e.object.address, city: e.object.city, contractNumber: e.object.contractNumber,
    contractDate: ruDate(e.object.contractDate),
    developer: orgName(e.object.roles.developer), builder: orgName(e.object.roles.builder),
    designer: orgName(e.object.roles.designer), performer: orgName(e.object.roles.performer),
  };
  return {
    "Объект": OBJECT_FIELDS.map((f) => ({ "Поле": f.label, "Значение": objectValue[f.key] ?? null })),
    "Организации": e.organizations.map((o) => ({
      "Краткое наименование": orgKeys.get(o.id)!, "Полное наименование": o.fullName, "ОГРН": o.ogrn, "ИНН": o.inn, "Адрес": o.address,
      "Телефон": o.phone, "СРО: наименование": o.sroName, "СРО: ОГРН": o.sroOgrn, "СРО: ИНН": o.sroInn,
    })),
    "Шифры": e.sections.map((s) => ({ "Шифр": secKeys.get(s.id)!, "Наименование раздела": s.name, "Проектировщик": orgName(s.designerOrgId) })),
    "Представители": e.representatives.map((r) => ({
      "Роль": ROLE_BOOK_LABELS[r.role], "Должность": r.position, "ФИО": repKeys.get(r.id)!, "Организация": orgName(r.orgId),
      "Документ о полномочиях": r.authorityDoc, "НРС №": r.nrsNumber, "Дата НРС": serial(r.nrsDate),
      "Действует с": serial(r.validFrom), "Действует по": serial(r.validTo), "Порядок": r.sortOrder, "Текст для акта": r.actText,
    })),
    "Материалы": e.materials.map((m) => ({
      "Наименование": matKeys.get(m.id)!, "Марка": m.mark, "Артикул": m.article, "Завод-изготовитель": m.manufacturer, "Ед. изм.": m.unit,
    })),
    "ДокументыКачества": e.qualityDocs.map((q) => ({
      "Материалы": joinRefs(q.materialIds.map(matName)), "Тип": QUALITY_DOC_LABELS[q.type], "Номер": q.number,
      "Дата": serial(q.issueDate), "Действует до": serial(q.validUntil), "Листов": q.sheets,
      "Наименование для реестра": q.registryName, "Скан": fileName(q.fileId),
    })),
    "Акты": e.acts.map(({ act: a }) => ({
      "Номер акта": actNo(a.id), "Дата акта": serial(a.date), "Шифр": sectionCode(a.sectionId), "Работы (п.1)": a.works,
      "Листы": a.sheets, "Ревизия": a.revision, "Начало работ": serial(a.dateStart), "Окончание работ": serial(a.dateEnd),
      "Нормативы (п.6)": a.normative, "Разрешается (п.7)": a.nextWorks, "Доп. сведения": a.extraInfo, "Экз.": a.copies,
      "Приложения": a.attachments, "Выполнивший работы": orgName(a.performerOrgId), "Заголовок ВОР": a.vorTitle,
      "ВОР: от заказчика": repName(a.vorCustomerRepId), "ВОР: от монтажников": repName(a.vorContractorRepId),
    })),
    "Схемы": e.acts.flatMap(({ act: a, documents }) => documents.map((d) => ({
      "Акт": actNo(a.id), "Вид": d.kind === "other" ? SCHEME_KINDS[1] : SCHEME_KINDS[0], "Номер": d.number,
      "Наименование": d.name, "Дата": serial(d.date), "Скан": fileName(d.fileId),
    }))),
    "МатериалыАктов": e.acts.flatMap(({ act: a, materials }) => materials.map((m) => ({
      "Акт": actNo(a.id), "Материал": matName(m.materialId), "№ поз. по УСР": m.position, "Кол-во": m.quantity,
    }))),
    "ВОР": e.acts.flatMap(({ act: a, vor }) => vor.map((v) => ({
      "Акт": actNo(a.id), "Этаж / участок": v.group, "Материал": matName(v.materialId), "Объём": v.quantity,
    }))),
  };
}

/** Гиперссылки на сканы, в том же порядке строк, что exportToBook. */
export function exportLinks(e: ExportData, origin: string): BookLinks {
  const link = (id: number | null): Record<string, string> => (id === null ? {} : { "Скан": `${origin}/api/files/${id}` });
  return {
    "ДокументыКачества": e.qualityDocs.map((q) => link(q.fileId)),
    "Схемы": e.acts.flatMap(({ documents }) => documents.map((d) => link(d.fileId))),
  };
}

/** Дописывает записи в конец таблиц; поля «Объект» — в существующие строки с той же подписью. */
export async function writeBook(store: TableStore, rows: BookRecords, links: BookLinks = {}): Promise<void> {
  for (const [name, recs] of Object.entries(rows) as [TableName, Record<string, CellValue>[]][]) {
    if (!recs.length) continue;
    const t = await store.read(name);
    if (!t) continue;
    if (name === "Объект") {
      const fieldIdx = t.headers.indexOf("Поле");
      for (const rec of recs) {
        const at = t.rows.findIndex((r) => cellText(r[fieldIdx]) === rec["Поле"]);
        if (at >= 0) await store.write(name, at, { "Значение": rec["Значение"] });
        else {
          await store.insert(name, t.rows.length, [rec]);
          t.rows.push([rec["Поле"], rec["Значение"]]);
        }
      }
      continue;
    }
    const start = await store.insert(name, t.rows.length, recs);
    const l = links[name] ?? [];
    for (let i = 0; i < l.length; i++) {
      // Значение пишется вместе со ссылкой, чтобы в ячейке осталось имя файла.
      const values = Object.fromEntries(Object.keys(l[i]).map((h) => [h, recs[i][h] ?? null]));
      if (Object.keys(l[i]).length) await store.write(name, start + i, values, l[i]);
    }
  }
}
