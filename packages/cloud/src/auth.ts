// Этап 1: учётные записи — пароли (scrypt), сессии (в базе — хеш токена), вход с защитой от перебора, приглашения, журнал.
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { HttpError, type Ctx } from "@idk/server/http/router";
import type { Db } from "./db.ts";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number }) => Promise<Buffer>;

export type Role = "owner" | "admin" | "engineer" | "reviewer";
export const ROLE_LABELS: Record<Role, string> = { owner: "владелец сервиса", admin: "администратор компании", engineer: "инженер", reviewer: "проверяющий" };

export interface User { id: string; tenant_id: string | null; email: string; name: string; role: Role; status: "active" | "blocked" }

const N = 16384;
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 32, { N });
  return `scrypt$${N}$${salt.toString("base64")}$${h.toString("base64")}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [kind, n, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length, { N: Number(n) });
  return got.length === want.length && timingSafeEqual(got, want);
}
export const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export const checkPassword = (pw: string) => {
  if (pw.length < 8) throw new HttpError(400, "Пароль — не короче 8 символов");
};
const normEmail = (e: string) => e.trim().toLowerCase();

const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 10 * 60_000;

export class Auth {
  private fails = new Map<string, number[]>();
  constructor(private db: Db, private now: () => Date = () => new Date()) {}

  async audit(userId: string | null, tenantId: string | null, action: string, target = "", details: Record<string, unknown> = {}) {
    await this.db.query("INSERT INTO audit (id, at, user_id, tenant_id, action, target, details) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [randomUUID(), this.now(), userId, tenantId, action, target, JSON.stringify(details)]);
  }

  private recentFails(email: string): number[] {
    const t = this.now().getTime();
    const list = (this.fails.get(email) ?? []).filter((x) => t - x < FAIL_WINDOW_MS);
    this.fails.set(email, list);
    return list;
  }

  async login(emailRaw: string, password: string, client = "panel"): Promise<{ token: string; user: User }> {
    const email = normEmail(emailRaw);
    const fails = this.recentFails(email);
    if (fails.length >= FAIL_LIMIT) {
      const wait = Math.ceil((FAIL_WINDOW_MS - (this.now().getTime() - fails[0])) / 60_000);
      throw new HttpError(429, `Слишком много неудачных попыток — подождите ${wait} мин.`);
    }
    const [u] = await this.db.query<User & { password_hash: string }>("SELECT * FROM users WHERE email = $1", [email]);
    if (!u || !u.password_hash || !(await verifyPassword(password, u.password_hash))) {
      fails.push(this.now().getTime());
      throw new HttpError(401, "Неверная почта или пароль");
    }
    if (u.status !== "active") throw new HttpError(403, "Учётная запись заблокирована — обратитесь к администратору компании");
    this.fails.delete(email);
    const token = newToken();
    const exp = new Date(this.now().getTime() + SESSION_DAYS * 86400_000);
    await this.db.query("INSERT INTO sessions (token_hash, user_id, client, created_at, expires_at, last_seen) VALUES ($1, $2, $3, $4, $5, $4)",
      [tokenHash(token), u.id, client, this.now(), exp]);
    await this.audit(u.id, u.tenant_id, "login", client);
    const { password_hash: _, ...user } = u;
    return { token, user };
  }

  async logout(token: string) { await this.db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]); }

  /** Пользователь по токену (активный, сессия не истекла) или null. */
  async session(token: string): Promise<User | null> {
    if (!token) return null;
    const [u] = await this.db.query<User>(
      `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.status FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2`, [tokenHash(token), this.now()]);
    if (!u || u.status !== "active") return null;
    await this.db.query("UPDATE sessions SET last_seen = $2 WHERE token_hash = $1", [tokenHash(token), this.now()]);
    return u;
  }

  /** Пользователь запроса; roles — допустимые роли. */
  async require(c: Ctx, roles?: Role[]): Promise<User> {
    const h = String(c.req.headers.authorization ?? "");
    const u = await this.session(h.startsWith("Bearer ") ? h.slice(7).trim() : "");
    if (!u) throw new HttpError(401, "Войдите заново");
    if (roles && !roles.includes(u.role)) throw new HttpError(403, "Недостаточно прав");
    return u;
  }

  async setPassword(userId: string, pw: string) {
    checkPassword(pw);
    await this.db.query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, await hashPassword(pw)]);
    await this.db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  }

  async changePassword(u: User, oldPw: string, newPw: string) {
    const [r] = await this.db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [u.id]);
    if (!r || !(await verifyPassword(oldPw, r.password_hash))) throw new HttpError(400, "Неверный текущий пароль");
    await this.setPassword(u.id, newPw);
    await this.audit(u.id, u.tenant_id, "password.change", u.email);
  }

  /** Приглашение (новый пользователь) или сброс пароля (почта уже есть в этой компании). Возвращает токен ссылки. */
  async invite(by: User | null, tenantId: string | null, emailRaw: string, role: Role): Promise<string> {
    const email = normEmail(emailRaw);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Неверная почта");
    if ((role === "owner") !== (tenantId === null)) throw new HttpError(400, "Владелец сервиса — без компании, остальные — в компании");
    const [existing] = await this.db.query<User>("SELECT id, tenant_id, email, name, role, status FROM users WHERE email = $1", [email]);
    if (existing && existing.tenant_id !== tenantId) throw new HttpError(409, "Эта почта уже зарегистрирована в другой компании");
    const token = newToken();
    await this.db.query("INSERT INTO invites (token_hash, tenant_id, email, role, created_by, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [tokenHash(token), tenantId, email, existing?.role ?? role, by?.id ?? null, this.now(), new Date(this.now().getTime() + INVITE_DAYS * 86400_000)]);
    await this.audit(by?.id ?? null, tenantId, existing ? "invite.reset" : "invite.create", email, { role });
    return token;
  }

  private async liveInvite(token: string) {
    const [i] = await this.db.query<{ token_hash: string; tenant_id: string | null; email: string; role: Role; expires_at: Date; used_at: Date | null }>(
      "SELECT * FROM invites WHERE token_hash = $1", [tokenHash(token)]);
    if (!i) throw new HttpError(404, "Приглашение не найдено");
    if (i.used_at) throw new HttpError(410, "Приглашение уже использовано");
    if (new Date(i.expires_at) <= this.now()) throw new HttpError(410, "Срок приглашения истёк — попросите новое");
    return i;
  }

  async inviteInfo(token: string) {
    const i = await this.liveInvite(token);
    const [t] = i.tenant_id ? await this.db.query<{ name: string }>("SELECT name FROM tenants WHERE id = $1", [i.tenant_id]) : [];
    const [u] = await this.db.query<{ name: string }>("SELECT name FROM users WHERE email = $1", [i.email]);
    return { email: i.email, role: i.role, tenant: t?.name ?? null, existing: !!u, name: u?.name ?? "" };
  }

  /** Принять приглашение: новый пользователь или новый пароль существующего; сразу вход. */
  async acceptInvite(token: string, name: string, password: string, client = "panel"): Promise<{ token: string; user: User }> {
    checkPassword(password);
    const i = await this.liveInvite(token);
    const hash = await hashPassword(password);
    await this.db.tx(async (t) => {
      const [u] = await t.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [i.email]);
      if (u) await t.query("UPDATE users SET password_hash = $2, name = CASE WHEN $3 = '' THEN name ELSE $3 END WHERE id = $1", [u.id, hash, name.trim()]);
      else await t.query("INSERT INTO users (id, tenant_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [randomUUID(), i.tenant_id, i.email, name.trim(), i.role, hash]);
      await t.query("UPDATE invites SET used_at = $2 WHERE token_hash = $1", [i.token_hash, this.now()]);
      if (u) await t.query("DELETE FROM sessions WHERE user_id = $1", [u.id]);
    });
    return this.login(i.email, password, client);
  }
}
