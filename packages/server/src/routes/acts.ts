import { z } from "zod";
import type { Db } from "../db.ts";
import { Router, Reply, HttpError } from "../http/router.ts";
import { ActInput, ActMaterialInput, ActDocumentInput, VorLineInput } from "@idk/shared/acts/schemas";
import { acts } from "../repo/acts.ts";
import { objectInfo } from "../repo/objectInfo.ts";
import { sections } from "../repo/sections.ts";

const actNotFound = () => new HttpError(404, "Акт не найден");
const fk = <T>(fn: () => T): T => {
  try { return fn(); } catch (e) {
    if (/FOREIGN KEY constraint failed/.test((e as Error).message))
      throw new HttpError(400, "Указан несуществующий материал, файл, раздел или представитель");
    throw e;
  }
};

export function actRoutes(r: Router, db: Db) {
  const repo = acts(db);
  const mustAct = (id: number) => repo.get(id) ?? (() => { throw actNotFound(); })();

  r.get("/api/acts", () => repo.list());
  r.post("/api/acts", async (c) => {
    const b = await c.body(ActInput);
    const firstSection = sections(db).list()[0];
    const section = b.sectionId !== null ? sections(db).get(b.sectionId) : firstSection;
    const data: ActInput = {
      ...b,
      sectionId: b.sectionId ?? firstSection?.id ?? null,
      performerOrgId: b.performerOrgId ?? objectInfo(db).get().roles.performer,
      vorTitle: b.vorTitle || section?.name || "",
    };
    return new Reply(201, fk(() => repo.create(data)));
  });
  r.get("/api/acts/:id", (c) => mustAct(c.id()));
  r.put("/api/acts/:id", async (c) => {
    const id = c.id();
    mustAct(id);
    const b = await c.body(ActInput);
    return fk(() => repo.update(id, b));
  });
  r.delete("/api/acts/:id", (c) => { if (!repo.delete(c.id())) throw actNotFound(); });

  r.get("/api/acts/:id/full", (c) => {
    const id = c.id();
    const act = mustAct(id);
    return { act, materials: repo.materials(id), documents: repo.documents(id), vor: repo.vor(id) };
  });
  r.put("/api/acts/:id/materials", async (c) => {
    const id = c.id(); mustAct(id);
    const rows = await c.body(z.array(ActMaterialInput));
    fk(() => repo.setMaterials(id, rows));
    return repo.materials(id);
  });
  r.put("/api/acts/:id/documents", async (c) => {
    const id = c.id(); mustAct(id);
    const rows = await c.body(z.array(ActDocumentInput));
    fk(() => repo.setDocuments(id, rows));
    return repo.documents(id);
  });
  r.put("/api/acts/:id/vor", async (c) => {
    const id = c.id(); mustAct(id);
    const rows = await c.body(z.array(VorLineInput));
    fk(() => repo.setVor(id, rows));
    return repo.vor(id);
  });
}
