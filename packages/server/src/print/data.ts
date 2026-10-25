// Данные документов акта для HTML-шаблонов печати.
import type { DocKind } from "@idk/shared/acts/schemas";
import type { RimRow, VdRow, VorRow, SignBlock, AvkRow } from "@idk/shared/acts/rows";

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
export interface AvkData {
  number: string; date: string; city: string; customer: string; objectName: string;
  customerRep: string; contractorRep: string; sectionName: string; sectionCode: string; rows: AvkRow[];
}
export type DocData = { aosr: AosrData; rim: RimData; vd: VdData; vor: VorData };
