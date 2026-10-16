import { test } from "node:test";
import assert from "node:assert/strict";
import { hostStatus } from "@idk/addin/book/host";

test("состояние Excel: нет Office.js, старый Excel, подходит", () => {
  assert.equal(hostStatus(undefined), "no-office");
  assert.equal(hostStatus({}), "no-office");
  assert.equal(hostStatus({ context: { requirements: { isSetSupported: () => false } } }), "old");
  assert.equal(hostStatus({ context: { requirements: { isSetSupported: (n: string, v: string) => n === "ExcelApi" && v === "1.9" } } }), "ok");
});
