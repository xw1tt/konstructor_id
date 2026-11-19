// 0.45: ошибки документов акта по шаблону книги (КЖ, протоколы, свои формы): документ с данными, но с ошибками,
// делает акт «не собирается»; документ без данных (нет кабелей, протокола) — просто не нужен акту.
import type { Issue } from "@idk/shared/workbook/bundle";
import type { Book } from "@idk/shared/workbook/records";
import type { ImportantMap } from "@idk/shared/workbook/important";
import type { UserTemplate } from "@idk/shared/forms/template";
import type { PrintOptions } from "@idk/shared/templates";
import { templateButtons } from "./templatesApi.ts";
import { docState } from "./print.ts";

export function docIssues(book: Book, important: ImportantMap, template: UserTemplate, options?: PrintOptions): (act: string) => Issue[] {
  const docs = templateButtons(template).filter((b) => b.doc && b.doc !== "aosr");
  return (act) =>
    docs.flatMap((b) => {
      const d = docState(book, act, important, b.doc, options);
      return d.state === "bad" ? d.issues : [];
    });
}
