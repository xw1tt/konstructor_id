// План 11: модель шаблона пользователя.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_SBD, SBD_ID, UserTemplate, validateTemplate, BUILTIN_DOC_LABELS } from "@idk/shared/forms/template";

test("встроенный «СБД»: все встроенные документы по порядку", () => {
  assert.equal(BUILTIN_SBD.id, SBD_ID);
  assert.equal(SBD_ID, "sbd");
  assert.equal(BUILTIN_SBD.name, "СБД");
  assert.deepEqual(BUILTIN_SBD.docs.map((d) => d.kind === "builtin" && d.doc), ["aosr", "rim", "vd", "vor", "avk", "kj", "ip"]);
  assert.deepEqual(BUILTIN_DOC_LABELS, { aosr: "АОСР", rim: "РИМ", vd: "ВД", vor: "ВОР", avk: "АВК", kj: "КЖ", ip: "Протокол" });
  assert.ok(UserTemplate.safeParse(BUILTIN_SBD).success);
});

test("проверка кодов своих документов", () => {
  const t = (codes: string[]) => ({ ...BUILTIN_SBD, id: "t-1", docs: codes.map((code) => ({ kind: "custom" as const, code, name: "Док", form: null })) });
  assert.deepEqual(validateTemplate(t(["АГИ", "агИ"])), ["Код «агИ» уже есть в шаблоне"]);
  assert.deepEqual(validateTemplate(t(["аоср"])), ["Код «аоср» занят встроенным документом"]);
  assert.deepEqual(validateTemplate(t(["А-1"])), ["Код «А-1»: 1–10 букв или цифр"]);
  assert.deepEqual(validateTemplate(t(["АГИ", "ИСП2"])), []);
  assert.deepEqual(validateTemplate({ ...t([]), name: "  " }), ["Укажите имя шаблона"]);
});
