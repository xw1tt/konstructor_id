import type { Db } from "../db.ts";
import type { DocKind } from "@idk/shared/acts/schemas";
import type { RoleCode } from "@idk/shared/roles";
import type { Organization, Representative } from "@idk/shared/schemas";
import { activeRepresentatives, orgFullForm } from "@idk/shared/rules";
import { docNumber, formatDateLong } from "@idk/shared/acts/format";
import { repLine } from "@idk/shared/acts/repLine";
import {
  point3Lines, point4Lines, rimRows, vdRows, vorRows, signers, SIGN_LABELS,
  type RimRow, type VdRow, type VorRow, type SignBlock,
} from "@idk/shared/acts/rows";
import { HttpError } from "../http/router.ts";
import { acts } from "../repo/acts.ts";
import { organizations } from "../repo/organizations.ts";
import { objectInfo } from "../repo/objectInfo.ts";
import { sections } from "../repo/sections.ts";
import { representatives } from "../repo/representatives.ts";
import { materials } from "../repo/materials.ts";
import { qualityDocs } from "../repo/qualityDocs.ts";

export interface AosrData {
  objectName: string; developer: string; builder: string; designer: string;
  number: string; date: string;
  reps: { label: string; lines: string[] }[];
  performerOrg: string; works: string; p2: string; p3: string[]; p4: string[];
  dateStart: string; dateEnd: string; normative: string; nextWorks: string;
  extraInfo: string; copies: number; attachments: string; signs: SignBlock[];
}
export interface RimData { aosrNumber: string; number: string; rows: RimRow[]; signs: SignBlock[] }
export interface VdData { aosrNumber: string; number: string; rows: VdRow[]; signs: SignBlock[] }
export interface VorData { objectName: string; title: string; sectionCode: string; rows: VorRow[]; customer: string; contractor: string }
export type DocData = { aosr: AosrData; rim: RimData; vd: VdData; vor: VorData };

const AOSR_ROLES: RoleCode[] = ["developer_control", "builder", "builder_control", "designer", "performer"];
const APPENDIX_ROLES: RoleCode[] = ["developer_control", "builder", "builder_control", "performer"];

/** Собирает из базы данные документа акта (все строки уже отформатированы правилами). */
export function buildDocData<K extends DocKind>(db: Db, actId: number, kind: K): DocData[K] {
  const A = acts(db);
  const act = A.get(actId);
  if (!act) throw new HttpError(404, "Акт не найден");
  const orgList = organizations(db).list();
  const org = (id: number | null | undefined): Organization | undefined => orgList.find((o) => o.id === id);
  const obj = objectInfo(db).get();
  const section = act.sectionId !== null ? sections(db).get(act.sectionId) : undefined;
  const reps = representatives(db).list();
  const mats = materials(db).list();
  const actMats = A.materials(actId);
  const vor = A.vor(actId);
  const Q = qualityDocs(db);
  const docsByMaterial = new Map(actMats.map((m) => [m.materialId, Q.forMaterial(m.materialId)]));
  const aosrNumber = docNumber(act.baseNumber, "aosr");
  const repText = (r: Representative | undefined) =>
    r ? [r.position, org(r.orgId)?.shortName ?? "", r.fullName].map((s) => s.trim()).filter(Boolean).join(" ") : "";

  const build = {
    aosr: (): AosrData => {
      const roles: RoleCode[] = [...AOSR_ROLES, ...(activeRepresentatives(reps, "other", act.date).length ? ["other" as RoleCode] : [])];
      const designer = org(section?.designerOrgId ?? obj.roles.designer);
      return {
        objectName: obj.name,
        developer: org(obj.roles.developer) ? orgFullForm(org(obj.roles.developer)!) : "",
        builder: org(obj.roles.builder) ? orgFullForm(org(obj.roles.builder)!) : "",
        designer: designer ? orgFullForm(designer) : "",
        number: aosrNumber,
        date: formatDateLong(act.date),
        reps: roles.map((role) => {
          const list = activeRepresentatives(reps, role, act.date);
          return { label: SIGN_LABELS[role], lines: list.length ? list.map((r) => repLine(r, org(r.orgId))) : [""] };
        }),
        performerOrg: org(act.performerOrgId)?.shortName ?? "",
        works: act.works,
        p2: [`Шифр рабочей документации: ${section?.code ?? ""}`, act.sheets && `листы ${act.sheets}`]
          .filter(Boolean).join(" ") + [act.revision, designer?.shortName].filter(Boolean).map((s) => `, ${s}`).join(""),
        p3: point3Lines(actMats, mats, docsByMaterial, act.baseNumber),
        p4: point4Lines(A.documents(actId)),
        dateStart: formatDateLong(act.dateStart),
        dateEnd: formatDateLong(act.dateEnd),
        normative: act.normative,
        nextWorks: act.nextWorks,
        extraInfo: act.extraInfo,
        copies: act.copies,
        attachments: act.attachments,
        signs: signers(reps, roles, act.date),
      };
    },
    rim: (): RimData => ({
      aosrNumber, number: docNumber(act.baseNumber, "rim"),
      rows: rimRows(actMats, mats, docsByMaterial), signs: signers(reps, APPENDIX_ROLES, act.date),
    }),
    vd: (): VdData => ({
      aosrNumber, number: docNumber(act.baseNumber, "vd"),
      rows: vdRows(actMats, mats, vor), signs: signers(reps, APPENDIX_ROLES, act.date),
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
