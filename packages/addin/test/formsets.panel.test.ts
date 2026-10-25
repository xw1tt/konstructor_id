// План 14, задача 6: выбор набора и форм в редакторе шаблонов; у встроенного шаблона — копия.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_SBD, BUILTIN_TI, type UserTemplate } from "@idk/shared/forms/template";
import { withFormSet, withDocForm, withReserve, applyChange } from "@idk/addin/panel/templatesApi";

const own: UserTemplate = { ...structuredClone(BUILTIN_SBD), id: "t-1", name: "Мой" };

test("набор, форма документа, запас — новый print, остальное как было", () => {
  const a = withFormSet(own, "ti");
  assert.equal(a.print.formSet, "ti");
  assert.equal(own.print.formSet, "sbd", "исходный не меняется");
  const b = withDocForm(a, "kj", "sbd");
  assert.deepEqual(b.print.forms, { kj: "sbd" });
  assert.deepEqual(withDocForm(b, "kj", null).print.forms, {}, "«по набору» убирает свою форму документа");
  assert.equal(withReserve(own, 3).print.kjReserve, 3);
  assert.deepEqual(withReserve(own, 3).docs, own.docs);
});

test("изменение встроенного: копия «<имя> (копия)» с изменением; встроенный не меняется", async () => {
  const calls: string[] = [];
  const api = {
    create: async (name: string, from?: string) => { calls.push(`create ${name} ${from}`); return { ...structuredClone(BUILTIN_TI), id: "t-9", name }; },
    save: async (t: UserTemplate) => { calls.push(`save ${t.id} ${t.print.forms.vd ?? "-"}`); return t; },
  };
  const before = structuredClone(BUILTIN_TI);
  const r = await applyChange(BUILTIN_TI, (t) => withDocForm(t, "vd", "sbd"), api);
  assert.deepEqual(calls, ["create ТИ (копия) ti", "save t-9 sbd"]);
  assert.equal(r.id, "t-9");
  assert.deepEqual(BUILTIN_TI, before);
  calls.length = 0;
  await applyChange(own, (t) => withFormSet(t, "ti"), api);
  assert.deepEqual(calls, ["save t-1 -"], "свой шаблон сохраняется на месте");
});
