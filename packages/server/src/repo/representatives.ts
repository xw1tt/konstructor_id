import type { Db } from "../db.ts";
import type { Representative, RepresentativeInput } from "@idk/shared/schemas";
import { crud } from "./crud.ts";

export const representatives = (db: Db) =>
  crud<Representative, RepresentativeInput>(
    db, "representatives",
    ["role", "position", "fullName", "orgId", "authorityDoc", "nrsNumber", "nrsDate", "validFrom", "validTo", "sortOrder", "actText"],
    "role, sort_order, id",
  );
