import { test } from "node:test";
import assert from "node:assert/strict";
import { searchOptions } from "@idk/addin/panel/card/search";

const M = ["Кабель ВВГнг(А)-LS 3х2,5", "Кабель КВВГЭнг(А)-LS 4х1,5", "Труба гофрированная ПНД 20", "Гофра ПВХ 16", "Лоток перфорированный 100х50"];

test("поиск материала: слова в любом порядке, регистр, «х»/«x», «,»/«.»", () => {
  assert.deepEqual(searchOptions(M, "ввг 3x2.5"), ["Кабель ВВГнг(А)-LS 3х2,5"]);
  assert.deepEqual(searchOptions(M, "гоф"), ["Гофра ПВХ 16", "Труба гофрированная ПНД 20"], "начинающиеся с запроса — первыми");
  assert.deepEqual(searchOptions(M, "  "), M);
  assert.deepEqual(searchOptions(M, "нет такого"), []);
  assert.equal(searchOptions(Array.from({ length: 80 }, (_, i) => `М${i}`), "м").length, 50);
});
