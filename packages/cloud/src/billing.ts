// Этап 1: баланс компании (сумма операций, копейки), абонентская плата раз в сутки, статус доступа.
import { randomUUID } from "node:crypto";
import type { Db } from "./db.ts";

export type Access = "active" | "readonly" | "suspended";
export const ACCESS_LABELS: Record<Access, string> = { active: "активен", readonly: "только чтение — баланс исчерпан", suspended: "приостановлен владельцем сервиса" };

export const rub = (kop: number) => Math.round(kop) / 100;
export const kop = (rubles: number) => Math.round(rubles * 100);

/** Дата по Москве (ГГГГ-ММ-ДД): сутки списания — московские. */
export const mskDay = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
const daysInMonth = (day: string) => { const [y, m] = day.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const nextDay = (day: string) => new Date(Date.parse(day + "T00:00:00Z") + 86400_000).toISOString().slice(0, 10);

export async function balanceKop(db: Db, tenantId: string): Promise<number> {
  const [r] = await db.query<{ s: number | string | null }>("SELECT coalesce(sum(amount_kop), 0)::bigint AS s FROM ledger WHERE tenant_id = $1", [tenantId]);
  return Number(r?.s ?? 0);
}

/** Доступ: приостановлен владельцем; без платного тарифа (свой, пробный) — активен; иначе — пока баланс выше −кредита. */
export function accessOf(status: string, balance: number, creditKop: number, paid = true): Access {
  if (status === "suspended") return "suspended";
  if (!paid) return "active";
  return balance > -Math.abs(creditKop) ? "active" : "readonly";
}

/** Плата за сутки: места × цена в месяц / число дней месяца, до копейки. */
export const dayFeeKop = (seats: number, seatMonthKop: number, day: string) => Math.round((seats * seatMonthKop) / daysInMonth(day));

/** Списывает абонентскую плату по сегодняшний день включительно (московские сутки), догоняя пропущенные дни.
 *  Одна операция на компанию и день (уникальный индекс) — повторный запуск ничего не меняет. Возвращает число операций. */
export async function accrueFees(db: Db, now: Date): Promise<number> {
  const today = mskDay(now);
  const tenants = await db.query<{ id: string; seats: number; created_at: Date; seat_month_kop: number | string; last: string | null; from: string | null }>(
    `SELECT t.id, t.seats, t.created_at, tr.seat_month_kop, to_char(t.billing_from, 'YYYY-MM-DD') AS "from",
            (SELECT to_char(max(day), 'YYYY-MM-DD') FROM ledger l WHERE l.tenant_id = t.id AND l.kind = 'fee') AS last
     FROM tenants t JOIN tariffs tr ON tr.id = t.tariff_id WHERE t.status = 'active'`);
  let n = 0;
  for (const t of tenants) {
    const price = Number(t.seat_month_kop);
    if (!price || !t.seats) continue;
    let day = t.last ? nextDay(t.last) : mskDay(new Date(t.created_at));
    if (t.from && t.from > day) day = t.from; // после возобновления — с дня возобновления
    for (let guard = 0; day <= today && guard < 400; guard++, day = nextDay(day)) {
      const fee = dayFeeKop(t.seats, price, day);
      if (!fee) continue;
      const r = await db.query<{ id: string }>(
        `INSERT INTO ledger (id, tenant_id, at, kind, amount_kop, reason, day, meta) VALUES ($1, $2, $3, 'fee', $4, $5, $6, $7)
         ON CONFLICT (tenant_id, day) WHERE kind = 'fee' DO NOTHING RETURNING id`,
        [randomUUID(), t.id, now, -fee, `Абонентская плата за ${day.split("-").reverse().join(".")}: мест ${t.seats}`, day, JSON.stringify({ seats: t.seats, seatMonthKop: price })]);
      n += r.length;
    }
  }
  return n;
}

/** Сведения о компании для /api/me и консоли. */
export async function tenantState(db: Db, tenantId: string) {
  const [t] = await db.query<{ status: string; seats: number; credit_kop: number | string; tariff: string | null; seat_month_kop: number | string | null }>(
    `SELECT t.status, t.seats, t.credit_kop, tr.name AS tariff, tr.seat_month_kop FROM tenants t LEFT JOIN tariffs tr ON tr.id = t.tariff_id WHERE t.id = $1`, [tenantId]);
  if (!t) return null;
  const bal = await balanceKop(db, tenantId);
  const access = accessOf(t.status, bal, Number(t.credit_kop), Number(t.seat_month_kop ?? 0) > 0);
  return { balanceRub: rub(bal), access, accessLabel: ACCESS_LABELS[access], tariff: t.tariff, seats: t.seats, creditRub: rub(Number(t.credit_kop)),
    seatMonthRub: t.seat_month_kop === null ? null : rub(Number(t.seat_month_kop)) };
}

/** Приостановка и возобновление: после возобновления плата начисляется с этого дня (дни приостановки не оплачиваются). */
export async function setSuspended(db: Db, tenantId: string, suspended: boolean, now: Date) {
  if (suspended) await db.query("UPDATE tenants SET status = 'suspended' WHERE id = $1", [tenantId]);
  else await db.query("UPDATE tenants SET status = 'active', billing_from = $2 WHERE id = $1", [tenantId, mskDay(now)]);
}
