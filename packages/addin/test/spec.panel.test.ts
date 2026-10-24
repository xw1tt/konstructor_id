// План 10: панель — тексты спецификации.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffText, positionLines, matchLine } from "@idk/addin/panel/spec";
import type { SpecPosition } from "@idk/shared/spec/closed";

const it = (n: string) => ({ number: n, section: "", name: n, unit: "шт.", quantity: 1 });

test("итог предпросмотра загрузки", () => {
  assert.equal(diffText({ added: [it("1"), it("2"), it("3")], changed: [{ number: "4", fields: ["Кол-во по проекту"] }], missing: ["1.2"], same: 10 }),
    "Новых позиций: 3. Изменено: 1. Нет в РКЦ: 1 (1.2). Без изменений: 10.");
  assert.equal(diffText({ added: [], changed: [], missing: [], same: 5 }), "Новых позиций: 0. Изменено: 0. Нет в РКЦ: 0. Без изменений: 5.");
});

test("строки карточки позиции", () => {
  const p: SpecPosition = { number: "1.1", section: "", name: "Кабель", unit: "м", quantity: 100, closed: 50, rest: 50,
    byAct: [{ act: "А1", date: "2026-10-01", qty: 30 }, { act: "А2", date: null, qty: 20 }], materials: ["Кабель"] };
  assert.deepEqual(positionLines(p), ["По проекту: 100 м", "Закрыто: 50 м", "Остаток: 50 м", "Акт №А1 — 30", "Акт №А2 — 20", "Материалы: Кабель"]);
  assert.deepEqual(positionLines({ ...p, unit: "шт.", quantity: 5, closed: 7, rest: -2, byAct: [], materials: [] }),
    ["По проекту: 5 шт.", "Закрыто: 7 шт.", "Остаток: −2 шт. — закрыто больше, чем по проекту", "Материалы не привязаны"]);
  assert.equal(positionLines({ ...p, quantity: 187.5, closed: 0.25, rest: 187.25 })[2], "Остаток: 187,25 м");
});

test("строка подбора", () => {
  assert.equal(matchLine({ materialRow: 0, material: "Кабель 3х1,5", number: "1.1.6.13", name: "Кабель силовой 3x1.5", score: 87, checked: true }),
    "Кабель 3х1,5 → 1.1.6.13 · Кабель силовой 3x1.5 · 87 %");
});
