// Экраны верхней строки. Неактивные значки помощника убраны (план 21): только занимали место.
/** «wizard» — мастер первого акта (план 17): открывается кнопкой в книге, не из верхней строки. */
export type ScreenId = "home" | "normativ" | "library" | "assistant" | "settings" | "templates" | "fields" | "wizard";

export const SCREENS: readonly { id: ScreenId; label: string }[] = [
  { id: "home", label: "Конструктор ИД" },
  { id: "normativ", label: "Норматив" },
  { id: "library", label: "Библиотека" },
  { id: "assistant", label: "Помощник" },
  { id: "settings", label: "Настройки" },
  { id: "templates", label: "Редактор шаблонов" },
  { id: "fields", label: "Поля для шаблона" },
];
