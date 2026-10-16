// Справочник нормативов портала protect.gost.ru: поиск по сохранённым спискам.
import type { Db } from "../db.ts";
import { Router, HttpError } from "../http/router.ts";
import { isNormSection } from "@idk/shared/normCatalog";
import { normCatalog } from "../repo/normCatalog.ts";

const num = (v: string | null) => (v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));

export function normRoutes(r: Router, db: Db) {
  const N = normCatalog(db);
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
