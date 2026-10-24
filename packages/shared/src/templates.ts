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
export const PrintOptions = z.object({ schemeEach: z.boolean().default(false) });
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
