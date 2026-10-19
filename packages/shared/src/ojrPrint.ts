// Задание печати раздела общего журнала работ: строки листа ОЖР Раздел 3 или 5 (уже как текст).
import { z } from "zod";

export const OjrRow3 = z.object({ date: z.string(), conditions: z.string().default(""), works: z.string(), signer: z.string().default("") });
export const OjrRow5 = z.object({ name: z.string(), signed: z.string().default("") });
export const OjrRequest = z.discriminatedUnion("section", [
  z.object({ section: z.literal(3), objectName: z.string().default(""), rows: z.array(OjrRow3).min(1) }),
  z.object({ section: z.literal(5), objectName: z.string().default(""), rows: z.array(OjrRow5).min(1) }),
]);
export type OjrRequest = z.infer<typeof OjrRequest>;
