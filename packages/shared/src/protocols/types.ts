// План 13: данные документа в пакете акта (ActBundle.proto) — всё уже в печатном виде, кроме дат (ISO).
import { z } from "zod";
import { PROTO_KINDS } from "../acts/schemas.ts";

const s = z.string().default("");

export const ProtoData = z.object({
  kind: z.enum(PROTO_KINDS),
  code: z.string(),
  name: z.string(),
  signer: z.enum(["lab", "commission"]),
  number: z.string(),
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  subject: s, temperature: s, humidity: s, pressure: s, purpose: s, normative: s, conclusion: s,
  /** Город объекта — для актов комиссии. */
  city: s,
  /** Строки таблицы: ключ столбца описания → печатное значение (с результатом). */
  rows: z.array(z.record(z.string())),
  lab: z.object({ nameAddress: s, certificate: s, head: s, tester: s }).nullable(),
  instruments: z.array(z.object({
    name: s, type: s, range: s, accuracy: s, serial: s, certificate: s, checkedOn: z.string().nullable(), nextCheck: z.string().nullable(), authority: s,
  })),
  commission: z.array(z.object({ role: s, position: s, org: s, name: s })),
});
export type ProtoData = z.infer<typeof ProtoData>;
