import { test } from "node:test";
import assert from "node:assert/strict";
import { nextBaseNumber } from "@idk/addin/tabs/acts/actDefaults";

test("nextBaseNumber: увеличивает последнее числовое звено", () => {
  assert.equal(nextBaseNumber("К32.В.СТ.АОВ1.01.00.1"), "К32.В.СТ.АОВ1.01.00.2");
  assert.equal(nextBaseNumber("К32.В.СТ.АОВ1.01.00.9"), "К32.В.СТ.АОВ1.01.00.10");
  assert.equal(nextBaseNumber("25/АТ-4182-03"), "25/АТ-4182-04");
});

test("nextBaseNumber: строка без числа в конце и пустая строка", () => {
  assert.equal(nextBaseNumber("АОВ1.АОСР"), "АОВ1.АОСР.1");
  assert.equal(nextBaseNumber(""), "1");
});

test("nextBaseNumber: ведущие нули сохраняются", () => {
  assert.equal(nextBaseNumber("А-009"), "А-010");
});
