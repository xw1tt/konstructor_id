// План 17: мастер первого акта в книге — запись строк и проверка, что АОСР собирается.
import { allErrors, wizardRecords, type WizardData } from "@idk/shared/wizard";
import { readBook } from "@idk/shared/workbook/records";
import { writeBook } from "@idk/shared/workbook/write";
import { buildBundle, type Issue } from "@idk/shared/workbook/bundle";
import type { ImportantMap } from "@idk/shared/workbook/important";
import type { TableStore } from "@idk/shared/workbook/store";

/** Пишет данные мастера в книгу. Ошибки полей — ничего не пишется; иначе — замечания сборки АОСР (пусто — можно печатать). */
export async function createAct(store: TableStore, d: WizardData, important: ImportantMap):
  Promise<{ fieldErrors: Record<string, string>; issues: Issue[] }> {
  const before = await readBook(store);
  const fieldErrors = allErrors(d, before);
  if (Object.keys(fieldErrors).length) return { fieldErrors, issues: [] };
  await writeBook(store, wizardRecords(before, d));
  const { issues } = buildBundle(await readBook(store), d.act.number.trim(), important);
  return { fieldErrors: {}, issues };
}
