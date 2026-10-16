import { test } from "node:test";
import assert from "node:assert/strict";
import { cloneGroup, renameGroup, groupsOf } from "@idk/addin/tabs/acts/vorMath";
import { vorTotals } from "@idk/shared/acts/rows";

const l = (group: string, materialId: number, quantity: number, sortOrder: number) => ({ group, materialId, quantity, sortOrder });

test("vorTotals: 430 + 436,6 + 483,3 + 269 = 1618,9 точно", () => {
  assert.equal(vorTotals([l("П5", 1, 430, 0), l("П4", 1, 436.6, 1), l("П3", 1, 483.3, 2), l("П2", 1, 269, 3)]).get(1), 1618.9);
});

test("cloneGroup: те же материалы с пустыми объёмами, в конце списка", () => {
  const lines = [l("Этаж П5", 1, 430, 0), l("Этаж П5", 2, 259.4, 1), l("Этаж П4", 1, 436.6, 2)];
  const out = cloneGroup(lines, "Этаж П5", "Этаж П3");
  assert.equal(out.length, 5);
  assert.deepEqual(out.slice(3), [l("Этаж П3", 1, 0, 3), l("Этаж П3", 2, 0, 4)]);
  assert.deepEqual(groupsOf(out), ["Этаж П5", "Этаж П4", "Этаж П3"]);
});

test("cloneGroup: имя уже занято → без изменений", () => {
  const lines = [l("А", 1, 1, 0), l("Б", 1, 1, 1)];
  assert.deepEqual(cloneGroup(lines, "А", "Б"), lines);
});

test("renameGroup: переименовывает все строки группы", () => {
  assert.deepEqual(renameGroup([l("А", 1, 1, 0), l("Б", 2, 1, 1)], "А", "В").map((x) => x.group), ["В", "Б"]);
});
