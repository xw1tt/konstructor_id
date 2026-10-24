// План 12, задача 1: модель справочника видов документов и его проверка.
import { z } from "zod";
import { PRINT_KINDS } from "../acts/schemas.ts";

/** Документ справочника: что это, откуда требование, кто делает (печатает конструктор / своя форма / скан). */
export const CatalogDoc = z.object({
  /** Уникальный код: «ПИК», «АОСР»… */
  code: z.string().trim().min(1),
  /** Название документа. */
  name: z.string().trim().min(1),
  /** Пункт 1–13 приложения № 1 к приказу 344/пр. */
  clause344: z.number().int(),
  /** Источник: «СП 76.13330.2016, п. …» / «ПУЭ, п. 1.8.40»; пусто, если достаточно 344/пр. */
  source: z.string().default(""),
  make: z.enum(["builtin", "form", "scan"]),
  /** Для make=builtin — вид печати конструктора. */
  builtin: z.enum(PRINT_KINDS).optional(),
  /** На акт или один раз на комплект. */
  scope: z.enum(["act", "kit"]),
});
export type CatalogDoc = z.infer<typeof CatalogDoc>;

export const CatalogWork = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  /** Коды документов справочника, нужных этому виду работ. */
  docs: z.array(z.string()),
});
export type CatalogWork = z.infer<typeof CatalogWork>;

export const CatalogSection = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  works: z.array(CatalogWork),
});
export type CatalogSection = z.infer<typeof CatalogSection>;

export const Catalog = z.object({
  /** Дата сборки встроенного справочника. */
  version: z.string(),
  docs: z.array(CatalogDoc),
  sections: z.array(CatalogSection),
});
export type Catalog = z.infer<typeof Catalog>;

/** Дополнения пользователя: свои документы/разделы/виды работ и коды скрытых встроенных. */
export const UserCatalog = z.object({
  docs: z.array(CatalogDoc).default([]),
  sections: z.array(CatalogSection).default([]),
  hidden: z.array(z.string()).default([]),
});
export type UserCatalog = z.infer<typeof UserCatalog>;

/** Ошибки справочника: коды, пункты 344/пр, ссылки видов работ, make=builtin без вида печати, дубли. */
export function checkCatalog(c: Catalog): string[] {
  const out: string[] = [];
  const docCodes = new Set<string>();
  for (const d of c.docs) {
    if (docCodes.has(d.code)) out.push(`Повтор кода документа «${d.code}»`);
    docCodes.add(d.code);
    if (d.clause344 < 1 || d.clause344 > 13) out.push(`Пункт 344/пр документа «${d.code}» — 1–13`);
    if (d.make === "builtin" && !d.builtin) out.push(`Документ «${d.code}»: make=builtin без вида печати`);
  }
  const workCodes = new Set<string>();
  for (const s of c.sections) {
    for (const w of s.works) {
      if (workCodes.has(w.code)) out.push(`Повтор кода вида работ «${w.code}»`);
      workCodes.add(w.code);
      for (const doc of w.docs) if (!docCodes.has(doc)) out.push(`Вид работ «${w.code}» ссылается на неизвестный документ «${doc}»`);
    }
  }
  return out;
}
