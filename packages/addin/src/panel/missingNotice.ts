import type { TableName } from "@idk/shared/workbook/schema";

/** Таблицы, добавленные после версии 0.3: в старых книгах их нет — это обновление, а не поломка. */
const NEW_TABLES: readonly TableName[] = ["Нормативы"];

export function missingNotice(missing: TableName[]): { text: string; button: string } {
  if (missing.length && missing.every((t) => NEW_TABLES.includes(t))) {
    return { text: `В этой версии появился лист ${missing.map((t) => `«${t}»`).join(", ")}.`, button: "Добавить лист" };
  }
  return { text: `Таблица не найдена: ${missing.join(", ")}.`, button: "Восстановить разметку" };
}
