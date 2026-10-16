// Данные кабельного журнала и протокола изоляции в пакете печати акта.
import { z } from "zod";

const str = z.string().default("");
const optNum = z.number().nullable().default(null);
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null);

export const CableRow = z.object({
  group: str, designation: str, from: str, to: str, direction: str,
  cableMark: str, cableLength: optNum, pipeMark: str, pipeLength: optNum, note: str,
});
export type CableRow = z.infer<typeof CableRow>;

export const MarkMeasure = z.object({
  mark: str, purpose: str, voltage: optNum, allowed: optNum, values: z.array(z.string()).length(10),
});
export type MarkMeasure = z.infer<typeof MarkMeasure>;

export const CableDoc = z.object({
  journalCode: str, journalDate: optDate, protocolNumber: str, dateFrom: optDate, dateTo: optDate,
  temperature: optNum, humidity: optNum, purpose: str, normative: str, integrity: str, conclusion: str,
});
export type CableDoc = z.infer<typeof CableDoc>;

export const Lab = z.object({ nameAddress: str, certificate: str, head: str, tester: str });
export type Lab = z.infer<typeof Lab>;

export const Instrument = z.object({
  name: str, type: str, range: str, accuracy: str, serial: str, certificate: str,
  checkedOn: optDate, nextCheck: optDate, authority: str,
});
export type Instrument = z.infer<typeof Instrument>;

export const CablesData = z.object({
  rows: z.array(CableRow), marks: z.array(MarkMeasure), doc: CableDoc.nullable(), lab: Lab.nullable(), instruments: z.array(Instrument),
});
export type CablesData = z.infer<typeof CablesData>;

export const MEASURE_KEYS = ["ab", "bc", "ca", "an", "bn", "cn", "ape", "bpe", "cpe", "npe"] as const;
