// План 21: сведения о запоминании ширины панели.
import { test } from "node:test";
import assert from "node:assert/strict";
import { widthSupport, widthSupportText } from "@idk/addin/panel/panelWidth";

test("версия Excel и поддержка TaskPaneApi 1.1", () => {
  const office = (ok: boolean) => ({ context: { diagnostics: { version: "16.0.14332.20000" }, requirements: { isSetSupported: (n: string, v: string) => ok && n === "TaskPaneApi" && v === "1.1" } } });
  assert.deepEqual(widthSupport(office(true)), { version: "16.0.14332.20000", supported: true });
  assert.deepEqual(widthSupport(office(false)), { version: "16.0.14332.20000", supported: false });
  assert.deepEqual(widthSupport(undefined), { version: null, supported: false });
  assert.match(widthSupportText(widthSupport(office(false))), /16\.0\.14332\.20000\) не умеет.*2507/);
  assert.match(widthSupportText({ version: null, supported: true }), /запоминается/);
});
