// Шаблоны (формы документов заказчиков). Сейчас — только СБД; выбор хранится в настройках книги.
import { z } from "zod";
import type { TableStore } from "./workbook/store.ts";

export const TEMPLATES = [{ code: "sbd", label: "СБД" }] as const;
export type TemplateCode = (typeof TEMPLATES)[number]["code"];
export const DEFAULT_TEMPLATE: TemplateCode = "sbd";
const KEY = "idk.template";

export const isTemplateCode = (s: string): s is TemplateCode => TEMPLATES.some((t) => t.code === s);

export async function loadTemplate(store: TableStore): Promise<TemplateCode> {
  const v = await store.setting(KEY);
  return v && isTemplateCode(v) ? v : DEFAULT_TEMPLATE;
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
