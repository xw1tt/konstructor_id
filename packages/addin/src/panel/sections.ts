// Разделы панели и их листы (спецификация §4.1). Первый лист раздела открывается по клику.
import type { SheetName } from "@idk/shared/workbook/schema";

export type SectionId = "requisites" | "reps" | "acts" | "materials" | "schemes" | "cables" | "kits" | "ojr";

export const SECTIONS: readonly { id: SectionId; label: string; sheets: SheetName[] }[] = [
  { id: "requisites", label: "Реквизиты", sheets: ["Реквизиты"] },
  { id: "reps", label: "Представители", sheets: ["Представители"] },
  { id: "acts", label: "Акты", sheets: ["База актов", "Исполнительные схемы", "Материалы в актах", "ВОР"] },
  { id: "materials", label: "Материалы", sheets: ["Материалы", "Документы качества"] },
  { id: "schemes", label: "Схемы", sheets: ["Исполнительные схемы"] },
  { id: "cables", label: "Кабельный журнал", sheets: ["Кабельный журнал", "Изоляция"] },
  { id: "kits", label: "Комплекты", sheets: ["Комплекты", "Реестр ИД"] },
  { id: "ojr", label: "ОЖР", sheets: ["ОЖР Раздел 3", "ОЖР Раздел 5"] },
];

/** Раздел листа; «Исполнительные схемы» — собственный раздел «Схемы». */
export function sectionForSheet(sheet: string): SectionId | null {
  const own = SECTIONS.find((s) => s.sheets[0] === sheet);
  if (own) return own.id;
  return SECTIONS.find((s) => (s.sheets as string[]).includes(sheet))?.id ?? null;
}
