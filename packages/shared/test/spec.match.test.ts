// План 10: подбор № п/п РКЦ для материалов по сходству наименований.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { normalizeName, matchSpec, applyMatches } from "@idk/shared/spec/match";

const SPEC = [
  { "№ п/п": "1.1.6.13", "Наименование": "Кабель силовой, не распространяющий горение, безгалогеный, -50...+50 С ППГнг(А)-НF 3x1.5", "Источник": "РКЦ" },
  { "№ п/п": "1.1.6.13.1", "Наименование": "Кабель силовой, не распространяющий горение, безгалогеный, -50...+50 С ППГнг(А)-НF 3x2.5", "Источник": "РКЦ" },
  { "№ п/п": "1.1.1.1", "Наименование": "Термостат защиты от замораживания накладной, 5...65С", "Источник": "РКЦ" },
];
const MATS = [
  { "Наименование": "Кабель силовой ППГнг(А)-HF 3х1,5", "Марка": "ППГнг(А)-HF 3х1,5", "Ед. изм.": "м" },
  { "Наименование": "Термостат накладной", "Ед. изм.": "шт." },
  { "Наименование": "Огнезащитная пена", "Ед. изм.": "шт." },
  { "Наименование": "Кабель силовой ППГнг(А)-HF 3х2,5", "Ед. изм.": "м", "№ п/п РКЦ": "1.1.6.13.1" },
];
const wb = () => new MemoryWorkbook({ "Спецификация": SPEC, "Материалы": MATS });

test("нормализация: кириллица/латиница, х/x, запятая", () => {
  assert.equal(normalizeName("ППГнг(А)-НF 3х1,5"), normalizeName("ппгнг(a)-hf 3x1.5"));
  assert.equal(normalizeName("  Ёлка  «А»  "), normalizeName("елка a"));
});

test("лучшее совпадение: токены с цифрами решают", async () => {
  const m = matchSpec(await readBook(wb()));
  const cable = m.find((x) => x.material === "Кабель силовой ППГнг(А)-HF 3х1,5")!;
  assert.equal(cable.number, "1.1.6.13");
  assert.equal(cable.checked, true);
  assert.equal(cable.materialRow, 0);
  const t = m.find((x) => x.material === "Термостат накладной")!;
  assert.equal(t.number, "1.1.1.1");
  assert.ok(t.score >= 50 && t.score < 100, String(t.score));
  assert.ok(!m.some((x) => x.material === "Огнезащитная пена"));
  assert.ok(!m.some((x) => x.material.endsWith("3х2,5")), "уже с номером — не подбирается");
  assert.deepEqual(m.map((x) => x.score), [...m.map((x) => x.score)].sort((a, b) => b - a));
});

test("пустая спецификация — пустой подбор", async () => {
  assert.deepEqual(matchSpec(await readBook(new MemoryWorkbook({ "Материалы": MATS }))), []);
});

test("applyMatches пишет только отмеченные", async () => {
  const w = wb();
  const m = matchSpec(await readBook(w)).map((x) => ({ ...x, checked: x.number === "1.1.6.13" }));
  assert.equal(await applyMatches(w, m), 1);
  const rows = (await readBook(w)).tables["Материалы"]!;
  assert.equal(rows[0].v.rkc, "1.1.6.13");
  assert.equal(rows[1].v.rkc, null);
});
