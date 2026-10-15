import { z } from "zod";
import type { Db } from "../db.ts";
import { Router, Reply, HttpError, notFound } from "../http/router.ts";
import { OrganizationInput, ObjectInfo, SectionInput, RepresentativeInput } from "@idk/shared/schemas";
import { ROLE_CODES } from "@idk/shared/roles";
import { activeRepresentatives } from "@idk/shared/rules";
import { organizations } from "../repo/organizations.ts";
import { objectInfo } from "../repo/objectInfo.ts";
import { sections } from "../repo/sections.ts";
import { representatives } from "../repo/representatives.ts";

/** Переводит нарушение внешнего ключа SQLite в 409/400 с понятным текстом. */
function fkGuard<T>(fn: () => T, what: string): T {
  try {
    return fn();
  } catch (e) {
    if (/FOREIGN KEY constraint failed/.test((e as Error).message))
      throw new HttpError(400, `${what}: указанная организация не существует`);
    throw e;
  }
}

export function objectRoutes(r: Router, db: Db) {
  const orgs = organizations(db);
  const obj = objectInfo(db);
  const secs = sections(db);
  const reps = representatives(db);

  r.get("/api/organizations", () => orgs.list());
  r.post("/api/organizations", async (c) => new Reply(201, orgs.create(await c.body(OrganizationInput))));
  r.get("/api/organizations/:id", (c) => orgs.get(c.id()) ?? Promise.reject(notFound("Организация")));
  r.put("/api/organizations/:id", async (c) => orgs.update(c.id(), await c.body(OrganizationInput)) ?? Promise.reject(notFound("Организация")));
  r.delete("/api/organizations/:id", (c) => {
    const id = c.id();
    if (!orgs.get(id)) throw notFound("Организация");
    const u = orgs.usages(id);
    if (u.length) throw new HttpError(409, `Организация используется: ${u.join("; ")}`);
    orgs.delete(id);
  });

  r.get("/api/object", () => obj.get());
  r.put("/api/object", (c) => fkGuardAsync(c.body(ObjectInfo), (o) => obj.save(o), "Роли объекта"));

  r.get("/api/sections", () => secs.list());
  r.post("/api/sections", async (c) => { const b = await c.body(SectionInput); return new Reply(201, fkGuard(() => secs.create(b), "Раздел")); });
  r.put("/api/sections/:id", async (c) => { const id = c.id(); const b = await c.body(SectionInput); return fkGuard(() => secs.update(id, b), "Раздел") ?? Promise.reject(notFound("Раздел")); });
  r.delete("/api/sections/:id", (c) => { if (!secs.delete(c.id())) throw notFound("Раздел"); });

  r.get("/api/representatives", () => reps.list());
  r.get("/api/representatives/active", (c) => {
    const role = z.enum(ROLE_CODES).safeParse(c.query.get("role"));
    const date = c.query.get("date") ?? "";
    if (!role.success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Укажите role и date (ГГГГ-ММ-ДД)");
    return activeRepresentatives(reps.list(), role.data, date);
  });
  r.post("/api/representatives", async (c) => { const b = await c.body(RepresentativeInput); return new Reply(201, fkGuard(() => reps.create(b), "Представитель")); });
  r.put("/api/representatives/:id", async (c) => { const id = c.id(); const b = await c.body(RepresentativeInput); return fkGuard(() => reps.update(id, b), "Представитель") ?? Promise.reject(notFound("Представитель")); });
  r.delete("/api/representatives/:id", (c) => { if (!reps.delete(c.id())) throw notFound("Представитель"); });
}

async function fkGuardAsync<A, T>(p: Promise<A>, fn: (a: A) => T, what: string): Promise<T> {
  const a = await p;
  return fkGuard(() => fn(a), what);
}
