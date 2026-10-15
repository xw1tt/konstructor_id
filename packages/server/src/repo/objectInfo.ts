import type { Db } from "../db.ts";
import type { ObjectInfo } from "@idk/shared/schemas";
import { ORG_ROLE_CODES } from "@idk/shared/roles";

export const objectInfo = (db: Db) => ({
  get(): ObjectInfo {
    const r = db.prepare("SELECT * FROM object_info WHERE id=1").get() as any;
    const roles = Object.fromEntries(ORG_ROLE_CODES.map((c) => [c, null])) as ObjectInfo["roles"];
    for (const x of db.prepare("SELECT role, org_id FROM object_org_roles").all() as any[])
      if (x.role in roles) roles[x.role as keyof ObjectInfo["roles"]] = x.org_id;
    return {
      name: r.name, address: r.address, contractNumber: r.contract_number,
      contractDate: r.contract_date, city: r.city, roles,
    };
  },
  save(o: ObjectInfo): ObjectInfo {
    db.exec("BEGIN");
    try {
      db.prepare("UPDATE object_info SET name=?, address=?, contract_number=?, contract_date=?, city=? WHERE id=1")
        .run(o.name, o.address, o.contractNumber, o.contractDate, o.city);
      db.exec("DELETE FROM object_org_roles");
      const ins = db.prepare("INSERT INTO object_org_roles (role, org_id) VALUES (?, ?)");
      for (const [role, orgId] of Object.entries(o.roles)) if (orgId !== null) ins.run(role, orgId);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return this.get();
  },
});
