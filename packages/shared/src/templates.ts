// Шаблоны (формы документов заказчиков). Сейчас — только СБД; выбор хранится в настройках книги.
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
