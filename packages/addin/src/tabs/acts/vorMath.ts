import type { VorLineInput } from "@idk/shared/acts/schemas";

/** Группы ВОР в порядке появления. */
export function groupsOf(lines: VorLineInput[]): string[] {
  const out: string[] = [];
  for (const l of [...lines].sort((a, b) => a.sortOrder - b.sortOrder)) if (!out.includes(l.group)) out.push(l.group);
  return out;
}

const renumber = (lines: VorLineInput[]) => lines.map((l, i) => ({ ...l, sortOrder: i }));

/** Новая группа с теми же материалами и нулевыми объёмами, в конце. Имя занято — без изменений. */
export function cloneGroup(lines: VorLineInput[], group: string, newName: string): VorLineInput[] {
  const name = newName.trim();
  if (!name || groupsOf(lines).includes(name)) return lines;
  const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const copy = sorted.filter((l) => l.group === group).map((l) => ({ ...l, group: name, quantity: 0 }));
  return renumber([...sorted, ...copy]);
}

export function renameGroup(lines: VorLineInput[], from: string, to: string): VorLineInput[] {
  return lines.map((l) => (l.group === from ? { ...l, group: to } : l));
}

/** Порядок: группы по первому появлению, внутри группы — как были. */
export function normalize(lines: VorLineInput[]): VorLineInput[] {
  const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  return renumber(groupsOf(sorted).flatMap((g) => sorted.filter((l) => l.group === g)));
}
