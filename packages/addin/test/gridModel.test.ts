import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTsv, toTsv, pasteEdits } from "../src/panel/grid/gridModel.ts";

test("parseTsv: табы, строки и кавычки", () => {
  assert.deepEqual(parseTsv("a\tb\r\nc\td\r\n"), [
    ["a", "b"],
    ["c", "d"],
  ]);
  assert.deepEqual(parseTsv('"x\ny"\tz'), [["x\ny", "z"]]);
  assert.equal(toTsv([["a", "b"]]), "a\tb");
});

test("pasteEdits: блок со смещением, одно значение — на выделение", () => {
  const cols = [{ key: "a" }, { key: "b" }, { key: "c" }] as never;
  const e = pasteEdits(
    [
      ["1", "2"],
      ["3", "4"],
    ],
    { r: 5, c: 1 },
    cols,
    null as never,
  );
  assert.ok(e.some((x) => x.r === 5 && x.c === 1 && x.text === "1"));
  assert.ok(e.some((x) => x.r === 6 && x.c === 2 && x.text === "4"));
});
