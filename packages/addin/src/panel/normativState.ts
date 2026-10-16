import type { Book } from "@idk/shared/workbook/records";

/** Что показывать на экране «Норматив»: нет таблицы (книга 0.3), пустой реестр или список. */
export function normativState(book: Book): "missing" | "empty" | "ok" {
  if (book.missing.includes("Нормативы")) return "missing";
  return (book.tables["Нормативы"]?.length ?? 0) > 0 ? "ok" : "empty";
}
