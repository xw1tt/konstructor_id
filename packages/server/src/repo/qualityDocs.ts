import type { Db } from "../db.ts";
import type { QualityDoc, QualityDocInput } from "@idk/shared/schemas";
import { camel } from "./util.ts";

export const qualityDocs = (db: Db) => {
  const withLinks = (r: any): QualityDoc => {
    const d = camel<Omit<QualityDoc, "materialIds">>(r)!;
    const ids = (db.prepare("SELECT material_id FROM material_quality_docs WHERE doc_id=? ORDER BY material_id").all(r.id) as any[])
      .map((x) => x.material_id as number);
    return { ...d, materialIds: ids };
  };
  const setLinks = (docId: number, ids: number[]) => {
    db.prepare("DELETE FROM material_quality_docs WHERE doc_id=?").run(docId);
    const ins = db.prepare("INSERT INTO material_quality_docs (material_id, doc_id) VALUES (?, ?)");
    for (const m of new Set(ids)) ins.run(m, docId);
  };
  const tx = <T>(fn: () => T): T => {
    db.exec("BEGIN");
    try { const v = fn(); db.exec("COMMIT"); return v; } catch (e) { db.exec("ROLLBACK"); throw e; }
  };
  const pagesOf = (fileId: number | null) =>
    fileId === null ? 0 : ((db.prepare("SELECT pages FROM files WHERE id=?").get(fileId) as any)?.pages ?? 0);

  const api = {
    list: () => (db.prepare("SELECT * FROM quality_docs ORDER BY id").all() as any[]).map(withLinks),
    get: (id: number) => { const r = db.prepare("SELECT * FROM quality_docs WHERE id=?").get(id); return r ? withLinks(r) : undefined; },
    forMaterial: (materialId: number) =>
      (db.prepare(`SELECT q.* FROM quality_docs q JOIN material_quality_docs l ON l.doc_id=q.id
                   WHERE l.material_id=? ORDER BY q.id`).all(materialId) as any[]).map(withLinks),
    /** sheets = 0 означает «взять число страниц файла». */
    create: (d: QualityDocInput): QualityDoc => tx(() => {
      const sheets = d.sheets || pagesOf(d.fileId);
      const r = db.prepare("INSERT INTO quality_docs (type, number, issue_date, valid_until, sheets, file_id) VALUES (?,?,?,?,?,?)")
        .run(d.type, d.number, d.issueDate, d.validUntil, sheets, d.fileId);
      const id = Number(r.lastInsertRowid);
      setLinks(id, d.materialIds);
      return api.get(id)!;
    }),
    update: (id: number, d: QualityDocInput): QualityDoc | undefined => tx(() => {
      const sheets = d.sheets || pagesOf(d.fileId);
      const r = db.prepare("UPDATE quality_docs SET type=?, number=?, issue_date=?, valid_until=?, sheets=?, file_id=? WHERE id=?")
        .run(d.type, d.number, d.issueDate, d.validUntil, sheets, d.fileId, id);
      if (!r.changes) return undefined;
      setLinks(id, d.materialIds);
      return api.get(id);
    }),
    delete: (id: number) => db.prepare("DELETE FROM quality_docs WHERE id=?").run(id).changes > 0,
  };
  return api;
};
