import type { Db } from "../db.ts";
import { Router, Reply, HttpError, notFound } from "../http/router.ts";
import { MaterialInput, QualityDocInput } from "@idk/shared/schemas";
import { materials } from "../repo/materials.ts";
import { qualityDocs } from "../repo/qualityDocs.ts";
import { acts } from "../repo/acts.ts";

const fk = <T>(fn: () => T): T => {
  try { return fn(); } catch (e) {
    if (/FOREIGN KEY constraint failed/.test((e as Error).message))
      throw new HttpError(400, "Указан несуществующий материал или файл");
    throw e;
  }
};

export function materialRoutes(r: Router, db: Db) {
  const mats = materials(db);
  const docs = qualityDocs(db);

  r.get("/api/materials", () => mats.list());
  r.post("/api/materials", async (c) => new Reply(201, mats.create(await c.body(MaterialInput))));
  r.put("/api/materials/:id", async (c) => { const id = c.id(); return mats.update(id, await c.body(MaterialInput)) ?? Promise.reject(notFound("Материал")); });
  r.delete("/api/materials/:id", (c) => {
    const id = c.id();
    const used = acts(db).actsUsingMaterial(id);
    if (used.length) throw new HttpError(409, `Материал используется в актах: ${used.join(", ")}`);
    if (!mats.delete(id)) throw notFound("Материал");
  });
  r.get("/api/materials/:id/quality-docs", (c) => docs.forMaterial(c.id()));

  r.get("/api/quality-docs", () => docs.list());
  r.get("/api/quality-docs/:id", (c) => docs.get(c.id()) ?? Promise.reject(notFound("Документ")));
  r.post("/api/quality-docs", async (c) => { const b = await c.body(QualityDocInput); return new Reply(201, fk(() => docs.create(b))); });
  r.put("/api/quality-docs/:id", async (c) => { const id = c.id(); const b = await c.body(QualityDocInput); return fk(() => docs.update(id, b)) ?? Promise.reject(notFound("Документ")); });
  r.delete("/api/quality-docs/:id", (c) => { if (!docs.delete(c.id())) throw notFound("Документ"); });
}
