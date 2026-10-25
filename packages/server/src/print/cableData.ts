// Данные кабельного журнала и протокола изоляции из пакета акта.
import type { ActBundle } from "@idk/shared/workbook/bundle";
import type { Instrument, Lab } from "@idk/shared/workbook/cableTypes";
import { docNumberFor, formatDateShort, formatNumber } from "@idk/shared/acts/format";
import type { FormSet } from "@idk/shared/templates";
import { column } from "@idk/shared/workbook/schema";
import {
  journalLines, journalSheets, journalSigners, monthYear, protocolRows, type JournalLine, type ProtocolRow,
} from "@idk/shared/acts/cableDocs";
import { HttpError } from "../http/router.ts";

export interface KjData {
  sheets: JournalLine[][];
  stamp: { code: string; object: string; section: string; org: string; signers: { position: string; name: string; org: string }[]; date: string };
}
export interface IpData {
  lab: Lab; customer: string; object: string; project: string; dates: string; number: string;
  temperature: string; humidity: string; purpose: string; normative: string;
  rows: ProtocolRow[]; integrity: string; conclusion: string;
  instruments: (Omit<Instrument, "checkedOn" | "nextCheck"> & { checkedOn: string; nextCheck: string })[];
}
export type CableDocData = { kj: KjData; ip: IpData };

const plainDate = (iso: string | null) => formatDateShort(iso).replace(/ г\.$/, "");

/** set — набор форм: в «ТИ» номер протокола — «<акт>.П», без строки «ДокументыКабелей» — значения по умолчанию. */
export function cableDocData<K extends keyof CableDocData>(b: ActBundle, kind: K, set: FormSet = "sbd"): CableDocData[K] {
  const c = b.cables;
  if (!c) throw new HttpError(400, "В пакете нет данных кабельного журнала");
  const org = (id: number | null | undefined) => b.organizations.find((o) => o.id === id);
  const section = b.sections.find((s) => s.id === b.act.sectionId);
  if (kind === "kj") {
    const data: KjData = {
      sheets: journalSheets(journalLines(c.rows)),
      stamp: {
        code: c.doc?.journalCode ?? "", object: b.object.name, section: section?.name ?? "",
        org: org(b.act.performerOrgId)?.shortName ?? "",
        signers: journalSigners(b.representatives, b.organizations, b.act.date), date: monthYear(c.doc?.journalDate ?? null),
      },
    };
    return data as CableDocData[K];
  }
  const d = c.doc;
  // Нет строки «ДокументыКабелей» (набор «ТИ») — значения столбцов по умолчанию, дата — дата акта.
  const dflt = (k: string) => String(column("ДокументыКабелей", k).default ?? "");
  const data: IpData = {
    lab: c.lab ?? { nameAddress: "", certificate: "", head: "", tester: "" },
    customer: org(b.object.roles.developer)?.shortName ?? "",
    object: b.object.name, project: section?.code ?? "",
    dates: d ? [formatDateShort(d.dateFrom), formatDateShort(d.dateTo)].filter(Boolean).join(" - ") : formatDateShort(b.act.date),
    number: set === "ti" ? docNumberFor(b.act.baseNumber, "ip", "ti") : d?.protocolNumber ?? "", temperature: d ? formatNumber(d.temperature) : dflt("temperature"), humidity: d ? formatNumber(d.humidity) : dflt("humidity"),
    purpose: d ? d.purpose : dflt("purpose"), normative: d ? d.normative : dflt("normative"),
    rows: protocolRows(c.rows, c.marks), integrity: d ? d.integrity : dflt("integrity"), conclusion: d ? d.conclusion : dflt("conclusion"),
    instruments: c.instruments.map((i) => ({ ...i, checkedOn: plainDate(i.checkedOn), nextCheck: plainDate(i.nextCheck) })),
  };
  return data as CableDocData[K];
}
