// План 12, задача 1: модель справочника и его проверка.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_CATALOG } from "@idk/shared/catalog/builtin";
import { checkCatalog, type Catalog } from "@idk/shared/catalog/model";

/** Глубокая копия для «испорченных» вариантов справочника. */
const copy = (): Catalog => structuredClone(BUILTIN_CATALOG);

test("встроенный справочник: 5 разделов ЭМ/ЭС/СС/АВТ/ПС, в каждом виды работ", () => {
  assert.deepEqual(BUILTIN_CATALOG.sections.map((s) => s.code), ["ЭМ", "ЭС", "СС", "АВТ", "ПС"]);
  for (const s of BUILTIN_CATALOG.sections) assert.ok(s.works.length >= 1, s.code);
});

test("встроенный справочник v1: коды своих документов годятся для шаблона, у каждого — источник, все документы используются", () => {
  const used = new Set(BUILTIN_CATALOG.sections.flatMap((s) => s.works.flatMap((w) => w.docs)));
  for (const d of BUILTIN_CATALOG.docs) {
    assert.ok(used.has(d.code), `документ «${d.code}» не нужен ни одному виду работ`);
    if (d.make === "builtin") continue;
    assert.match(d.code, /^[A-Za-zА-Яа-яЁё0-9]{1,10}$/, d.code);
    assert.ok(!["АОСР", "РИМ", "ВД", "ВОР", "АВК", "КЖ", "ИП"].includes(d.code.toUpperCase()), d.code);
    assert.ok(d.source.trim().length > 0, `нет источника у «${d.code}»`);
  }
  const kl = BUILTIN_CATALOG.sections[0].works.find((w) => w.code === "ЭМ.КЛ")!;
  assert.deepEqual(kl.docs, ["АОСР", "РИМ", "ВД", "АВК", "КЖ", "ПСИ", "ПОКБ", "ПКЛ"]);
  assert.ok(!BUILTIN_CATALOG.docs.some((d) => d.code === "ВОР"), "ВОР в 344/пр не назван — не в справочнике");
});

test("встроенный справочник: документы конструктора с видами печати", () => {
  const docs = BUILTIN_CATALOG.docs.filter((d) => d.make === "builtin");
  assert.deepEqual(docs.map((d) => [d.code, d.builtin]),
    [["АОСР", "aosr"], ["РИМ", "rim"], ["ВД", "vd"], ["АВК", "avk"], ["КЖ", "kj"], ["ПСИ", "ip"]]);
  for (const d of docs) assert.ok(d.name.length > 0, d.code);
});

test("встроенный справочник проходит проверку без ошибок", () => {
  assert.deepEqual(checkCatalog(BUILTIN_CATALOG), []);
});

test("проверка: повтор кода документа", () => {
  const c = copy();
  c.docs.push({ ...structuredClone(c.docs[0]) });
  assert.deepEqual(checkCatalog(c), ["Повтор кода документа «АОСР»"]);
});

test("проверка: пункт 344/пр вне 1–13", () => {
  const c = copy();
  c.docs[0].clause344 = 14;
  assert.deepEqual(checkCatalog(c), ["Пункт 344/пр документа «АОСР» — 1–13"]);
  const c2 = copy();
  c2.docs[0].clause344 = 0;
  assert.deepEqual(checkCatalog(c2), ["Пункт 344/пр документа «АОСР» — 1–13"]);
});

test("проверка: вид работ ссылается на неизвестный документ", () => {
  const c = copy();
  c.sections[0].works[0].docs.push("НЕТ");
  assert.deepEqual(checkCatalog(c), ["Вид работ «ЭМ.КЛ» ссылается на неизвестный документ «НЕТ»"]);
});

test("проверка: make=builtin без вида печати", () => {
  const c = copy();
  c.docs[0].builtin = undefined;
  assert.deepEqual(checkCatalog(c), ["Документ «АОСР»: make=builtin без вида печати"]);
});

test("проверка: повтор кода вида работ", () => {
  const c = copy();
  c.sections[1].works.push(structuredClone(c.sections[0].works[0]));
  assert.deepEqual(checkCatalog(c), ["Повтор кода вида работ «ЭМ.КЛ»"]);
});
