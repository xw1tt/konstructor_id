import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDecimalDraft } from "@idk/addin/tabs/acts/decimal";
import { nextNumberFor } from "@idk/addin/tabs/acts/actDefaults";

test("parseDecimalDraft: незаконченный ввод с запятой допускается и не теряется", () => {
  assert.deepEqual(parseDecimalDraft("436,"), { ok: true, value: 436 });
  assert.deepEqual(parseDecimalDraft("436,6"), { ok: true, value: 436.6 });
  assert.deepEqual(parseDecimalDraft("1618.9"), { ok: true, value: 1618.9 });
  assert.deepEqual(parseDecimalDraft(""), { ok: true, value: null });
  assert.deepEqual(parseDecimalDraft("1,2,3"), { ok: false });
  assert.deepEqual(parseDecimalDraft("-5"), { ok: false });
  assert.deepEqual(parseDecimalDraft("abc"), { ok: false });
});

test("nextNumberFor: берёт наибольший номер, а не последний по сортировке", () => {
  const list = [{ baseNumber: "К32.В.СТ.АОВ1.01.00.10" }, { baseNumber: "К32.В.СТ.АОВ1.01.00.9" }];
  assert.equal(nextNumberFor(list), "К32.В.СТ.АОВ1.01.00.11");
  assert.equal(nextNumberFor([]), "1");
});
