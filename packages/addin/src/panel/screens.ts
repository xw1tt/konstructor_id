// Экраны верхней строки и значки помощника (пока без действия).
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

export type AssistantIconId = "search" | "history" | "chat" | "bell" | "help" | "menu";

export const ASSISTANT_ICONS: readonly { id: AssistantIconId; label: string }[] = [
  { id: "search", label: "Поиск" },
  { id: "history", label: "История" },
  { id: "chat", label: "Сообщения" },
  { id: "bell", label: "Уведомления" },
  { id: "help", label: "Справка" },
  { id: "menu", label: "Меню" },
];
