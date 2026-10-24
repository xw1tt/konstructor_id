// План 12, задача 2: дополнения справочника пользователя на диске: <dataDir>/catalog.json.
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { UserCatalog, type UserCatalog as UserCatalogType } from "@idk/shared/catalog/model";

export class CatalogStore {
  private file: string;
  constructor(dataDir: string) {
    this.file = join(dataDir, "catalog.json");
  }

  user(): UserCatalogType {
    try { return UserCatalog.parse(JSON.parse(readFileSync(this.file, "utf8"))); }
    catch { return UserCatalog.parse({}); }
  }

  save(u: UserCatalogType): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(u, null, 2));
    renameSync(tmp, this.file);
  }
}
