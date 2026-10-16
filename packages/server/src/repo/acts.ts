import type { Db } from "../db.ts";
import type { Act, ActInput, ActMaterialInput, ActDocumentInput, VorLineInput } from "@idk/shared/acts/schemas";
import { crud } from "./crud.ts";
import { camel } from "./util.ts";

const FIELDS: (keyof ActInput & string)[] = [
  "baseNumber", "date", "sectionId", "works", "sheets", "revision", "dateStart", "dateEnd", "normative",
  "nextWorks", "extraInfo", "copies", "attachments", "performerOrgId", "vorTitle", "vorCustomerRepId", "vorContractorRepId",
];

export const acts = (db: Db) => {
  const base = crud<Act, ActInput>(db, "acts", FIELDS, "date, base_number");
  const tx = <T>(fn: () => T): T => {
    db.exec("BEGIN");
    try { const v = fn(); db.exec("COMMIT"); return v; } catch (e) { db.exec("ROLLBACK"); throw e; }
  };
  return {
    ...base,
    materials: (actId: number): ActMaterialInput[] =>
      (db.prepare("SELECT material_id, position, quantity, sort_order FROM act_materials WHERE act_id=? ORDER BY sort_order, material_id").all(actId) as any[])
        .map((r) => camel<ActMaterialInput>(r)!),
    documents: (actId: number): (ActDocumentInput & { id: number })[] =>
      (db.prepare("SELECT id, kind, number, name, date, file_id, sort_order FROM act_documents WHERE act_id=? ORDER BY sort_order, id").all(actId) as any[])
        .map((r) => camel<ActDocumentInput & { id: number }>(r)!),
    vor: (actId: number): VorLineInput[] =>
      (db.prepare("SELECT grp, material_id, quantity, sort_order FROM vor_lines WHERE act_id=? ORDER BY sort_order, id").all(actId) as any[])
        .map((r) => ({ group: r.grp, materialId: r.material_id, quantity: r.quantity, sortOrder: r.sort_order })),
    setMaterials: (actId: number, rows: ActMaterialInput[]) => tx(() => {
      db.prepare("DELETE FROM act_materials WHERE act_id=?").run(actId);
      const ins = db.prepare("INSERT INTO act_materials (act_id, material_id, position, quantity, sort_order) VALUES (?,?,?,?,?)");
      for (const r of rows) ins.run(actId, r.materialId, r.position, r.quantity, r.sortOrder);
    }),
    setDocuments: (actId: number, rows: ActDocumentInput[]) => tx(() => {
      db.prepare("DELETE FROM act_documents WHERE act_id=?").run(actId);
      const ins = db.prepare("INSERT INTO act_documents (act_id, kind, number, name, date, file_id, sort_order) VALUES (?,?,?,?,?,?,?)");
      for (const r of rows) ins.run(actId, r.kind, r.number, r.name, r.date, r.fileId, r.sortOrder);
    }),
    setVor: (actId: number, rows: VorLineInput[]) => tx(() => {
      db.prepare("DELETE FROM vor_lines WHERE act_id=?").run(actId);
      const ins = db.prepare("INSERT INTO vor_lines (act_id, grp, material_id, quantity, sort_order) VALUES (?,?,?,?,?)");
      for (const r of rows) ins.run(actId, r.group, r.materialId, r.quantity, r.sortOrder);
    }),
    /** Номера актов, где используется материал (строки акта или ВОР). */
    actsUsingMaterial: (materialId: number): string[] =>
      (db.prepare(`SELECT DISTINCT a.base_number n FROM acts a WHERE a.id IN (
         SELECT act_id FROM act_materials WHERE material_id=? UNION SELECT act_id FROM vor_lines WHERE material_id=?)
       ORDER BY a.base_number`).all(materialId, materialId) as any[]).map((r) => r.n as string),
  };
};
