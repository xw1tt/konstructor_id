import type { Db } from "../db.ts";
import type { Organization, OrganizationInput } from "@idk/shared/schemas";
import { ORG_ROLE_LABELS, type OrgRoleCode } from "@idk/shared/roles";
import { camel } from "./util.ts";

const COLS = ["short_name", "full_name", "ogrn", "inn", "address", "phone", "sro_name", "sro_ogrn", "sro_inn"];
const vals = (o: OrganizationInput) => [
  o.shortName, o.fullName, o.ogrn, o.inn, o.address, o.phone, o.sroName, o.sroOgrn, o.sroInn,
];

export const organizations = (db: Db) => ({
  list: () => (db.prepare("SELECT * FROM organizations ORDER BY short_name").all() as any[]).map((r) => camel<Organization>(r)!),
  get: (id: number) => camel<Organization>(db.prepare("SELECT * FROM organizations WHERE id=?").get(id) as any),
  create(o: OrganizationInput): Organization {
    const r = db.prepare(`INSERT INTO organizations (${COLS.join(",")}) VALUES (${COLS.map(() => "?").join(",")})`).run(...vals(o));
    return this.get(Number(r.lastInsertRowid))!;
  },
  update(id: number, o: OrganizationInput): Organization | undefined {
    const r = db.prepare(`UPDATE organizations SET ${COLS.map((c) => c + "=?").join(",")} WHERE id=?`).run(...vals(o), id);
    return r.changes ? this.get(id) : undefined;
  },
  /** Где используется организация — список причин на русском (пусто, если не используется). */
  usages(id: number): string[] {
    const out: string[] = [];
    for (const { role } of db.prepare("SELECT role FROM object_org_roles WHERE org_id=?").all(id) as { role: OrgRoleCode }[])
      out.push(`роль на объекте «${ORG_ROLE_LABELS[role]}»`);
    const reps = (db.prepare("SELECT COUNT(*) n FROM representatives WHERE org_id=?").get(id) as { n: number }).n;
    if (reps) out.push(`представители (${reps})`);
    const secs = (db.prepare("SELECT COUNT(*) n FROM sections WHERE designer_org_id=?").get(id) as { n: number }).n;
    if (secs) out.push(`разделы РД (${secs})`);
    return out;
  },
  delete: (id: number) => db.prepare("DELETE FROM organizations WHERE id=?").run(id).changes > 0,
});
