// План 12, задача 2: API справочника — итоговый справочник и дополнения пользователя.
import { Router, HttpError } from "../http/router.ts";
import type { CatalogStore } from "../catalog/store.ts";
import { mergeCatalog } from "@idk/shared/catalog/merge";
import { UserCatalog } from "@idk/shared/catalog/model";
import { BUILTIN_CATALOG } from "@idk/shared/catalog/builtin";

export function catalogRoutes(r: Router, store: CatalogStore) {
  r.get("/api/catalog", () => {
    const user = store.user();
    const { catalog } = mergeCatalog(BUILTIN_CATALOG, user);
    const { own, ...rest } = catalog;
    return { catalog: rest, own: [...own], hidden: user.hidden };
  });

  r.get("/api/catalog/user", () => store.user());

  r.put("/api/catalog/user", async (c) => {
    const q = await c.body(UserCatalog);
    const { errors } = mergeCatalog(BUILTIN_CATALOG, q);
    if (errors.length) throw new HttpError(422, errors[0]);
    store.save(q);
    return q;
  });
}
