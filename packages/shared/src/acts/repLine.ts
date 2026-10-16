import type { Organization, Representative } from "../schemas.ts";

const join = (parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(", ");

/** Строка представителя для АОСР (дополнение к спецификации, раздел 2). */
export function repLine(rep: Representative, org: Organization | undefined): string {
  if (rep.actText.trim()) return rep.actText.trim();
  const orgName = org?.shortName ?? "";
  const nrs = rep.nrsNumber.trim() ? `идентификационный номер специалиста №${rep.nrsNumber.trim().replace(/^№/, "")}` : "";
  if (rep.role === "developer_control" || rep.role === "builder_control" || rep.role === "builder") {
    const head = [rep.position, orgName, rep.fullName].map((s) => s.trim()).filter(Boolean).join(" ");
    return join([head, nrs, rep.authorityDoc]);
  }
  // проектировщик, лицо, выполнившее работы, иные — с реквизитами организации
  const orgPart = org
    ? [orgName, org.ogrn && `ОГРН ${org.ogrn}`].filter(Boolean).join(" ") +
      (org.inn ? `, ИНН ${org.inn}` : "") + (org.address ? `, ${org.address}` : "")
    : "";
  const head = [rep.position, rep.fullName].map((s) => s.trim()).filter(Boolean).join(" ");
  return join([head, nrs, rep.authorityDoc, orgPart]);
}
