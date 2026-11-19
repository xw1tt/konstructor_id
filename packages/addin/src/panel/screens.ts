// Экраны панели. 0.32: в верхней строке — «Книга», «Печать и сдача», «Помощник»; остальное — в меню «Ещё».
/** «wizard» — мастер первого акта (план 17): открывается кнопкой в книге, не из верхней строки. */
export type ScreenId = "home" | "acts" | "delivery" | "normativ" | "library" | "assistant" | "settings" | "templates" | "fields" | "wizard";

export const SCREENS: readonly { id: ScreenId; label: string }[] = [
  { id: "home", label: "Книга" },
  { id: "delivery", label: "Печать и сдача" },
  { id: "assistant", label: "Помощник" },
  { id: "normativ", label: "Норматив" },
  { id: "library", label: "Библиотека" },
  { id: "settings", label: "Настройки" },
  { id: "templates", label: "Редактор шаблонов" },
  { id: "fields", label: "Поля для шаблона" },
];

/** Пункты меню «Ещё» (после выбора шаблона). */
export const MENU_SCREENS: readonly { id: ScreenId; label: string }[] = [
  { id: "templates", label: "Редактор шаблонов…" },
  { id: "fields", label: "Поля для шаблона…" },
  { id: "normativ", label: "Норматив" },
  { id: "library", label: "Библиотека компании" },
  { id: "settings", label: "Настройки" },
];
