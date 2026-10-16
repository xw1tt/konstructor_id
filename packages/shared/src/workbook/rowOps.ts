// «Функционал листа»: добавить, дублировать, переместить, удалить строки.
import type { RowsTarget } from "./store.ts";

/** Вставляет n пустых строк под current (null — в конец). Возвращает индекс первой новой строки. */
export async function addRows(t: RowsTarget, current: number | null, n: number): Promise<number> {
  const at = current === null ? await t.count() : current + 1;
  return t.insertBlank(at, n);
}

/** Копия строки сразу под ней. Возвращает индекс копии. */
export async function duplicateRow(t: RowsTarget, row: number): Promise<number> {
  const data = await t.read(row);
  const at = await t.insertBlank(row + 1, 1);
  await t.write(at, data);
  return at;
}

/** Обмен с соседней строкой; у края — без изменений. Возвращает новый индекс курсора. */
export async function moveRow(t: RowsTarget, row: number, dir: -1 | 1): Promise<number> {
  const other = row + dir;
  if (other < 0 || other >= (await t.count())) return row;
  const [a, b] = [await t.read(row), await t.read(other)];
  await t.write(row, b);
  await t.write(other, a);
  return other;
}

/** Удаляет строки (повторы игнорируются). Возвращает число удалённых. */
export async function deleteRows(t: RowsTarget, rows: number[]): Promise<number> {
  const unique = [...new Set(rows)].sort((x, y) => y - x);
  await t.remove(unique);
  return unique.length;
}
