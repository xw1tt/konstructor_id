import { z } from "zod";
import { ROLE_CODES, ORG_ROLE_CODES, QUALITY_DOC_TYPES } from "./roles.ts";

const str = z.string().default("");
const req = (msg: string) => z.string({ required_error: msg }).trim().min(1, msg);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД");
const optDate = isoDate.nullable().default(null);
const id = z.number().int().positive();

export const OrganizationInput = z.object({
  shortName: req("Укажите краткое наименование"),
  fullName: req("Укажите полное наименование"),
  ogrn: str, inn: str, address: str, phone: str,
  sroName: str, sroOgrn: str, sroInn: str,
});
export const Organization = OrganizationInput.extend({ id });
export type OrganizationInput = z.infer<typeof OrganizationInput>;
export type Organization = z.infer<typeof Organization>;

export const ObjectInfo = z.object({
  name: str, address: str, contractNumber: str, contractDate: optDate, city: str,
  roles: z.object(
    Object.fromEntries(ORG_ROLE_CODES.map((r) => [r, id.nullable().default(null)])) as Record<
      (typeof ORG_ROLE_CODES)[number],
      z.ZodDefault<z.ZodNullable<typeof id>>
    >,
  ),
});
export type ObjectInfo = z.infer<typeof ObjectInfo>;

export const SectionInput = z.object({
  code: req("Укажите шифр"),
  name: str,
  designerOrgId: id.nullable().default(null),
});
export const Section = SectionInput.extend({ id });
export type SectionInput = z.infer<typeof SectionInput>;
export type Section = z.infer<typeof Section>;

export const RepresentativeInput = z.object({
  role: z.enum(ROLE_CODES),
  position: str,
  fullName: req("Укажите ФИО"),
  orgId: id,
  authorityDoc: str,
  nrsNumber: str,
  nrsDate: optDate,
  validFrom: optDate,
  validTo: optDate,
  sortOrder: z.number().int().default(0),
  /** Если заполнено — печатается в АОСР вместо автоматической строки. */
  actText: str,
});
export const Representative = RepresentativeInput.extend({ id });
export type RepresentativeInput = z.infer<typeof RepresentativeInput>;
export type Representative = z.infer<typeof Representative>;

export const MaterialInput = z.object({
  name: req("Укажите наименование"),
  mark: str, article: str, manufacturer: str, unit: str,
});
export const Material = MaterialInput.extend({ id });
export type MaterialInput = z.infer<typeof MaterialInput>;
export type Material = z.infer<typeof Material>;

export const QualityDocInput = z.object({
  type: z.enum(QUALITY_DOC_TYPES),
  number: str,
  issueDate: optDate,
  validUntil: optDate,
  sheets: z.number().int().min(0).default(0),
  fileId: id.nullable().default(null),
  materialIds: z.array(id).default([]),
  /** Наименование в РИМ; пусто — наименования материалов через запятую. */
  registryName: str,
});
export const QualityDoc = QualityDocInput.extend({ id });
export type QualityDocInput = z.infer<typeof QualityDocInput>;
export type QualityDoc = z.infer<typeof QualityDoc>;

export const FileRow = z.object({
  id, sha256: z.string(), name: z.string(), mime: z.string(),
  size: z.number().int(), pages: z.number().int(),
});
export type FileRow = z.infer<typeof FileRow>;
