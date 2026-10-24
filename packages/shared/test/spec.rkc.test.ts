// План 10: разбор листа РКЦ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRkc, RkcError } from "@idk/shared/spec/rkc";
import { rkcSample } from "./fixtures/rkcSample.ts";

test("позиции, номера, разделы", () => {
  const { items } = parseRkc(rkcSample);
  assert.deepEqual(items.map((i) => i.number), [
    "1.1.1.1", "1.1.1.10", "б/н-1", "1.1.6.2.1", "1.2.3.2.7.2", "1.2.4.4.1", "1.1.2.30", "3.1.", "1.1.1.1-2", "1.1",
  ]);
  assert.equal(items[0].section, "ОСНОВНОЕ ОБОРУДОВАНИЕ");
  assert.equal(items[3].section, "КАБЕЛИ И ПРОВОДА");
  assert.equal(items.find((i) => i.number === "3.1.")!.section, "Корректировка рабочей документации");
  assert.deepEqual(items[0], { number: "1.1.1.1", section: "ОСНОВНОЕ ОБОРУДОВАНИЕ", name: "Термостат защиты от замораживания", unit: "шт.", quantity: 20 });
});

test("количества: запятая, пробелы, пусто; единица обрезана", () => {
  const { items } = parseRkc(rkcSample);
  const q = (n: string) => items.find((i) => i.number === n)!;
  assert.equal(q("1.2.3.2.7.2").quantity, 187.5);
  assert.equal(q("1.2.4.4.1").quantity, 5256);
  assert.equal(q("1.2.4.4.1").unit, "м");
  assert.equal(q("1.1.2.30").quantity, 0);
});

test("предупреждения", () => {
  assert.deepEqual(parseRkc(rkcSample).warnings, [
    "Позиция без №п/п: Датчик температуры воздуха в помещении — присвоен б/н-1",
    "Нет количества: 1.1.2.30 Корпус под кнопочный пост — принято 0",
    "Повтор №п/п 1.1.1.1: Термостат (повтор) — присвоен 1.1.1.1-2",
  ]);
});

test("итоги и нумерация столбцов не попадают в позиции", () => {
  const names = parseRkc(rkcSample).items.map((i) => i.name);
  for (const bad of ["Всего без НДС", "НДС 22 %", "Зачет аванса", "к оплате", "---", "СУДИО А-0000-РД"]) assert.ok(!names.includes(bad), bad);
});

test("номер-число: 2 → «2», 1.1 → «1.1»", () => {
  const head = ["№ п/п", "Наименование", "Ед. изм.", "Кол-во"];
  const { items } = parseRkc([head, [2, "А", "шт", 1], [1.1, "Б", "шт", 1]]);
  assert.deepEqual(items.map((i) => i.number), ["2", "1.1"]);
});

test("нет шапки — RkcError", () => {
  assert.throws(() => parseRkc([["a", "b"]]), (e: unknown) => e instanceof RkcError &&
    e.message === "Не найдена шапка РКЦ: нужны столбцы «№ п/п», «Наименование», «Ед. изм.», «Кол-во»");
});
