// План 20, задача 1: предложение дополнить справочник.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_CATALOG } from "@idk/shared/catalog/builtin";
import { mergeCatalog, mergeUserCatalog } from "@idk/shared/catalog/merge";
import { validateCatalogProposal } from "@idk/shared/ai/catalogTool";

const EMPTY = { docs: [], sections: [], hidden: [] };
const sec = BUILTIN_CATALOG.sections[0];
const someDoc = BUILTIN_CATALOG.docs[0].code;

test("вид работ в существующий раздел со своим документом; новый раздел; итог проходит слияние", () => {
  const r = validateCatalogProposal(BUILTIN_CATALOG, EMPTY, {
    docs: [{ code: "АПК", name: "Акт проверки контроллеров СКУД", clause344: 7, make: "form", scope: "act" }],
    works: [{ section: sec.code, code: "СКУД-1", name: "Монтаж СКУД", docs: ["апк", someDoc] },
      { section: "СКУД", sectionName: "Системы контроля доступа", code: "СКУД-2", name: "Пусконаладка СКУД", docs: ["АПК"] }],
  });
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.add.sections.length, 2);
  assert.deepEqual(r.add.sections[0].works[0].docs, ["АПК", someDoc], "коды — как в справочнике");
  assert.equal(r.lines.length, 3);
  assert.match(r.lines[2], /\(новый раздел\)/);
  const merged = mergeCatalog(BUILTIN_CATALOG, mergeUserCatalog(EMPTY, r.add));
  assert.deepEqual(merged.errors, []);
  assert.ok(merged.catalog.sections.find((s) => s.code === sec.code)!.works.some((w) => w.code === "СКУД-1"));
});

test("ошибки: занятый код, неизвестный документ, новый раздел без названия, встроенный документ, пусто", () => {
  const e = (args: any) => { const r = validateCatalogProposal(BUILTIN_CATALOG, EMPTY, args); assert.equal(r.ok, false); return (r as any).error as string; };
  assert.match(e({ docs: [{ code: someDoc, name: "x", clause344: 1, make: "scan", scope: "act" }] }), /уже есть/);
  assert.match(e({ works: [{ section: sec.code, code: sec.works[0].code, name: "x", docs: [] }] }), /уже есть/);
  assert.match(e({ works: [{ section: sec.code, code: "Н1", name: "x", docs: ["НЕТ-ТАКОГО"] }] }), /Нет документов с кодами: НЕТ-ТАКОГО/);
  assert.match(e({ works: [{ section: "НОВЫЙ", code: "Н1", name: "x", docs: [] }] }), /укажи sectionName/);
  assert.match(e({ docs: [{ code: "Z", name: "x", clause344: 1, make: "builtin", scope: "act" }] }), /Встроенные/);
  assert.match(e({}), /Нечего добавлять/);
});
