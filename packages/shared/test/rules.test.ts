import { test } from "node:test";
import assert from "node:assert/strict";
import { orgFullForm, activeRepresentatives } from "@idk/shared/rules";
import { OrganizationInput, type Organization, type Representative } from "@idk/shared/schemas";

const sbd: Organization = {
  id: 1,
  shortName: 'ООО "СБД"',
  fullName: 'Общество с ограниченной ответственностью "СБД"',
  ogrn: "1197746498916",
  inn: "7736323532",
  address: "125284, г. Москва, ул. Ленинградский просп., д. 31А, стр. 1, этаж 27, пом. I, ком. 10",
  phone: "+7 (495) 685-92-30",
  sroName: 'Ассоциация строителей "Саморегулируемая организация "Строительные допуски"',
  sroOgrn: "1097799011045",
  sroInn: "7714322214",
};

test("orgFullForm: собирает реквизиты", () => {
  assert.equal(
    orgFullForm(sbd),
    'ООО "СБД", ОГРН 1197746498916, ИНН 7736323532, 125284, г. Москва, ул. Ленинградский просп., д. 31А, стр. 1, этаж 27, пом. I, ком. 10, тел. +7 (495) 685-92-30, является членом Ассоциация строителей "Саморегулируемая организация "Строительные допуски", ОГРН 1097799011045, ИНН 7714322214',
  );
});

test("orgFullForm: пустые поля пропускаются вместе с подписью", () => {
  const s = orgFullForm({ ...sbd, phone: "", sroName: "", sroOgrn: "", sroInn: "" });
  assert.ok(!s.includes("тел."));
  assert.ok(!s.includes("является членом"));
  assert.ok(s.endsWith("ком. 10"));
});

const rep = (o: Partial<Representative>): Representative => ({
  id: 1, role: "performer", position: "Начальник участка", fullName: "Востров В.П.", orgId: 1,
  authorityDoc: "", nrsNumber: "", nrsDate: null, validFrom: null, validTo: null, sortOrder: 1, ...o,
});

test("activeRepresentatives: последняя дата включительно", () => {
  const reps = [rep({ validFrom: "2026-01-01", validTo: "2026-07-31" })];
  assert.equal(activeRepresentatives(reps, "performer", "2026-07-31").length, 1);
  assert.equal(activeRepresentatives(reps, "performer", "2026-08-01").length, 0);
});

test("activeRepresentatives: null = без ограничения", () => {
  assert.equal(activeRepresentatives([rep({})], "performer", "1999-01-01").length, 1);
  assert.equal(activeRepresentatives([rep({})], "builder", "2026-01-01").length, 0);
});

test("activeRepresentatives: несколько в роли — по sortOrder", () => {
  const reps = [
    rep({ id: 2, fullName: "Востров В.П.", sortOrder: 2 }),
    rep({ id: 1, fullName: "Королёв А.А.", sortOrder: 1 }),
  ];
  assert.deepEqual(activeRepresentatives(reps, "performer", "2026-07-28").map((r) => r.fullName), [
    "Королёв А.А.", "Востров В.П.",
  ]);
});

test("schemas: OrganizationInput без shortName отклоняется", () => {
  const r = OrganizationInput.safeParse({ fullName: "x" });
  assert.equal(r.success, false);
});
