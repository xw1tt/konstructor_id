// Важные столбцы: по умолчанию из схемы, пользовательские — в настройках документа.
import { TABLES, TABLE_NAMES, type TableName } from "./schema.ts";
import type { TableStore } from "./store.ts";

export type ImportantMap = Partial<Record<TableName, string[]>>;
export const IMPORTANT_SETTING = "idk.important";

export function defaultImportant(): ImportantMap {
  return Object.fromEntries(TABLE_NAMES.map((t) => [t, TABLES[t].columns.filter((c) => c.important).map((c) => c.header)]));
}

export async function loadImportant(store: TableStore): Promise<ImportantMap> {
  const raw = await store.setting(IMPORTANT_SETTING);
  const base = defaultImportant();
  if (!raw) return base;
  try {
    const saved = JSON.parse(raw) as ImportantMap;
    return { ...base, ...saved };
  } catch {
    return base;
  }
}

export async function saveImportant(store: TableStore, map: ImportantMap): Promise<void> {
  const current = await loadImportant(store);
  await store.setSetting(IMPORTANT_SETTING, JSON.stringify({ ...current, ...map }));
}
