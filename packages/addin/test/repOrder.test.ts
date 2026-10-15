import { test } from "node:test";
import assert from "node:assert/strict";
import { moveRep } from "@idk/addin/tabs/object/repOrder";
import type { Representative } from "@idk/shared/schemas";

const rep = (id: number, sortOrder: number): Representative => ({
  id, role: "performer", position: "", fullName: `R${id}`, orgId: 1, authorityDoc: "", nrsNumber: "",
  nrsDate: null, validFrom: null, validTo: null, sortOrder,
});

test("moveRep: перемещение вверх меняет местами с соседом", () => {
  const list = [rep(10, 1), rep(20, 2), rep(30, 3)];
  const ch = moveRep(list, 20, -1);
  const order = Object.fromEntries(ch.map((c) => [c.id, c.sortOrder]));
  assert.equal(order[20], 1);
  assert.equal(order[10], 2);
});

test("moveRep: первый элемент вверх → пустой массив", () => {
  assert.deepEqual(moveRep([rep(10, 1), rep(20, 2)], 10, -1), []);
  assert.deepEqual(moveRep([rep(10, 1), rep(20, 2)], 20, 1), []);
});

test("moveRep: sortOrder после операции — 1..n без пропусков", () => {
  // Исходные значения с пропусками и повторами (как после ручных правок).
  const list = [rep(1, 0), rep(2, 0), rep(3, 7)];
  const ch = moveRep(list, 3, -1);
  const final = new Map(list.map((r) => [r.id, r.sortOrder]));
  for (const c of ch) final.set(c.id, c.sortOrder);
  assert.deepEqual([...final.values()].sort(), [1, 2, 3]);
  assert.deepEqual([...final.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]), [1, 3, 2]);
});
