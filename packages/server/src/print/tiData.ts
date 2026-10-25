// План 14: данные форм набора «ТИ» (ВД, РМ, РП и шапка КЖ) из пакета акта — по образцам ООО «Техноинжиниринг».
import type { ActBundle } from "@idk/shared/workbook/bundle";
import type { RoleCode } from "@idk/shared/roles";
import { QUALITY_DOC_LABELS } from "@idk/shared/roles";
import { activeRepresentatives } from "@idk/shared/rules";
import { docNumberFor, formatNumber, MONTHS_GEN } from "@idk/shared/acts/format";
import { rimDocOrder, vorTotals } from "@idk/shared/acts/rows";

/** Подписи ролей в формах «ТИ» (как в образцах). */
export const TI_SIGN_LABELS: Partial<Record<RoleCode, string>> = {
  developer_control: "Представитель застройщика, технического заказчика, лица, ответственного за эксплуатацию здания, сооружения, или регионального оператора по вопросам строительного контроля:",
  builder: "Представитель лица, осуществляющего строительство, реконструкцию, капитальный ремонт:",
  builder_control: "Представитель лица, осуществляющего строительство, реконструкцию, капитальный ремонт, по вопросам строительного контроля:",
  designer: "Представитель лица, осуществляющего подготовку проектной документации:",
  performer: "Представитель лица, выполнившего работы, подлежащие освидетельствованию:",
};
const ROLES: RoleCode[] = ["developer_control", "builder", "builder_control", "designer", "performer"];

export interface TiHeader { contractor: string; city: string; sectionName: string; sectionCode: string; customer: string; object: string; day: string; month: string; year: string }
export interface TiSign { label: string; names: string[] }
export interface TiData {
  header: TiHeader;
  aosrNumber: string; actDate: string;
  vdNumber: string; rmNumber: string; rpNumber: string;
  vd: { n: number; name: string; type: string; quantity: string; unit: string }[];
  rm: { type: string; date: string; number: string; items: { n: number; name: string }[] }[];
  rp: { n: number; type: string; date: string; number: string; sheets: number }[];
  signs: TiSign[];
}

/** «ДД.ММ.ГГГГ» без «г.». */
export const dmy = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join(".") : "");

export function tiHeader(b: ActBundle, dateIso: string | null): TiHeader {
  const org = (id: number | null | undefined) => b.organizations.find((o) => o.id === id)?.shortName ?? "";
  const section = b.sections.find((s) => s.id === b.act.sectionId);
  const [y = "", m = "", d = ""] = (dateIso ?? "").split("-");
  return {
    contractor: org(b.act.performerOrgId), city: b.object.city, sectionName: section?.name ?? "", sectionCode: section?.code ?? "",
    customer: org(b.object.roles.developer), object: b.object.name, day: d, month: m ? MONTHS_GEN.at(Number(m) - 1) ?? "" : "", year: y,
  };
}

export function tiDocData(b: ActBundle): TiData {
  const act = b.act;
  const mats = new Map(b.materials.map((m) => [m.id, m]));
  const ordered = [...b.actMaterials].sort((a, c) => a.sortOrder - c.sortOrder);
  const totals = vorTotals(b.vor);
  const docsByMaterial = new Map(ordered.map((am) => [am.materialId, b.qualityDocs.filter((d) => d.materialIds.includes(am.materialId))]));
  const docs = rimDocOrder(ordered, docsByMaterial);
  let n = 0;
  return {
    header: tiHeader(b, act.date),
    aosrNumber: docNumberFor(act.baseNumber, "aosr", "ti"), actDate: dmy(act.date),
    vdNumber: docNumberFor(act.baseNumber, "vd", "ti"), rmNumber: docNumberFor(act.baseNumber, "rim", "ti"), rpNumber: docNumberFor(act.baseNumber, "rp", "ti"),
    vd: ordered.map((am, i) => {
      const m = mats.get(am.materialId);
      return { n: i + 1, name: m?.name ?? "", type: m?.mark || m?.article || "", quantity: formatNumber(am.quantity ?? totals.get(am.materialId) ?? null), unit: m?.unit ?? "" };
    }),
    rm: docs.map((d) => ({
      type: QUALITY_DOC_LABELS[d.type], date: d.issueDate ? dmy(d.issueDate) : "б/д", number: d.number.replace(/^№\s*/, ""),
      items: ordered.filter((am) => d.materialIds.includes(am.materialId)).map((am) => ({ n: ++n, name: mats.get(am.materialId)?.name ?? "" })),
    })),
    rp: docs.map((d, i) => ({ n: i + 1, type: QUALITY_DOC_LABELS[d.type], date: d.issueDate ? dmy(d.issueDate) : "б/д", number: d.number.replace(/^№\s*/, ""), sheets: d.sheets })),
    signs: tiSigns(b, act.date),
  };
}

/** Подписи пяти ролей АОСР: подпись роли и ФИО действующих на дату (пусто — строка для подписи). */
export function tiSigns(b: ActBundle, date: string): TiSign[] {
  return ROLES.map((role) => {
    const names = activeRepresentatives(b.representatives, role, date).map((r) => r.fullName);
    return { label: TI_SIGN_LABELS[role]!, names: names.length ? names : [""] };
  });
}
