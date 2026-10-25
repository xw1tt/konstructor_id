import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { SCREENS } from "@idk/addin/panel/screens";
import { printAct } from "@idk/addin/panel/print";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

test("экраны верхней строки", () => {
  assert.deepEqual(SCREENS.map((s) => [s.id, s.label]), [["home", "Конструктор ИД"], ["normativ", "Норматив"], ["library", "Библиотека"], ["assistant", "Помощник"], ["settings", "Настройки"], ["templates", "Редактор шаблонов"], ["fields", "Поля для шаблона"]]);
});

test("печать передаёт шаблон в задание", async () => {
  const g = globalThis as any;
  const saved = { fetch: g.fetch, window: g.window, location: g.location };
  let body: any = null;
  g.location = { origin: "https://localhost:3443" };
  g.window = { open: () => null };
  g.fetch = async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }), { status: 201 });
  };
  try {
    const issues = await printAct(await readBook(aov1Book()), AOV1, defaultImportant(), "aosr", "sbd");
    assert.deepEqual(issues, []);
    assert.equal(body.template, "sbd");
    assert.equal(body.act.baseNumber, AOV1);
  } finally {
    Object.assign(g, saved);
  }
});
