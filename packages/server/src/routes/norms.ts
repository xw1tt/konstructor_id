// Справочник нормативов портала protect.gost.ru: поиск по сохранённым спискам.
import type { Db } from "../db.ts";
import { Router, HttpError, Reply } from "../http/router.ts";
import { isNormSection } from "@idk/shared/normCatalog";
import { normCatalog } from "../repo/normCatalog.ts";
import { createRefresher, type RefresherDeps } from "../norms/refresh.ts";

const num = (v: string | null) => (v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));

export function normRoutes(r: Router, db: Db, deps: RefresherDeps = {}) {
  const N = normCatalog(db);
  const refresher = createRefresher(db, deps);
  r.post("/api/norms/refresh", () => {
    if (!refresher.start()) throw new HttpError(409, "Обновление уже идёт");
    return new Reply(202, refresher.state());
  });
  r.get("/api/norms/refresh", () => refresher.state());
  r.get("/api/norms", (c) => {
    const raw = c.query.get("section") || "";
    if (raw && !isNormSection(raw)) throw new HttpError(400, "Неизвестный раздел: " + raw);
    return N.search({
      section: raw && isNormSection(raw) ? raw : undefined,
      q: c.query.get("q") ?? "",
      offset: num(c.query.get("offset")),
      limit: num(c.query.get("limit")),
    });
  });
}
