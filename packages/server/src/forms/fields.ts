// Значения меток своих форм из пакета акта — теми же построителями, что встроенные формы СБД,
// чтобы номера, даты и подписи в своей форме совпадали со встроенной печатью.
import type { ActBundle } from "@idk/shared/workbook/bundle";
import type { Organization } from "@idk/shared/schemas";
import { ROLE_CODES, type RoleCode } from "@idk/shared/roles";
import { activeRepresentatives } from "@idk/shared/rules";
import { docNumberFor, formatDateShort, formatDateLong, formatNumber, MONTHS_GEN } from "@idk/shared/acts/format";
import type { FormSet } from "@idk/shared/templates";
import { repLine } from "@idk/shared/acts/repLine";
import { ROLE_GROUPS, type FormData } from "@idk/shared/forms/fields";
import { buildDocDataFromBundle, buildAvkData } from "../print/fromBundle.ts";
import { protoFormData, emptyProtoFormData } from "@idk/shared/protocols/form";

export type { FormData };

/** Метки своей формы. doc.code — код своего документа (номер «<акт>.<код>»); doc.set — набор форм шаблона (нумерация). */
export function formData(b: ActBundle, doc?: { code?: string; set?: FormSet }): FormData {
  const set = doc?.set ?? "sbd";
  const [yy, mm, dd] = (b.act.date ?? "").split("-");
  const act = b.act;
  const org = (id: number | null | undefined): Organization | undefined => b.organizations.find((o) => o.id === id);
  const section = act.sectionId !== null ? b.sections.find((s) => s.id === act.sectionId) : undefined;
  const aosr = buildDocDataFromBundle(b, "aosr", { formSet: set });
  const vd = buildDocDataFromBundle(b, "vd");
  const avk = buildAvkData(b);
  const mat = (id: number) => b.materials.find((m) => m.id === id);
  const v: Record<string, string> = {
    "Объект.Наименование": b.object.name,
    "Объект.Адрес": b.object.address,
    "Объект.Город": b.object.city,
    "Объект.Договор": b.object.contractNumber,
    "Объект.Дата договора": formatDateShort(b.object.contractDate),
    "Объект.Застройщик": org(b.object.roles.developer)?.shortName ?? "",
    "Объект.Строительство": org(b.object.roles.builder)?.shortName ?? "",
    "Объект.Проектировщик": org(section?.designerOrgId ?? b.object.roles.designer)?.shortName ?? "",
    "Объект.Шифр РД": section?.code ?? "",
    "Объект.Раздел": section?.name ?? "",
    "Объект.Подрядчик": org(act.performerOrgId)?.shortName ?? "",
    "Акт.Номер": act.baseNumber,
    "Акт.Номер документа": doc?.code ? `${act.baseNumber}.${doc.code}` : aosr.number,
    "Акт.Номер АОСР": aosr.number,
    "Акт.Номер РИМ": docNumberFor(act.baseNumber, "rim", set),
    "Акт.Номер ВД": docNumberFor(act.baseNumber, "vd", set),
    "Акт.Номер РП": docNumberFor(act.baseNumber, "rp", set),
    "Акт.Дата": formatDateShort(act.date),
    "Акт.День": dd ?? "",
    "Акт.Месяц": mm ? MONTHS_GEN.at(Number(mm) - 1) ?? "" : "",
    "Акт.Год": yy ?? "",
    "Акт.Дата прописью": aosr.date,
    "Акт.Работы": act.works,
    "Акт.Начало": formatDateShort(act.dateStart),
    "Акт.Окончание": formatDateShort(act.dateEnd),
    "Акт.Начало прописью": aosr.dateStart,
    "Акт.Окончание прописью": aosr.dateEnd,
    "Акт.Нормативы": act.normative,
    "Акт.Разрешается": act.nextWorks,
    "Акт.Доп. сведения": act.extraInfo,
    "Акт.Экз.": String(act.copies),
    "Акт.Приложения": act.attachments,
    "Акт.Листы": act.sheets,
    "Акт.Ревизия": act.revision,
    "Акт.Выполнивший работы": aosr.performerOrg,
    "Акт.П.2": aosr.p2,
    "Акт.П.3": aosr.p3.join("\n"),
    "Акт.П.4": aosr.p4.join("\n"),
    "АВК.Номер": avk.number,
    "АВК.Дата": avk.date,
  };
  for (const role of ROLE_CODES as readonly RoleCode[]) {
    const g = ROLE_GROUPS[role];
    const list = activeRepresentatives(b.representatives, role, act.date);
    const join = (f: (r: (typeof list)[number]) => string) => list.map(f).filter(Boolean).join("\n");
    v[`${g}.ФИО`] = join((r) => r.fullName);
    v[`${g}.Должность`] = join((r) => r.position);
    v[`${g}.Организация`] = join((r) => org(r.orgId)?.shortName ?? "");
    v[`${g}.Приказ`] = join((r) => r.authorityDoc);
    v[`${g}.НРС`] = join((r) => r.nrsNumber);
    v[`${g}.Подпись`] = join((r) => [r.position, r.fullName].map((s) => s.trim()).filter(Boolean).join(" "));
    v[`${g}.Строка АОСР`] = join((r) => repLine(r, org(r.orgId)));
  }
  const docsOf = new Map(avk.rows.map((r, i) => [i, r.docs]));
  // Протокол или акт плана 13: группы «Документ», «Лаборатория», списки «Строки», «Комиссия», «Приборы».
  const proto = b.proto ? protoFormData(b.proto) : emptyProtoFormData();
  return {
    values: { ...v, ...proto.values },
    lists: {
      "Материалы": vd.rows.map((r, i) => {
        const am = b.actMaterials[i];
        const m = am ? mat(am.materialId) : undefined;
        return {
          "Материал.№": String(i + 1), "Материал.Наименование": r.name, "Материал.Марка": m?.mark ?? "", "Материал.Артикул": r.article,
          "Материал.Завод": r.manufacturer, "Материал.Ед.": r.unit, "Материал.Кол-во": r.quantity, "Материал.Документы": docsOf.get(i) ?? "",
        };
      }),
      "Схемы": b.documents.map((d, i) => ({
        "Схема.№": String(i + 1), "Схема.Номер": d.number, "Схема.Наименование": d.name, "Схема.Дата": formatDateShort(d.date),
        "Схема.Вид": d.kind === "scheme" ? "Исполнительная схема" : "Прочее",
      })),
      "ВОР": b.vor.map((l, i) => ({
        "ВОР.№": String(i + 1), "ВОР.Участок": l.group, "ВОР.Материал": mat(l.materialId)?.name ?? "",
        "ВОР.Ед.": mat(l.materialId)?.unit ?? "", "ВОР.Объём": formatNumber(l.quantity),
      })),
      ...proto.lists,
    },
  };
}
