// Этап 1: API владельца сервиса — компании, тарифы, баланс, пользователи, журнал действий.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, Reply, notFound, type Router } from "@idk/server/http/router";
import type { Auth } from "../auth.ts";
import type { Db } from "../db.ts";
import { balanceKop, kop, rub, setSuspended, tenantState } from "../billing.ts";

const Money = z.number().finite();
const Role = z.enum(["admin", "engineer", "reviewer"]);

export const inviteLink = (publicUrl: string, token: string) => `${publicUrl.replace(/\/$/, "")}/console/#/invite/${token}`;

async function tenantOr404(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Компания");
  const [t] = await db.query<Record<string, unknown>>("SELECT * FROM tenants WHERE id = $1", [id]);
  if (!t) throw notFound("Компания");
  return t;
}

export const usersOf = (db: Db, tenantId: string) => db.query(
  `SELECT id, email, name, role, status, created_at,
     (SELECT max(last_seen) FROM sessions s WHERE s.user_id = u.id) AS last_seen
   FROM users u WHERE tenant_id = $1 ORDER BY role, name`, [tenantId]);

export const ledgerOf = async (db: Db, tenantId: string, limit = 200) =>
  (await db.query<{ id: string; at: Date; kind: string; amount_kop: number | string; reason: string; author: string | null }>(
    `SELECT l.id, l.at, l.kind, l.amount_kop, l.reason, u.email AS author FROM ledger l LEFT JOIN users u ON u.id = l.author_id
     WHERE l.tenant_id = $1 ORDER BY l.at DESC, l.day DESC NULLS LAST LIMIT $2`, [tenantId, limit]))
    .map(({ amount_kop, ...r }) => ({ ...r, amountRub: rub(Number(amount_kop)) }));

export function ownerRoutes(r: Router, auth: Auth, db: Db, publicUrl: string, now: () => Date) {
  const owner = (c: Parameters<Auth["require"]>[0]) => auth.require(c, ["owner"]);

  r.get("/api/owner/tenants", async (c) => {
    await owner(c);
    const list = await db.query<{ id: string; name: string; inn: string; status: string; seats: number; tariff: string | null; users: number }>(
      `SELECT t.id, t.name, t.inn, t.status, t.seats, tr.name AS tariff, (SELECT count(*)::int FROM users u WHERE u.tenant_id = t.id AND u.status = 'active') AS users
       FROM tenants t LEFT JOIN tariffs tr ON tr.id = t.tariff_id ORDER BY t.name`);
    return Promise.all(list.map(async (t) => ({ ...t, ...(await tenantState(db, t.id)) })));
  });
  r.post("/api/owner/tenants", async (c) => {
    const u = await owner(c);
    const q = await c.body(z.object({ name: z.string().trim().min(1, "Укажите название"), inn: z.string().trim().default(""), seats: z.number().int().min(0).default(1),
      tariffId: z.string().uuid().nullable().default(null), creditRub: Money.min(0).default(0) }));
    const id = randomUUID();
    await db.query("INSERT INTO tenants (id, name, inn, seats, tariff_id, credit_kop, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, q.name, q.inn, q.seats, q.tariffId, kop(q.creditRub), now()]);
    await auth.audit(u.id, id, "tenant.create", q.name, q);
    return new Reply(201, { id });
  });
  r.get("/api/owner/tenants/:tid", async (c) => {
    await owner(c);
    const t = await tenantOr404(db, c.params.tid);
    return { tenant: { id: t.id, name: t.name, inn: t.inn, status: t.status, seats: t.seats, tariffId: t.tariff_id, creditRub: rub(Number(t.credit_kop)), createdAt: t.created_at },
      state: await tenantState(db, c.params.tid), users: await usersOf(db, c.params.tid), ledger: await ledgerOf(db, c.params.tid) };
  });
  r.put("/api/owner/tenants/:tid", async (c) => {
    const u = await owner(c);
    await tenantOr404(db, c.params.tid);
    const q = await c.body(z.object({ name: z.string().trim().min(1).optional(), inn: z.string().trim().optional(), seats: z.number().int().min(0).optional(),
      tariffId: z.string().uuid().nullable().optional(), creditRub: Money.min(0).optional() }));
    const sets: string[] = [], vals: unknown[] = [c.params.tid];
    const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (q.name !== undefined) set("name", q.name);
    if (q.inn !== undefined) set("inn", q.inn);
    if (q.seats !== undefined) set("seats", q.seats);
    if (q.tariffId !== undefined) set("tariff_id", q.tariffId);
    if (q.creditRub !== undefined) set("credit_kop", kop(q.creditRub));
    if (sets.length) await db.query(`UPDATE tenants SET ${sets.join(", ")} WHERE id = $1`, vals);
    await auth.audit(u.id, c.params.tid, "tenant.update", "", q);
    return tenantState(db, c.params.tid);
  });
  for (const [path, suspended] of [["suspend", true], ["resume", false]] as const) {
    r.post(`/api/owner/tenants/:tid/${path}`, async (c) => {
      const u = await owner(c);
      await tenantOr404(db, c.params.tid);
      const q = await c.body(z.object({ reason: z.string().default("") }));
      await setSuspended(db, c.params.tid, suspended, now());
      await auth.audit(u.id, c.params.tid, suspended ? "tenant.suspend" : "tenant.resume", "", q);
      return tenantState(db, c.params.tid);
    });
  }
  r.post("/api/owner/tenants/:tid/ledger", async (c) => {
    const u = await owner(c);
    await tenantOr404(db, c.params.tid);
    const q = await c.body(z.object({ kind: z.enum(["topup", "adjust"]), amountRub: Money, reason: z.string().trim().min(1, "Укажите причину (номер счёта, основание)") }));
    if (q.kind === "topup" && q.amountRub <= 0) throw new HttpError(400, "Сумма пополнения — больше нуля");
    if (q.amountRub === 0) throw new HttpError(400, "Сумма не может быть нулевой");
    const before = await balanceKop(db, c.params.tid);
    await db.query("INSERT INTO ledger (id, tenant_id, at, kind, amount_kop, author_id, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [randomUUID(), c.params.tid, now(), q.kind, kop(q.amountRub), u.id, q.reason]);
    await auth.audit(u.id, c.params.tid, `ledger.${q.kind}`, q.reason, { amountRub: q.amountRub, balanceBeforeRub: rub(before) });
    return new Reply(201, await tenantState(db, c.params.tid));
  });
  r.post("/api/owner/tenants/:tid/invites", async (c) => {
    const u = await owner(c);
    await tenantOr404(db, c.params.tid);
    const q = await c.body(z.object({ email: z.string(), role: Role }));
    return new Reply(201, { link: inviteLink(publicUrl, await auth.invite(u, c.params.tid, q.email, q.role)) });
  });
  r.put("/api/owner/users/:uid", async (c) => {
    const u = await owner(c);
    const q = await c.body(z.object({ status: z.enum(["active", "blocked"]).optional(), role: Role.optional(), name: z.string().optional() }));
    const [target] = await db.query<{ id: string; tenant_id: string | null; email: string }>("SELECT id, tenant_id, email FROM users WHERE id = $1", [c.params.uid]);
    if (!target || !target.tenant_id) throw notFound("Пользователь");
    if (q.status) await db.query("UPDATE users SET status = $2 WHERE id = $1", [target.id, q.status]);
    if (q.role) await db.query("UPDATE users SET role = $2 WHERE id = $1", [target.id, q.role]);
    if (q.name !== undefined) await db.query("UPDATE users SET name = $2 WHERE id = $1", [target.id, q.name]);
    if (q.status === "blocked") await db.query("DELETE FROM sessions WHERE user_id = $1", [target.id]);
    await auth.audit(u.id, target.tenant_id, "user.update", target.email, q);
  });
  r.post("/api/owner/users/:uid/reset", async (c) => {
    const u = await owner(c);
    const [target] = await db.query<{ tenant_id: string | null; email: string; role: "admin" | "engineer" | "reviewer" }>("SELECT tenant_id, email, role FROM users WHERE id = $1", [c.params.uid]);
    if (!target || !target.tenant_id) throw notFound("Пользователь");
    return new Reply(201, { link: inviteLink(publicUrl, await auth.invite(u, target.tenant_id, target.email, target.role)) });
  });

  r.get("/api/owner/tariffs", async (c) => {
    await owner(c);
    return (await db.query<{ id: string; name: string; seat_month_kop: number | string; ai_per_1k_kop: number | string; reviewer_free: boolean }>(
      "SELECT * FROM tariffs ORDER BY name")).map((t) => ({ id: t.id, name: t.name, seatMonthRub: rub(Number(t.seat_month_kop)), aiPer1kRub: rub(Number(t.ai_per_1k_kop)), reviewerFree: t.reviewer_free }));
  });
  const Tariff = z.object({ name: z.string().trim().min(1), seatMonthRub: Money.min(0), aiPer1kRub: Money.min(0).default(0), reviewerFree: z.boolean().default(true) });
  r.post("/api/owner/tariffs", async (c) => {
    const u = await owner(c);
    const q = await c.body(Tariff);
    const id = randomUUID();
    await db.query("INSERT INTO tariffs (id, name, seat_month_kop, ai_per_1k_kop, reviewer_free) VALUES ($1, $2, $3, $4, $5)", [id, q.name, kop(q.seatMonthRub), kop(q.aiPer1kRub), q.reviewerFree]);
    await auth.audit(u.id, null, "tariff.create", q.name, q);
    return new Reply(201, { id });
  });
  r.put("/api/owner/tariffs/:id", async (c) => {
    const u = await owner(c);
    const q = await c.body(Tariff);
    const r2 = await db.query("UPDATE tariffs SET name = $2, seat_month_kop = $3, ai_per_1k_kop = $4, reviewer_free = $5 WHERE id = $1 RETURNING id",
      [c.params.id, q.name, kop(q.seatMonthRub), kop(q.aiPer1kRub), q.reviewerFree]);
    if (!r2.length) throw notFound("Тариф");
    await auth.audit(u.id, null, "tariff.update", q.name, q);
  });

  r.get("/api/owner/audit", async (c) => {
    await owner(c);
    const tenant = c.query.get("tenant");
    const limit = Math.min(500, Math.max(1, Number(c.query.get("limit")) || 200));
    return db.query(
      `SELECT a.at, a.action, a.target, a.details, u.email AS who, t.name AS tenant FROM audit a
       LEFT JOIN users u ON u.id = a.user_id LEFT JOIN tenants t ON t.id = a.tenant_id
       WHERE ($1::uuid IS NULL OR a.tenant_id = $1::uuid) ORDER BY a.at DESC LIMIT $2`, [tenant && /^[0-9a-f-]{36}$/i.test(tenant) ? tenant : null, limit]);
  });
}
