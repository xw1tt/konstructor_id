import { z } from "zod";
import type { Db } from "../db.ts";
import { Router, Reply, HttpError } from "../http/router.ts";
import { ActInput, ActMaterialInput, ActDocumentInput, VorLineInput, DOC_KINDS, type DocKind } from "@idk/shared/acts/schemas";
import { docNumber } from "@idk/shared/acts/format";
import { buildDocData } from "../print/data.ts";
import { renderHtml } from "../print/templates/index.ts";
import { htmlToPdf } from "../print/browser.ts";
import { acts } from "../repo/acts.ts";
import { objectInfo } from "../repo/objectInfo.ts";
import { sections } from "../repo/sections.ts";
import { representatives } from "../repo/representatives.ts";
import { activeRepresentatives } from "@idk/shared/rules";

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
    const reps = representatives(db).list();
    const performers = activeRepresentatives(reps, "performer", b.date);
    const data: ActInput = {
      ...b,
      // дополнение к спецификации, §5: первый стройконтроль заказчика и последний представитель исполнителя
      vorCustomerRepId: b.vorCustomerRepId ?? activeRepresentatives(reps, "developer_control", b.date)[0]?.id ?? null,
      vorContractorRepId: b.vorContractorRepId ?? performers[performers.length - 1]?.id ?? null,
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
    const rows = await c.body(z.array(ActMaterialInput).refine(
      (a) => new Set(a.map((x) => x.materialId)).size === a.length, "Материал указан в акте дважды"));
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
    const inAct = new Set(repo.materials(id).map((m) => m.materialId));
    if (rows.some((r) => !inAct.has(r.materialId)))
      throw new HttpError(400, "Материал строки ВОР не входит в акт: сначала добавьте его в п.3 и сохраните");
    fk(() => repo.setVor(id, rows));
    return repo.vor(id);
  });

  r.get("/api/acts/:id/pdf/:doc", async (c) => {
    const id = c.id();
    const act = mustAct(id);
    const kind = c.params.doc as DocKind;
    if (!DOC_KINDS.includes(kind)) throw new HttpError(400, "Неизвестный документ: " + c.params.doc);
    const pdf = await htmlToPdf(renderHtml(kind, buildDocData(db, id, kind)), { pageNumbers: kind === "vor" });
    const name = (kind === "vor" ? `${act.baseNumber}.ВОР` : docNumber(act.baseNumber, kind)) + ".pdf";
    c.res.writeHead(200, {
      "content-type": "application/pdf",
      "content-length": pdf.length,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
    c.res.end(pdf);
  });
}
