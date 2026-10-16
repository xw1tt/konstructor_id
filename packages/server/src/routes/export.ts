// Выгрузка всей базы — для переноса данных в книгу объекта.
import type { Db } from "../db.ts";
import type { Router } from "../http/router.ts";
import type { ExportData } from "@idk/shared/workbook/migrate";
import type { FileRow } from "@idk/shared/schemas";
import { acts } from "../repo/acts.ts";
import { organizations } from "../repo/organizations.ts";
import { objectInfo } from "../repo/objectInfo.ts";
import { sections } from "../repo/sections.ts";
import { representatives } from "../repo/representatives.ts";
import { materials } from "../repo/materials.ts";
import { qualityDocs } from "../repo/qualityDocs.ts";

export function exportData(db: Db): ExportData {
  const A = acts(db);
  return {
    object: objectInfo(db).get(),
    organizations: organizations(db).list(),
    sections: sections(db).list(),
    representatives: representatives(db).list(),
    materials: materials(db).list(),
    qualityDocs: qualityDocs(db).list(),
    acts: A.list().map((act) => ({
      act, materials: A.materials(act.id), vor: A.vor(act.id),
      documents: A.documents(act.id).map(({ id: _id, ...d }) => d),
    })),
    files: (db.prepare("SELECT id, sha256, name, mime, size, pages FROM files ORDER BY id").all() as any[]) as FileRow[],
  };
}

export function exportRoutes(r: Router, db: Db) {
  r.get("/api/export", () => exportData(db));
}
