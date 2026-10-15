import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_CODES } from "@idk/shared/roles";

test("smoke: импорт @idk/shared работает", () => {
  assert.ok(Array.isArray(ROLE_CODES));
});
