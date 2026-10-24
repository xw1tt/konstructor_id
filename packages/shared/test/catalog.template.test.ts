// План 12, задача 3: шаблон из справочника — добавить/убрать вид работ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_CATALOG as BUILTIN } from "@idk/shared/catalog/builtin";
import { addWork, removeWork, templateWorks } from "@idk/shared/catalog/template";
import { UserTemplate, type UserTemplate as UT } from "@idk/shared/forms/template";
import type { Catalog } from "@idk/shared/catalog/model";

/** Каркас справочника задачи 1 (не зависит от наполнения встроенного): 7 документов конструктора, два вида работ. */
const BUILTIN_CATALOG: Catalog = {
  version: "t",
  docs: BUILTIN.docs.filter((d) => d.make === "builtin"),
  sections: [
    { code: "ЭМ", name: "ЭМ", works: [{ code: "Прокладка КЛ", name: "Прокладка кабельных линий", docs: ["АОСР", "РИМ", "ВД", "ВОР", "АВК", "КЖ", "ПСИ"] }] },
    { code: "ЭС", name: "ЭС", works: [{ code: "Монтаж щитов", name: "Монтаж щитов", docs: ["АОСР", "РИМ", "ВД", "ВОР", "АВК"] }] },
  ],
};

const tpl = (docs: UT["docs"]): UT => UserTemplate.parse({ id: "t-00000000-0000-4000-8000-000000000000", name: "Т", docs, print: {} });
type CustomDoc = Extract<UT["docs"][number], { kind: "custom" }>;
const custom = (t: UT, code: string): CustomDoc => t.docs.find((d) => d.kind === "custom" && d.code === code) as CustomDoc;

/** Справочник со своими документами: ПИК (скан, на акт), СЭЛ (скан, на комплект), ФОР (своя форма), АОСР (встроенный). */
const cat: Catalog = {
  version: "test",
  docs: [
    { code: "АОСР", name: "Акт освидетельствования скрытых работ", clause344: 1, source: "", make: "builtin", builtin: "aosr", scope: "act" },
    { code: "ПИК", name: "Протокол испытания кабеля", clause344: 7, source: "", make: "scan", scope: "act" },
    { code: "СЭЛ", name: "Список электролаборатории", clause344: 9, source: "", make: "scan", scope: "kit" },
    { code: "ФОР", name: "Форма освидетельствования", clause344: 1, source: "", make: "form", scope: "act" },
  ],
  sections: [
    { code: "ЭМ", name: "ЭМ", works: [{ code: "w1", name: "w1", docs: ["АОСР", "ПИК", "ФОР"] }] },
    { code: "ЭС", name: "ЭС", works: [{ code: "w2", name: "w2", docs: ["АОСР", "СЭЛ"] }] },
  ],
};

test("addWork: документы двух видов без дублей, АОСР один с двумя видами", () => {
  let t = tpl([]);
  t = addWork(t, BUILTIN_CATALOG, "Прокладка КЛ");
  assert.equal(t.docs.length, 7);
  t = addWork(t, BUILTIN_CATALOG, "Монтаж щитов");
  assert.equal(t.docs.length, 7);
  const aosr = t.docs.find((d) => d.kind === "builtin" && d.doc === "aosr")!;
  assert.deepEqual(aosr.works, ["Прокладка КЛ", "Монтаж щитов"]);
  assert.deepEqual(aosr.catalog, "АОСР");
});

test("addWork: повторный вызов того же вида ничего не меняет", () => {
  const a = addWork(tpl([]), BUILTIN_CATALOG, "Прокладка КЛ");
  assert.deepEqual(addWork(a, BUILTIN_CATALOG, "Прокладка КЛ"), a);
});

test("addWork: скан и своя форма из справочника", () => {
  const t = addWork(addWork(tpl([]), cat, "w2"), cat, "w1");
  const pik = custom(t, "ПИК");
  assert.equal(pik.scan, true);
  assert.equal(pik.scope, "act");
  assert.equal(pik.form, null);
  assert.deepEqual(pik.works, ["w1"]);
  const sel = custom(t, "СЭЛ");
  assert.equal(sel.scan, true);
  assert.equal(sel.scope, "kit");
  assert.deepEqual(sel.works, ["w2"]);
  const forr = custom(t, "ФОР");
  assert.equal(forr.scan, false);
  assert.equal(forr.scope, "act");
  assert.equal(t.docs.find((d) => d.kind === "builtin" && d.doc === "aosr")!.works!.length, 2);
});

test("addWork: встроенный АОСР уже был в шаблоне — дописывается вид работ, без дубля", () => {
  let t = tpl([{ kind: "builtin", doc: "aosr", form: null }]);
  t = addWork(t, BUILTIN_CATALOG, "Прокладка КЛ");
  assert.equal(t.docs.filter((d) => d.kind === "builtin" && d.doc === "aosr").length, 1);
  assert.deepEqual(t.docs.find((d) => d.kind === "builtin")!.works, ["Прокладка КЛ"]);
  assert.equal(t.docs.length, 7);
});

test("removeWork: убирает только документы без оставшихся видов работ", () => {
  let t = addWork(tpl([]), BUILTIN_CATALOG, "Прокладка КЛ");
  t = addWork(t, BUILTIN_CATALOG, "Монтаж щитов");
  const r1 = removeWork(t, "Монтаж щитов");
  assert.equal(r1.template.docs.length, 7);
  assert.deepEqual(r1.removed, []);
  const aosr = r1.template.docs.find((d) => d.kind === "builtin" && d.doc === "aosr")!;
  assert.deepEqual(aosr.works, ["Прокладка КЛ"]);
  const r2 = removeWork(r1.template, "Прокладка КЛ");
  assert.equal(r2.template.docs.length, 0);
  assert.equal(r2.removed.length, 7);
});

test("removeWork: ручной свой документ без catalog не трогает", () => {
  let t = tpl([{ kind: "custom", code: "АГИ", name: "Акт гидр. испытаний", form: null }]);
  t = addWork(t, cat, "w1");
  const r = removeWork(t, "w1");
  assert.equal(r.template.docs.length, 1);
  assert.deepEqual(custom(r.template, "АГИ").code, "АГИ");
  assert.equal(r.removed.length, 3); // АОСР, ПИК и ФОР ушли
});

test("templateWorks: список видов работ шаблона", () => {
  let t = tpl([]);
  t = addWork(t, cat, "w1");
  t = addWork(t, cat, "w2");
  assert.deepEqual(templateWorks(t), ["w1", "w2"]);
});

test("шаблон плана 11 (без новых полей) парсится", () => {
  const t = UserTemplate.parse({
    id: "t-00000000-0000-4000-8000-000000000000", name: "Старый",
    docs: [
      { kind: "builtin", doc: "aosr", form: null },
      { kind: "custom", code: "АГИ", name: "Акт", form: null },
    ],
    print: { schemeEach: false },
  });
  assert.equal(t.docs.length, 2);
  assert.equal(t.docs[0].works, undefined);
  assert.deepEqual(templateWorks(t), []);
});
