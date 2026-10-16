import { test } from "node:test";
import assert from "node:assert/strict";
import { nextNumberFor } from "@idk/addin/book/numbering";

test("nextNumberFor: берёт наибольший номер, а не последний по сортировке", () => {
  const list = [{ baseNumber: "К32.В.СТ.АОВ1.01.00.10" }, { baseNumber: "К32.В.СТ.АОВ1.01.00.9" }];
  assert.equal(nextNumberFor(list), "К32.В.СТ.АОВ1.01.00.11");
  assert.equal(nextNumberFor([]), "1");
});
