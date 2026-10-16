import type { Organization, Representative } from "./schemas.ts";
import type { RoleCode } from "./roles.ts";

/** Полная форма реквизитов организации для АОСР. Пустые поля пропускаются вместе с подписью. */
export function orgFullForm(org: Organization): string {
  const parts: string[] = [org.shortName];
  if (org.ogrn) parts.push(`ОГРН ${org.ogrn}`);
  if (org.inn) parts.push(`ИНН ${org.inn}`);
  if (org.address) parts.push(org.address);
  if (org.phone) parts.push(`тел. ${org.phone}`);
  if (org.sroName) {
    parts.push(`является членом организации: ${org.sroName}`);
    if (org.sroOgrn) parts.push(`ОГРН ${org.sroOgrn}`);
    if (org.sroInn) parts.push(`ИНН ${org.sroInn}`);
  }
  return parts.join(", ");
}

/** Представители роли с действующими на дату полномочиями (границы включительно), по sortOrder. */
export function activeRepresentatives(
  reps: Representative[],
  role: RoleCode,
  date: string,
): Representative[] {
  return reps
    .filter(
      (r) =>
        r.role === role &&
        (r.validFrom === null || r.validFrom <= date) &&
        (r.validTo === null || date <= r.validTo),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
