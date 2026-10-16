import type { Db } from "../db.ts";
import type { ActBundle } from "@idk/shared/workbook/bundle";
import { HttpError } from "../http/router.ts";
import { acts } from "../repo/acts.ts";
import { organizations } from "../repo/organizations.ts";
import { objectInfo } from "../repo/objectInfo.ts";
import { sections } from "../repo/sections.ts";
import { representatives } from "../repo/representatives.ts";
import { materials } from "../repo/materials.ts";
import { qualityDocs } from "../repo/qualityDocs.ts";

/** Пакет акта из базы (используется печатью старых данных и тестами). */
export function bundleFromDb(db: Db, actId: number): ActBundle {
  const A = acts(db);
  const act = A.get(actId);
  if (!act) throw new HttpError(404, "Акт не найден");
  return {
    object: objectInfo(db).get(),
    organizations: organizations(db).list(),
    sections: sections(db).list(),
    representatives: representatives(db).list(),
    materials: materials(db).list(),
    qualityDocs: qualityDocs(db).list(),
    act,
    actMaterials: A.materials(actId),
    documents: A.documents(actId),
    vor: A.vor(actId),
  };
}
