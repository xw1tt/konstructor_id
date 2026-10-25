// Этап 1: API администратора компании — сотрудники (в пределах мест) и операции баланса (только просмотр).
import { z } from "zod";
import { HttpError, Reply, notFound, type Router } from "@idk/server/http/router";
import type { Auth } from "../auth.ts";
import type { Db } from "../db.ts";
import { tenantState } from "../billing.ts";
import { inviteLink, ledgerOf, usersOf } from "./owner.ts";

/** Занятые рабочие места: активные пользователи и действующие приглашения; проверяющие — бесплатно, если так в тарифе. */
async function seatsUsed(db: Db, tenantId: string): Promise<number> {
  const [r] = await db.query<{ n: number }>(
    `SELECT (
       (SELECT count(*) FROM users u WHERE u.tenant_id = $1 AND u.status = 'active'
          AND NOT (u.role = 'reviewer' AND coalesce((SELECT reviewer_free FROM tariffs tr JOIN tenants t ON t.tariff_id = tr.id WHERE t.id = $1), true)))
     + (SELECT count(*) FROM invites i WHERE i.tenant_id = $1 AND i.used_at IS NULL AND i.expires_at > now()
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = i.email)
          AND NOT (i.role = 'reviewer' AND coalesce((SELECT reviewer_free FROM tariffs tr JOIN tenants t ON t.tariff_id = tr.id WHERE t.id = $1), true)))
     )::int AS n`, [tenantId]);
  return r.n;
}

export function companyRoutes(r: Router, auth: Auth, db: Db, publicUrl: string) {
  const admin = (c: Parameters<Auth["require"]>[0]) => auth.require(c, ["admin"]);
  r.get("/api/company", async (c) => {
    const u = await admin(c);
    const [t] = await db.query("SELECT id, name, inn, seats FROM tenants WHERE id = $1", [u.tenant_id]);
    return { tenant: t, state: await tenantState(db, u.tenant_id!), seatsUsed: await seatsUsed(db, u.tenant_id!), users: await usersOf(db, u.tenant_id!), ledger: await ledgerOf(db, u.tenant_id!) };
  });
  r.post("/api/company/invites", async (c) => {
    const u = await admin(c);
    const q = await c.body(z.object({ email: z.string(), role: z.enum(["admin", "engineer", "reviewer"]) }));
    const [t] = await db.query<{ seats: number; reviewer_free: boolean | null }>(
      "SELECT t.seats, tr.reviewer_free FROM tenants t LEFT JOIN tariffs tr ON tr.id = t.tariff_id WHERE t.id = $1", [u.tenant_id]);
    const exists = (await db.query("SELECT 1 FROM users WHERE email = $1", [q.email.trim().toLowerCase()])).length > 0;
    const free = q.role === "reviewer" && (t.reviewer_free ?? true);
    if (!exists && !free && (await seatsUsed(db, u.tenant_id!)) >= t.seats)
      throw new HttpError(409, `Все рабочие места заняты (${t.seats}). Добавить места может владелец сервиса`);
    return new Reply(201, { link: inviteLink(publicUrl, await auth.invite(u, u.tenant_id, q.email, q.role)) });
  });
  r.put("/api/company/users/:uid", async (c) => {
    const u = await admin(c);
    const q = await c.body(z.object({ status: z.enum(["active", "blocked"]) }));
    const [target] = await db.query<{ id: string; email: string }>("SELECT id, email FROM users WHERE id = $1 AND tenant_id = $2", [c.params.uid, u.tenant_id]);
    if (!target) throw notFound("Пользователь");
    if (target.id === u.id) throw new HttpError(400, "Нельзя заблокировать самого себя");
    await db.query("UPDATE users SET status = $2 WHERE id = $1", [target.id, q.status]);
    if (q.status === "blocked") await db.query("DELETE FROM sessions WHERE user_id = $1", [target.id]);
    await auth.audit(u.id, u.tenant_id, "user.update", target.email, q);
  });
}
