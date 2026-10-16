import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closeBrowser, htmlToPdf, currentBrowserForTests } from "@idk/server/print/browser";

after(() => closeBrowser());

test("print: после падения браузера печать восстанавливается", async () => {
  await htmlToPdf("<p>1</p>");
  const b = await currentBrowserForTests();
  await b!.close(); // имитация: Edge закрыт обновлением
  const pdf = await htmlToPdf("<p>2</p>");
  assert.ok(pdf.length > 100);
});
