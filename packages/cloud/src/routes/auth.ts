// Этап 1: вход, выход, «я», смена пароля, приглашения.
import { z } from "zod";
import { Reply, type Router } from "@idk/server/http/router";
import type { Auth } from "../auth.ts";
import type { Db } from "../db.ts";

const bearer = (h: unknown) => { const s = String(h ?? ""); return s.startsWith("Bearer ") ? s.slice(7).trim() : ""; };

/** Сведения о компании пользователя для /api/me (баланс и доступ — план 23 через extra). */
export type MeExtra = (tenantId: string) => Promise<Record<string, unknown>>;

export function authRoutes(r: Router, auth: Auth, db: Db, extra: MeExtra = async () => ({})) {
  r.post("/api/auth/login", async (c) => {
    const q = await c.body(z.object({ email: z.string(), password: z.string(), client: z.enum(["panel", "console"]).default("panel") }));
    return auth.login(q.email, q.password, q.client);
  });
  r.post("/api/auth/logout", async (c) => { await auth.logout(bearer(c.req.headers.authorization)); });
  r.get("/api/me", async (c) => {
    const u = await auth.require(c);
    const [t] = u.tenant_id ? await db.query("SELECT id, name, inn, status, seats FROM tenants WHERE id = $1", [u.tenant_id]) : [];
    return { user: { id: u.id, email: u.email, name: u.name, role: u.role }, tenant: t ? { ...t, ...(await extra(u.tenant_id!)) } : null };
  });
  r.post("/api/auth/password", async (c) => {
    const u = await auth.require(c);
    const q = await c.body(z.object({ old: z.string(), password: z.string() }));
    await auth.changePassword(u, q.old, q.password);
  });
  r.get("/api/invites/:token", (c) => auth.inviteInfo(c.params.token));
  r.post("/api/invites/:token", async (c) => {
    const q = await c.body(z.object({ name: z.string().default(""), password: z.string(), client: z.enum(["panel", "console"]).default("console") }));
    return new Reply(201, await auth.acceptInvite(c.params.token, q.name, q.password, q.client));
  });
}
