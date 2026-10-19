import type { Material, QualityDoc, Representative } from "../schemas.ts";
import { QUALITY_DOC_LABELS, QUALITY_DOC_TYPES, type RoleCode } from "../roles.ts";
import { activeRepresentatives } from "../rules.ts";
import type { ActDocumentInput, ActMaterialInput, VorLineInput } from "./schemas.ts";
import { docNumber, formatDateShort, formatNumber, withNo } from "./format.ts";

export const MATERIALS_INLINE_LIMIT = 5;

/** Подписи ролей в документах СБД. */
export const SIGN_LABELS: Record<RoleCode, string> = {
  developer_control:
    "Представитель застройщика, технического заказчика, лица, ответственного за эксплуатацию здания, сооружения, или регионального оператора по вопросам строительного контроля",
  builder: "Представитель лица, осуществляющего строительство, реконструкцию, капитальный ремонт",
  builder_control:
    "Представитель лица, осуществляющего строительство, реконструкцию, капитальный ремонт, по вопросам строительного контроля",
  designer:
    "Представитель лица, осуществляющего подготовку проектной документации (в случае привлечения застройщиком лица, осуществляющего подготовку проектной документации, для проверки соответствия выполняемых работ проектной документации согласно части 2 статьи 53 Градостроительного кодекса РФ)",
  performer:
    "Представитель лица, выполнившего работы, подлежащие освидетельствованию (в случае выполнения работ по договорам о строительстве, реконструкции, капитальном ремонте объектов капитального строительства, заключенным с иными лицами)",
  other: "Иные представители лиц, участвующих в освидетельствовании",
};

const byOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;
const typeRank = (d: QualityDoc) => QUALITY_DOC_TYPES.indexOf(d.type);
const sortDocs = (docs: QualityDoc[]) => [...docs].sort((a, b) => typeRank(a) - typeRank(b) || a.id - b.id);
const matMap = (ms: Material[]) => new Map(ms.map((m) => [m.id, m]));

const docShort = (d: QualityDoc) =>
  [QUALITY_DOC_LABELS[d.type], withNo(d.number), d.issueDate ? `от ${formatDateShort(d.issueDate)}` : ""].filter(Boolean).join(" ");

/** П.3 АОСР. */
export function point3Lines(
  actMaterials: ActMaterialInput[], materials: Material[], docsByMaterial: Map<number, QualityDoc[]>, base: string,
): string[] {
  if (actMaterials.length > MATERIALS_INLINE_LIMIT) {
    return [
      `Согласно реестру использованных материалов №${docNumber(base, "rim")} ведомости смонтированного оборудования, технических средств и материалов №${docNumber(base, "vd")}`,
    ];
  }
  const mm = matMap(materials);
  return [...actMaterials].sort(byOrder).map((am) => {
    const m = mm.get(am.materialId);
    const docs = sortDocs(docsByMaterial.get(am.materialId) ?? []).map(docShort).join("; ");
    return docs ? `${m?.name ?? ""} — ${docs}` : m?.name ?? "";
  });
}

/**
 * П.4 АОСР. Подряд идущие схемы, как в образце СБД: «Исполнительная схема» только перед первой,
 * строки разделяются «;» (у последней строки списка — без знака).
 */
export function point4Lines(docs: ActDocumentInput[]): string[] {
  const sorted = [...docs].sort(byOrder);
  return sorted.map((d, i) => {
    const last = i === sorted.length - 1;
    if (d.kind !== "scheme")
      return [d.name, withNo(d.number), d.date ? `от ${formatDateShort(d.date)}` : ""].filter(Boolean).join(" ");
    const first = i === 0 || sorted[i - 1].kind !== "scheme";
    const body = [withNo(d.number) && `${withNo(d.number)}.`, d.name].filter(Boolean).join(" ");
    return `${first ? "Исполнительная схема " : ""}${body}${last ? "" : ";"}`;
  });
}

export interface RimRow { name: string; type: string; number: string; date: string; sheets: number }

/**
 * Строки РИМ: один документ — одна строка, по порядку материалов и типов документов.
 * Документ на несколько материалов акта ставится после документов последнего из них (как в образце СБД).
 */
export function rimRows(
  actMaterials: ActMaterialInput[], materials: Material[], docsByMaterial: Map<number, QualityDoc[]>,
): RimRow[] {
  const mm = matMap(materials);
  const inAct = new Set(actMaterials.map((a) => a.materialId));
  const seen = new Set<number>();
  const rows: RimRow[] = [];
  const ordered = [...actMaterials].sort(byOrder);
  const lastIdx = (d: QualityDoc) => Math.max(...ordered.map((x, i) => (d.materialIds.includes(x.materialId) ? i : -1)));
  for (const [idx, am] of ordered.entries()) {
    const own = sortDocs(docsByMaterial.get(am.materialId) ?? []);
    // сначала документы только этого материала (или для которых он последний), общие — в конце
    const docs = [...own.filter((d) => lastIdx(d) === idx && d.materialIds.filter((m) => inAct.has(m)).length <= 1),
                  ...own.filter((d) => lastIdx(d) === idx && d.materialIds.filter((m) => inAct.has(m)).length > 1)];
    for (const d of docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const names = actMaterials
        .filter((x) => d.materialIds.includes(x.materialId) && inAct.has(x.materialId))
        .sort(byOrder)
        .map((x) => mm.get(x.materialId)?.name ?? "");
      rows.push({
        name: d.registryName.trim() || (names.length ? names : [mm.get(am.materialId)?.name ?? ""]).join(", "),
        type: QUALITY_DOC_LABELS[d.type].toLowerCase(),
        number: withNo(d.number),
        date: d.issueDate
          ? d.validUntil ? `от ${formatDateShort(d.issueDate)} до ${formatDateShort(d.validUntil)}` : formatDateShort(d.issueDate)
          : "б/д",
        sheets: d.sheets,
      });
    }
  }
  return rows;
}

/** Суммы объёмов ВОР по материалам (с округлением, без ошибок плавающей точки). */
export function vorTotals(lines: VorLineInput[]): Map<number, number> {
  const t = new Map<number, number>();
  for (const l of lines) t.set(l.materialId, Math.round(((t.get(l.materialId) ?? 0) + l.quantity) * 1000) / 1000);
  return t;
}

export interface VdRow { position: string; name: string; article: string; manufacturer: string; unit: string; quantity: string }

export function vdRows(actMaterials: ActMaterialInput[], materials: Material[], vorLines: VorLineInput[]): VdRow[] {
  const mm = matMap(materials);
  const totals = vorTotals(vorLines);
  return [...actMaterials].sort(byOrder).map((am) => {
    const m = mm.get(am.materialId);
    return {
      position: am.position || "б/н",
      name: m?.name ?? "",
      article: m?.article || m?.mark || "",
      manufacturer: m?.manufacturer ?? "",
      unit: m?.unit ?? "",
      quantity: formatNumber(am.quantity ?? totals.get(am.materialId) ?? null),
    };
  });
}

export type VorRow = { kind: "group"; title: string } | { kind: "line"; name: string; unit: string; quantity: string };

/** Заголовок итогового раздела ВОР: «Итого по этажам П5, П4» для групп «Этаж …». */
export function vorTotalTitle(groups: string[]): string {
  const floors = groups.map((g) => g.match(/^этаж\s+(.+)$/i)?.[1]);
  if (floors.every(Boolean)) return `Итого по этажам ${floors.join(", ")}`;
  return `Итого по разделам: ${groups.join(", ")}`;
}

const vorLineName = (m: Material | undefined) => {
  const extra = [m?.article || m?.mark || "", m?.manufacturer ?? ""].filter(Boolean).join(", ");
  return extra ? `${m?.name ?? ""} (${extra})` : m?.name ?? "";
};

/**
 * Строки ВОР по группам. Если передан порядок материалов акта и групп больше одной,
 * в конце добавляется итоговый раздел с суммами (это и есть количества ВД).
 */
export function vorRows(lines: VorLineInput[], materials: Material[], actMaterials?: ActMaterialInput[]): VorRow[] {
  const mm = matMap(materials);
  const sorted = [...lines].sort(byOrder);
  const groups: string[] = [];
  for (const l of sorted) if (!groups.includes(l.group)) groups.push(l.group);
  const rows: VorRow[] = [];
  for (const g of groups) {
    if (g) rows.push({ kind: "group", title: g });
    for (const l of sorted.filter((x) => x.group === g)) {
      const m = mm.get(l.materialId);
      rows.push({ kind: "line", name: vorLineName(m), unit: m?.unit ?? "", quantity: formatNumber(l.quantity) });
    }
  }
  const named = groups.filter(Boolean);
  if (actMaterials && named.length > 1) {
    const totals = vorTotals(lines);
    rows.push({ kind: "group", title: vorTotalTitle(named) });
    for (const am of [...actMaterials].sort(byOrder)) {
      if (!totals.has(am.materialId)) continue;
      const m = mm.get(am.materialId);
      rows.push({ kind: "line", name: vorLineName(m), unit: m?.unit ?? "", quantity: formatNumber(totals.get(am.materialId)!) });
    }
  }
  return rows;
}

export interface SignBlock { role: RoleCode; label: string; names: string[] }

/** Блоки подписей: для роли без действующих представителей — одна пустая строка. */
export function signers(reps: Representative[], roles: RoleCode[], date: string): SignBlock[] {
  return roles.map((role) => {
    const names = activeRepresentatives(reps, role, date).map((r) => r.fullName);
    return { role, label: SIGN_LABELS[role], names: names.length ? names : [""] };
  });
}
