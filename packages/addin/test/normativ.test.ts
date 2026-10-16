import { test } from "node:test";
import assert from "node:assert/strict";
import { portalDialogUrl } from "@idk/addin/panel/portal";

test("адрес окна портала", () => {
  assert.equal(portalDialogUrl("https://localhost:3443", "https://protect.gost.ru/sp?search=СП 1"),
    "https://localhost:3443/addin/portal.html?to=" + encodeURIComponent("https://protect.gost.ru/sp?search=СП 1"));
});
