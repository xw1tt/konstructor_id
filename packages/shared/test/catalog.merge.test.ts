// План 12, задача 2: слияние справочника с дополнениями пользователя.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_CATALOG } from "@idk/shared/catalog/builtin";
import { mergeCatalog, mergeUserCatalog, referencedUserCatalog } from "@idk/shared/catalog/merge";
import type { CatalogDoc, UserCatalog } from "@idk/shared/catalog/model";

const pik: CatalogDoc = { code: "ПИК", name: "Протокол испытания кабеля повышенным напряжением", clause344: 7, source: "", make: "scan", scope: "act" };
const empty: UserCatalog = { docs: [], sections: [], hidden: [] };

test("без дополнений — встроенный справочник как есть", () => {
  const { catalog, errors } = mergeCatalog(BUILTIN_CATALOG, empty);
  assert.deepEqual(errors, []);
  assert.deepEqual(catalog.docs, BUILTIN_CATALOG.docs);
  assert.deepEqual(catalog.sections, BUILTIN_CATALOG.sections);
  assert.equal(catalog.own.size, 0);
});

test("свой документ и свой вид работ во встроенном разделе «ЭМ»", () => {
  const user: UserCatalog = {
    docs: [pik],
    sections: [{ code: "ЭМ", name: "Электромонтажные работы", works: [{ code: "Прокладка лотков", name: "Монтаж кабельных лотков", docs: ["ПИК", "АОСР"] }] }],
    hidden: [],
  };
  const { catalog, errors } = mergeCatalog(BUILTIN_CATALOG, user);
  assert.deepEqual(errors, []);
  assert.ok(catalog.docs.some((d) => d.code === "ПИК"));
  const em = catalog.sections.find((s) => s.code === "ЭМ")!;
  assert.ok(em.works.some((w) => w.code === "Прокладка лотков"));
  assert.deepEqual([...catalog.own], ["ПИК", "Прокладка лотков"]);
});

test("скрытый «ВОР»: не в выборе, но docs справочника находит по коду", () => {
  const { catalog, errors } = mergeCatalog(BUILTIN_CATALOG, { ...empty, hidden: ["ВОР"] });
  assert.deepEqual(errors, []);
  assert.ok(catalog.docs.some((d) => d.code === "ВОР"));
  const refs = catalog.sections.flatMap((s) => s.works.flatMap((w) => w.docs));
  assert.ok(!refs.includes("ВОР"));
});

test("конфликт кода — ошибка, документ не добавляется", () => {
  const { catalog, errors } = mergeCatalog(BUILTIN_CATALOG, { ...empty, docs: [{ ...pik, code: "АОСР" }] });
  assert.deepEqual(errors, ["Код «АОСР» занят встроенным документом"]);
  assert.equal(catalog.docs.filter((d) => d.code === "АОСР").length, 1);
});

test("вид работ ссылается на неизвестный документ — ошибка", () => {
  const user: UserCatalog = { ...empty, sections: [{ code: "ЭМ", name: "ЭМ", works: [{ code: "w", name: "w", docs: ["НЕТ"] }] }] };
  const { errors } = mergeCatalog(BUILTIN_CATALOG, user);
  assert.deepEqual(errors, ["Вид работ «w» ссылается на неизвестный документ «НЕТ»"]);
});

test("свой раздел добавляется целиком", () => {
  const user: UserCatalog = { ...empty, sections: [{ code: "НОВ", name: "Новый раздел", works: [{ code: "нр", name: "Работа", docs: ["АОСР"] }] }] };
  const { catalog, errors } = mergeCatalog(BUILTIN_CATALOG, user);
  assert.deepEqual(errors, []);
  const nov = catalog.sections.find((s) => s.code === "НОВ")!;
  assert.equal(nov.name, "Новый раздел");
  assert.equal(nov.works.length, 1);
});

test("mergeUserCatalog: добавляет отсутствующее, не перезаписывает существующее", () => {
  const a: UserCatalog = { docs: [pik], sections: [{ code: "ЭМ", name: "ЭМ", works: [{ code: "w1", name: "w1", docs: ["ПИК"] }] }], hidden: ["ВОР"] };
  const b: UserCatalog = {
    docs: [{ ...pik, name: "Другое имя" }, { code: "СЭЛ", name: "Список электролаборатории", clause344: 9, source: "", make: "scan", scope: "kit" }],
    sections: [{ code: "ЭМ", name: "x", works: [{ code: "w1", name: "не меняется", docs: [] }, { code: "w2", name: "w2", docs: ["СЭЛ"] }] }, { code: "НОВ", name: "Новый", works: [{ code: "нр", name: "нр", docs: ["АОСР"] }] }],
    hidden: ["КЖ"],
  };
  const m = mergeUserCatalog(a, b);
  assert.equal(m.docs.find((d) => d.code === "ПИК")!.name, "Протокол испытания кабеля повышенным напряжением");
  assert.ok(m.docs.some((d) => d.code === "СЭЛ"));
  const em = m.sections.find((s) => s.code === "ЭМ")!;
  assert.equal(em.works.find((w) => w.code === "w1")!.name, "w1");
  assert.ok(em.works.some((w) => w.code === "w2"));
  assert.ok(m.sections.some((s) => s.code === "НОВ"));
  assert.deepEqual(m.hidden, ["ВОР", "КЖ"]);
});

test("referencedUserCatalog: документы шаблона без видов работ", () => {
  const user: UserCatalog = {
    docs: [pik, { code: "СЭЛ", name: "Список электролаборатории", clause344: 9, source: "", make: "scan", scope: "kit" }],
    sections: [
      { code: "ЭМ", name: "ЭМ", works: [{ code: "w1", name: "w1", docs: ["ПИК"] }] },
      { code: "СС", name: "СС", works: [{ code: "w2", name: "w2", docs: ["СЭЛ"] }] },
    ],
    hidden: [],
  };
  const ref = referencedUserCatalog(user, [{ code: "ПИК" }, { code: "АОСР" }]);
  assert.deepEqual(ref.docs.map((d) => d.code), ["ПИК"]);
  assert.deepEqual(ref.sections, []);
});

test("referencedUserCatalog: вид работ шаблона — со всеми его документами", () => {
  const user: UserCatalog = {
    docs: [pik, { code: "СЭЛ", name: "Список электролаборатории", clause344: 9, source: "", make: "scan", scope: "kit" }],
    sections: [
      { code: "ЭМ", name: "ЭМ", works: [{ code: "w1", name: "w1", docs: ["ПИК", "СЭЛ"] }] },
      { code: "СС", name: "СС", works: [{ code: "w2", name: "w2", docs: ["ПИК"] }] },
    ],
    hidden: [],
  };
  // шаблон ссылается на w1: вывозится вид работ и оба его документа, даже если в шаблоне есть только ПИК
  const ref = referencedUserCatalog(user, [{ catalog: "АОСР", works: ["w1"] }, { code: "ПИК" }]);
  assert.deepEqual(ref.docs.map((d) => d.code).sort(), ["ПИК", "СЭЛ"].sort());
  assert.deepEqual(ref.sections.map((s) => s.code), ["ЭМ"]);
  assert.deepEqual(ref.sections[0].works.map((w) => w.code), ["w1"]);
  assert.deepEqual(ref.hidden, []);
});
