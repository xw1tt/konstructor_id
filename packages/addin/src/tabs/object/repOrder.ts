import type { Representative } from "@idk/shared/schemas";

/**
 * Сдвигает представителя внутри роли на одну позицию (-1 вверх, 1 вниз).
 * Возвращает только изменившиеся sortOrder; после сдвига порядок нумеруется 1..n.
 */
export function moveRep(list: Representative[], id: number, dir: -1 | 1): { id: number; sortOrder: number }[] {
  const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const i = sorted.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return [];
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  return sorted
    .map((r, k) => ({ id: r.id, sortOrder: k + 1, was: r.sortOrder }))
    .filter((r) => r.sortOrder !== r.was)
    .map(({ id, sortOrder }) => ({ id, sortOrder }));
}
