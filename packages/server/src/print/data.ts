import type { Db } from "../db.ts";
import { buildDocDataFromBundle } from "./fromBundle.ts";
import { bundleFromDb } from "./fromDb.ts";
import type { DocKind } from "@idk/shared/acts/schemas";
import type { RimRow, VdRow, VorRow, SignBlock } from "@idk/shared/acts/rows";

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

/** Данные документа акта из базы. */
export function buildDocData<K extends DocKind>(db: Db, actId: number, kind: K): DocData[K] {
  return buildDocDataFromBundle(bundleFromDb(db, actId), kind);
}
