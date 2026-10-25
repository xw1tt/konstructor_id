// План 22, задача 1: база и миграции на PGlite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { migrate, pgliteDb } from "@idk/cloud/db";

test("миграции — один раз; запрос с параметрами; транзакция откатывается при ошибке; bigint — числом", async () => {
  const db = await pgliteDb();
  assert.deepEqual(await migrate(db), ["001_init.sql"]);
  assert.deepEqual(await migrate(db), []);
  const id = randomUUID();
  await db.query("INSERT INTO tenants (id, name) VALUES ($1, $2)", [id, "ООО Тест"]);
  await assert.rejects(db.tx(async (t) => {
    await t.query("INSERT INTO ledger (id, tenant_id, kind, amount_kop) VALUES ($1, $2, 'topup', 100000)", [randomUUID(), id]);
    throw new Error("сбой");
  }), /сбой/);
  assert.deepEqual(await db.query("SELECT count(*)::int AS n FROM ledger"), [{ n: 0 }]);
  await db.query("INSERT INTO ledger (id, tenant_id, kind, amount_kop) VALUES ($1, $2, 'topup', 9007199254)", [randomUUID(), id]);
  const [r] = await db.query<{ s: number }>("SELECT sum(amount_kop)::bigint AS s FROM ledger");
  assert.equal(Number(r.s), 9007199254);
  await db.close();
});
