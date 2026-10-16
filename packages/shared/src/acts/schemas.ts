import { z } from "zod";

const str = z.string().default("");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД");
const optDate = isoDate.nullable().default(null);
const id = z.number().int().positive();
const optId = id.nullable().default(null);

export const DOC_KINDS = ["aosr", "rim", "vd", "vor"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const ActInput = z.object({
  baseNumber: z.string({ required_error: "Укажите номер акта" }).trim().min(1, "Укажите номер акта"),
  date: isoDate,
  sectionId: optId,
  works: str,
  sheets: str,
  revision: str,
  dateStart: optDate,
  dateEnd: optDate,
  normative: str,
  nextWorks: str,
  extraInfo: z.string().default("нет"),
  copies: z.number().int().min(1).default(4),
  attachments: z.string().default("Согласно п.3, п.4."),
  performerOrgId: optId,
  vorTitle: str,
  vorCustomerRepId: optId,
  vorContractorRepId: optId,
});
export const Act = ActInput.extend({ id });
export type ActInput = z.infer<typeof ActInput>;
export type Act = z.infer<typeof Act>;

export const ActMaterialInput = z.object({
  materialId: id,
  position: z.string().default("б/н"),
  /** null — взять сумму строк ВОР по этому материалу. */
  quantity: z.number().nonnegative().nullable().default(null),
  sortOrder: z.number().int().default(0),
});
export type ActMaterialInput = z.infer<typeof ActMaterialInput>;

export const ActDocumentInput = z.object({
  kind: z.enum(["scheme", "other"]),
  number: str,
  name: str,
  date: optDate,
  fileId: optId,
  sortOrder: z.number().int().default(0),
});
export type ActDocumentInput = z.infer<typeof ActDocumentInput>;

export const VorLineInput = z.object({
  group: z.string().default(""),
  materialId: id,
  quantity: z.number().nonnegative(),
  sortOrder: z.number().int().default(0),
});
export type VorLineInput = z.infer<typeof VorLineInput>;

export interface ActFull {
  act: Act;
  materials: ActMaterialInput[];
  documents: ActDocumentInput[];
  vor: VorLineInput[];
}
