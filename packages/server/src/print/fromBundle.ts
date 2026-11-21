import type { DocKind } from "@idk/shared/acts/schemas";
import type { RoleCode } from "@idk/shared/roles";
import type { Organization, Representative } from "@idk/shared/schemas";
import type { ActBundle } from "@idk/shared/workbook/bundle";
import { activeRepresentatives, orgFullForm } from "@idk/shared/rules";
import { docNumberFor, formatDateLong, formatDateShort, withNo } from "@idk/shared/acts/format";
import { kamSchemeName } from "./tiData.ts";
import { column } from "@idk/shared/workbook/schema";
import { repLine } from "@idk/shared/acts/repLine";
import {
  point3Lines,
  point4Lines,
  rimRows,
  vdRows,
  vorRows,
  signers,
  avkRows,
  avkDefaultNumber,
  SIGN_LABELS,
  MATERIALS_INLINE_LIMIT,
} from "@idk/shared/acts/rows";
import type { PrintOptions } from "@idk/shared/templates";
import type { AvkData, AosrData, RimData, VdData, VorData, DocData } from "./data.ts";

/** Полная форма реквизитов для шапки АОСР — с точкой в конце, как в бланке. */
const full = (o: Organization | undefined) => {
  if (!o) return "";
  const t = orgFullForm(o).trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/** 0.46: АОСР «Камчатки» — п.3 и приложения ссылкой на реестры, п.4 — нумерованный список схем (как в образце). */
export const KAM_P3 = "Согласно реестра примененных материалов";
export const KAM_ATTACHMENTS = "Согласно реестру приложений";
const AOSR_ATTACHMENTS_DEFAULT = String(column("Акты", "attachments").default ?? "");
export function kamPoint4(docs: ActBundle["documents"]): string[] {
  if (!docs.length) return ["Не требуется"];
  return [...docs]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d, i) => {
      const tail = d.kind === "scheme" ? "" : [withNo(d.number), d.date ? `от ${formatDateShort(d.date)}` : ""].filter(Boolean).join(" ");
      return `${i + 1}. ${[kamSchemeName(d), tail].filter(Boolean).join(" ")}`;
    });
}

const AOSR_ROLES: RoleCode[] = ["developer_control", "builder", "builder_control", "designer", "performer"];
const APPENDIX_ROLES: RoleCode[] = ["developer_control", "builder", "builder_control", "performer"];

/** Данные документа акта из пакета (все строки уже отформатированы правилами). */
export function buildDocDataFromBundle<K extends DocKind>(b: ActBundle, kind: K, options: Partial<PrintOptions> = {}): DocData[K] {
  const act = b.act;
  const orgList = b.organizations;
  const org = (id: number | null | undefined): Organization | undefined => orgList.find((o) => o.id === id);
  const obj = b.object;
  const section = act.sectionId !== null ? b.sections.find((s) => s.id === act.sectionId) : undefined;
  const reps = b.representatives;
  const mats = b.materials;
  const actMats = b.actMaterials;
  const vor = b.vor;
  const docsByMaterial = new Map(actMats.map((m) => [m.materialId, b.qualityDocs.filter((d) => d.materialIds.includes(m.materialId))]));
  const set = options.formSet ?? "sbd";
  const kam = set === "kam";
  const aosrNumber = docNumberFor(act.baseNumber, "aosr", set);
  const repText = (r: Representative | undefined) =>
    r
      ? [r.position, org(r.orgId)?.shortName ?? "", r.fullName]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ")
      : "";

  const build = {
    aosr: (): AosrData => {
      const roles: RoleCode[] = [...AOSR_ROLES, ...(activeRepresentatives(reps, "other", act.date).length ? ["other" as RoleCode] : [])];
      const designer = org(section?.designerOrgId ?? obj.roles.designer);
      return {
        objectName: obj.name,
        developer: full(org(obj.roles.developer)),
        builder: full(org(obj.roles.builder)),
        designer: full(designer),
        number: aosrNumber,
        date: formatDateLong(act.date),
        reps: roles.map((role) => {
          const list = activeRepresentatives(reps, role, act.date);
          return { label: SIGN_LABELS[role], lines: list.length ? list.map((r) => repLine(r, org(r.orgId))) : [""] };
        }),
        performerOrg: org(act.performerOrgId)?.shortName ?? "",
        works: act.works,
        p2:
          [`Шифр рабочей документации: ${section?.code ?? ""}`, act.sheets && `листы ${act.sheets}`].filter(Boolean).join(" ") +
          [act.revision, designer?.shortName]
            .filter(Boolean)
            .map((s) => `, ${s}`)
            .join(""),
        // «Камчатка»: материалов больше 5 — ссылкой на реестр, иначе — материалы с документами (как в п.3 по 344/пр).
        p3: kam && actMats.length > MATERIALS_INLINE_LIMIT ? [KAM_P3] : point3Lines(actMats, mats, docsByMaterial, act.baseNumber, set),
        p4: kam ? kamPoint4(b.documents) : point4Lines(b.documents, options),
        dateStart: formatDateLong(act.dateStart),
        dateEnd: formatDateLong(act.dateEnd),
        normative: act.normative,
        nextWorks: act.nextWorks,
        extraInfo: act.extraInfo,
        copies: act.copies,
        // «Камчатка»: пусто или значение по умолчанию книги («Согласно п.3, п.4.») — ссылка на реестр приложений.
        attachments: kam && (!act.attachments.trim() || act.attachments.trim() === AOSR_ATTACHMENTS_DEFAULT) ? KAM_ATTACHMENTS : act.attachments,
        signs: signers(reps, roles, act.date),
      };
    },
    rim: (): RimData => ({
      aosrNumber,
      number: docNumberFor(act.baseNumber, "rim", set),
      rows: rimRows(actMats, mats, docsByMaterial),
      signs: signers(reps, APPENDIX_ROLES, act.date),
    }),
    vd: (): VdData => ({
      aosrNumber,
      number: docNumberFor(act.baseNumber, "vd", set),
      rows: vdRows(actMats, mats, vor),
      signs: signers(reps, APPENDIX_ROLES, act.date),
    }),
    vor: (): VorData => ({
      objectName: obj.name,
      title: act.vorTitle || section?.name || "",
      sectionCode: section?.code ?? "",
      rows: vorRows(vor, mats, actMats),
      customer: repText(reps.find((r) => r.id === act.vorCustomerRepId)),
      contractor: repText(reps.find((r) => r.id === act.vorContractorRepId)),
    }),
  };
  return build[kind]() as DocData[K];
}

/** Данные акта входного контроля: материалы акта; комиссия — подписанты ВОР, иначе технадзор и последний выполнивший работы. */
export function buildAvkData(b: ActBundle): AvkData {
  const act = b.act;
  const org = (id: number | null | undefined): Organization | undefined => b.organizations.find((o) => o.id === id);
  const section = act.sectionId !== null ? b.sections.find((s) => s.id === act.sectionId) : undefined;
  const repText = (r: Representative | undefined) =>
    r
      ? [r.position, org(r.orgId)?.shortName ?? "", r.fullName]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ")
      : "";
  const date = b.avk?.date ?? act.dateStart ?? act.date;
  const customer = b.representatives.find((r) => r.id === act.vorCustomerRepId) ?? activeRepresentatives(b.representatives, "developer_control", date)[0];
  const contractor = b.representatives.find((r) => r.id === act.vorContractorRepId) ?? activeRepresentatives(b.representatives, "performer", date).at(-1);
  const docsByMaterial = new Map(b.actMaterials.map((m) => [m.materialId, b.qualityDocs.filter((d) => d.materialIds.includes(m.materialId))]));
  return {
    number: b.avk?.number || avkDefaultNumber(act.baseNumber, section?.code ?? ""),
    date: formatDateShort(date),
    city: b.object.city,
    customer: org(b.object.roles.developer)?.shortName ?? "",
    objectName: b.object.name,
    customerRep: repText(customer),
    contractorRep: repText(contractor),
    sectionName: section?.name ?? "",
    sectionCode: section?.code ?? "",
    rows: avkRows(b.actMaterials, b.materials, docsByMaterial, b.vor),
  };
}
