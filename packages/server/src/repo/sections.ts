import type { Db } from "../db.ts";
import type { Section, SectionInput } from "@idk/shared/schemas";
import { crud } from "./crud.ts";

export const sections = (db: Db) =>
  crud<Section, SectionInput>(db, "sections", ["code", "name", "designerOrgId"], "code");
