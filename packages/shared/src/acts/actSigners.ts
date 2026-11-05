// 0.30: подписанты акта выбираются вручную. Столбец «Подписанты» акта — ФИО через «; ». По роли, у которой выбран
// хотя бы один человек, подписывают только выбранные (полномочия по датам не проверяются — выбор пользователя главнее);
// роли без выбора — как раньше, по датам «Действует с/по». Так замена одного представителя другим на конкретном акте
// одинаково попадает в АОСР, приложения, АВК, КЖ, протоколы и ОЖР.
import type { RoleCode } from "../roles.ts";

interface RepLike { role: RoleCode; fullName: string; validFrom: string | null; validTo: string | null }

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const activeOn = (r: RepLike, date: string | null) =>
  !date || ((r.validFrom === null || r.validFrom <= date) && (r.validTo === null || date <= r.validTo));

/** Роли, по которым на акте выбраны подписанты. */
export function chosenRoles<T extends RepLike>(reps: readonly T[], chosen: readonly string[]): Set<RoleCode> {
  const names = new Set(chosen.map(norm).filter(Boolean));
  return new Set(reps.filter((r) => names.has(norm(r.fullName))).map((r) => r.role));
}

/**
 * Представители для одного акта: по ролям с выбором — только выбранные, по одной строке на человека (действующая на
 * дату акта, иначе самая поздняя), без ограничения по датам; остальные роли — без изменений.
 */
export function actRepresentatives<T extends RepLike>(reps: readonly T[], chosen: readonly string[], date: string | null): T[] {
  const names = new Set(chosen.map(norm).filter(Boolean));
  if (!names.size) return [...reps];
  const roles = chosenRoles(reps, chosen);
  const picked = new Map<string, T>();
  for (const r of reps) {
    if (!roles.has(r.role) || !names.has(norm(r.fullName))) continue;
    const k = `${r.role}|${norm(r.fullName)}`;
    const prev = picked.get(k);
    const better = !prev
      || (activeOn(r, date) && !activeOn(prev, date))
      || (activeOn(r, date) === activeOn(prev, date) && (r.validFrom ?? "") > (prev.validFrom ?? ""));
    if (better) picked.set(k, r);
  }
  const keep = new Set(picked.values());
  // Порядок книги сохраняется; выбранные — с полномочиями «без срока», чтобы подписывать документы акта любой даты.
  return reps.flatMap((r) => (!roles.has(r.role) ? [r] : keep.has(r) ? [{ ...r, validFrom: null, validTo: null }] : []));
}
