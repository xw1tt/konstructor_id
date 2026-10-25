// Шаблон книги: id шаблона (встроенный «sbd» или шаблон пользователя с сервера); выбор хранится в настройках книги.
// Встроенные документы печатаются по формам СБД при любом шаблоне; свои формы — через /api/form-jobs.
import { z } from "zod";
import type { TableStore } from "./workbook/store.ts";

export type TemplateCode = string;
export const DEFAULT_TEMPLATE: TemplateCode = "sbd";
const KEY = "idk.template";


export async function loadTemplate(store: TableStore): Promise<TemplateCode> {
  const v = await store.setting(KEY);
  return v?.trim() ? v.trim() : DEFAULT_TEMPLATE;
}

export async function saveTemplate(store: TableStore, code: TemplateCode): Promise<void> {
  await store.setSetting(KEY, code);
}

/** Настройки печати книги (меню «Шаблоны ▾»). schemeEach — «Исполнительная схема» перед каждой схемой п.4 АОСР
 *  (по умолчанию — только перед первой из подряд идущих, как в образце СБД). */
export const FORM_SETS = ["sbd", "ti"] as const;
export type FormSet = (typeof FORM_SETS)[number];
export const FORM_SET_LABELS: Record<FormSet, string> = { sbd: "СБД", ti: "ТИ" };
/** Документы, у которых есть встроенные варианты форм (план 14). */
export const FORM_DOCS = ["vd", "rim", "kj", "registry"] as const;
export type FormDoc = (typeof FORM_DOCS)[number];

/** formSet — набор форм и нумерации; forms — форма документа вопреки набору; kjReserve — запас в КЖ «ТИ», %. */
export const PrintOptions = z.object({
  schemeEach: z.boolean().default(false),
  formSet: z.enum(FORM_SETS).default("sbd"),
  forms: z.object(Object.fromEntries(FORM_DOCS.map((d) => [d, z.enum(FORM_SETS).optional()])) as Record<FormDoc, z.ZodOptional<z.ZodEnum<["sbd", "ti"]>>>).default({}),
  kjReserve: z.number().min(0).max(100).default(2),
});
export type PrintOptions = z.infer<typeof PrintOptions>;
const OPTIONS_KEY = "idk.print";

export async function loadPrintOptions(store: TableStore): Promise<PrintOptions> {
  try {
    return PrintOptions.parse(JSON.parse((await store.setting(OPTIONS_KEY)) ?? "{}"));
  } catch {
    return PrintOptions.parse({});
  }
}

export async function savePrintOptions(store: TableStore, o: PrintOptions): Promise<void> {
  await store.setSetting(OPTIONS_KEY, JSON.stringify(o));
}
