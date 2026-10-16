import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { portalDialogUrl } from "@idk/addin/panel/portal";
import { normativState } from "@idk/addin/panel/normativState";
import { aov1Book } from "../../shared/test/fixtures/aov1Book.ts";

test("адрес окна портала", () => {
  assert.equal(portalDialogUrl("https://localhost:3443", "https://protect.gost.ru/sp?search=СП 1"),
    "https://localhost:3443/addin/portal.html?to=" + encodeURIComponent("https://protect.gost.ru/sp?search=СП 1"));
});

test("состояние экрана: книга 0.3 без листа «Нормативы», пустой реестр, есть строки", async () => {
  const old = aov1Book(); old.drop("Нормативы");
  assert.equal(normativState(await readBook(old)), "missing");
  assert.equal(normativState(await readBook(aov1Book())), "empty");
  const wb = aov1Book(); await wb.insert("Нормативы", 0, [{ "Обозначение": "ПУЭ", "Вид": "ПУЭ" }]);
  assert.equal(normativState(await readBook(wb)), "ok");
});
