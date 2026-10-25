// План 23, задача 1: баланс, ежедневное списание, доступ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { migrate, pgliteDb } from "@idk/cloud/db";
import { accessOf, accrueFees, balanceKop, dayFeeKop, mskDay, setSuspended, tenantState } from "@idk/cloud/billing";

async function setup() {
  const db = await pgliteDb();
  await migrate(db);
  const tariff = randomUUID(), t = randomUUID();
  await db.query("INSERT INTO tariffs (id, name, seat_month_kop) VALUES ($1, 'Базовый', 310000)", [tariff]);
  await db.query("INSERT INTO tenants (id, name, seats, tariff_id, created_at) VALUES ($1, 'ООО Монтаж', 2, $2, '2026-10-24T10:00:00Z')", [t, tariff]);
  return { db, t, tariff };
}

test("плата за сутки и московские сутки", () => {
  assert.equal(dayFeeKop(2, 310000, "2026-10-25"), 20000, "2 места × 3100 ₽ / 31 день = 200 ₽");
  assert.equal(dayFeeKop(1, 100000, "2026-02-10"), 3571, "1000 ₽ / 28 дней, до копейки");
  assert.equal(mskDay(new Date("2026-10-25T21:30:00Z")), "2026-10-26");
});

test("списание: догон пропущенных дней, без повторов; пополнение; доступ с кредитным лимитом; приостановка", async () => {
  const { db, t } = await setup();
  const now = new Date("2026-10-26T09:00:00Z");
  assert.equal(await accrueFees(db, now), 3, "24, 25, 26 октября");
  assert.equal(await accrueFees(db, now), 0, "повторный запуск");
  assert.equal(await accrueFees(db, new Date("2026-10-26T20:59:00Z")), 0, "те же московские сутки");
  assert.equal(await balanceKop(db, t), -60000);
  assert.equal(accessOf("active", -60000, 0), "readonly");
  assert.equal(accessOf("active", -60000, 100000), "active", "кредитный лимит 1000 ₽");
  assert.equal(accessOf("suspended", 999999, 0), "suspended");
  await db.query("INSERT INTO ledger (id, tenant_id, kind, amount_kop, reason) VALUES ($1, $2, 'topup', 500000, 'Счёт №1')", [randomUUID(), t]);
  const st = await tenantState(db, t);
  assert.deepEqual(st, { balanceRub: 4400, access: "active", accessLabel: "активен", tariff: "Базовый", seats: 2, creditRub: 0, seatMonthRub: 3100 });
  await setSuspended(db, t, true, new Date("2026-10-27T09:00:00Z"));
  assert.equal(await accrueFees(db, new Date("2026-10-28T09:00:00Z")), 0, "приостановленная не платит");
  await setSuspended(db, t, false, new Date("2026-10-28T09:00:00Z"));
  assert.equal(await accrueFees(db, new Date("2026-10-28T09:00:00Z")), 1, "после возобновления — только с 28-го, 27-е (приостановка) не оплачивается");
});
