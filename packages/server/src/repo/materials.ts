import type { Db } from "../db.ts";
import type { Material, MaterialInput } from "@idk/shared/schemas";
import { crud } from "./crud.ts";

export const materials = (db: Db) =>
  crud<Material, MaterialInput>(db, "materials", ["name", "mark", "article", "manufacturer", "unit"], "name, mark");
