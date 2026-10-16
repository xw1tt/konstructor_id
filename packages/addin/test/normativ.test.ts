import { test } from "node:test";
import assert from "node:assert/strict";
import { portalDialogUrl } from "@idk/addin/panel/portal";

test("адрес окна портала", () => {
  assert.equal(portalDialogUrl("https://localhost:3443", "https://protect.gost.ru/sp?search=СП 1"),
    "https://localhost:3443/addin/portal.html?to=" + encodeURIComponent("https://protect.gost.ru/sp?search=СП 1"));
});

import { normsQuery, cellAppend, refreshText } from "@idk/addin/panel/normsApi";

test("адрес запроса справочника", () => {
  assert.equal(normsQuery({ section: null, q: "", offset: 0 }), "/api/norms?offset=0&limit=100");
  assert.equal(normsQuery({ section: "sp", q: "огнест", offset: 100 }),
    "/api/norms?section=sp&q=" + encodeURIComponent("огнест") + "&offset=100&limit=100");
  assert.equal(normsQuery({ section: null, q: "  ", offset: 0 }), "/api/norms?offset=0&limit=100");
});

test("В ячейку", () => {
  assert.deepEqual(cellAppend(null, "СП 1"), { value: "СП 1" });
  assert.deepEqual(cellAppend("", "СП 1"), { value: "СП 1" });
  assert.deepEqual(cellAppend(46231, "СП 1"), { value: "46231, СП 1" });
  assert.deepEqual(cellAppend("ПУЭ.", "СП 1"), { value: "ПУЭ, СП 1." });
  assert.deepEqual(cellAppend("СП 1, ПУЭ", "сп 1"), { error: "Уже есть в ячейке" });
});

test("ход обновления", () => {
  assert.equal(refreshText({ running: true, section: "sp", page: 12, pages: 38, error: null, finishedAt: null }), "Обновляю: СП, страница 12 из 38");
  assert.equal(refreshText({ running: true, section: "gost", page: 3, pages: null, error: null, finishedAt: null }), "Обновляю: ГОСТ, страница 3");
  assert.equal(refreshText({ running: false, section: null, page: 0, pages: null, error: "Нет связи с порталом protect.gost.ru", finishedAt: "x" }),
    "Нет связи с порталом protect.gost.ru");
  assert.equal(refreshText({ running: false, section: null, page: 0, pages: null, error: null, finishedAt: "x" }), "");
});

import { docsCount } from "@idk/addin/panel/normsApi";
test("число документов по-русски", () => {
  assert.deepEqual([1, 3, 5, 11, 21, 4999].map(docsCount), ["1 документ", "3 документа", "5 документов", "11 документов", "21 документ", "4999 документов"]);
});

import { latestOnly } from "@idk/addin/panel/normsApi";
test("ревью: ответ на устаревший запрос отбрасывается, новый запрос не теряется", async () => {
  const seq = latestOnly();
  let release!: (v: string) => void;
  const slow = seq.run(new Promise<string>((r) => (release = r)));
  const fast = seq.run(Promise.resolve("новый"));
  assert.equal(await fast, "новый");
  release("старый");
  assert.equal(await slow, undefined);
});
