// План 14, задача 4: кабельный журнал набора «ТИ» — длины, итоги, запас; пакет без шифра журнала и № протокола.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tiJournal } from "@idk/shared/acts/cableDocs";
import { CableRow } from "@idk/shared/workbook/cableTypes";
import { buildCableBundle } from "@idk/shared/workbook/cables";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

const row = (p: Partial<CableRow>) => CableRow.parse({ designation: "N-1", cableMark: "КСПЭВПнг(А)-HF 2х2х0.97", ...p });

test("факт = сумма способов прокладки; частично заполнено — сумма заполненных; пусто — длина кабеля", () => {
  const j = tiJournal([
    row({ tray: 0, smoothPipe: 9, corrugatedPipe: 5, projectLength: 15 }),
    row({ smoothPipe: 7, cableLength: 99 }),
    row({ cableLength: 12 }),
  ], 2);
  const cables = j.lines.filter((l) => l.kind === "cable");
  assert.deepEqual(cables.map((c) => c.kind === "cable" && [c.project, c.fact, c.tray, c.smooth, c.corrugated]), [
    ["15", "14", "0", "9", "5"], ["-", "7", "", "7", ""], ["-", "12", "", "", ""],
  ]);
});

test("группы, итоги по способам, «в т.ч.» по маркам, запас N % вверх до целого", () => {
  const j = tiJournal([
    row({ group: "2 этаж, отм. +5.400", tray: 0, smoothPipe: 9, corrugatedPipe: 5, projectLength: 15 }),
    row({ group: "2 этаж, отм. +5.400", smoothPipe: 7, corrugatedPipe: 5, projectLength: 10 }),
    row({ group: "3 этаж", cableMark: "UTP 4x2x0.52", tray: 10, smoothPipe: 1 }),
  ], 2);
  assert.deepEqual(j.lines.filter((l) => l.kind === "group").map((l) => l.kind === "group" && l.title), ["2 этаж, отм. +5.400", "3 этаж"]);
  assert.deepEqual(j.total, { tray: "10", smooth: "17", corrugated: "10" });
  assert.deepEqual(j.byMark, [
    { mark: "КСПЭВПнг(А)-HF 2х2х0.97", project: "25", fact: "26", factReserve: "27" },
    { mark: "UTP 4x2x0.52", project: "-", fact: "11", factReserve: "12" },
  ]);
  assert.deepEqual(j.reserve, { pct: "2", fact: "38", tray: "11", smooth: "18", corrugated: "11" }, "37 × 1,02 = 37,74 → 38");
});

test("пакет КЖ и протокола в наборе «ТИ» без строки «ДокументыКабелей»; в «СБД» — ошибка, как раньше", async () => {
  const recs: any = aov1Records();
  recs["ДокументыКабелей"] = [];
  const book = await readBook(new MemoryWorkbook(recs));
  const ti = buildCableBundle(book, AOV1, defaultImportant(), "kj", { set: "ti" });
  assert.deepEqual(ti.issues, []);
  assert.equal(ti.bundle!.cables!.doc, null);
  assert.deepEqual(buildCableBundle(book, AOV1, defaultImportant(), "ip", { set: "ti" }).issues, []);
  const sbd = buildCableBundle(book, AOV1, defaultImportant(), "kj");
  assert.ok(sbd.issues.some((i) => i.table === "ДокументыКабелей"));
});

test("новые столбцы книги попадают в строки пакета", async () => {
  const recs: any = aov1Records();
  recs["КабельныйЖурнал"][0]["Лоток, м"] = 3;
  recs["КабельныйЖурнал"][0]["Длина по проекту, м"] = 20;
  const b = buildCableBundle(await readBook(new MemoryWorkbook(recs)), AOV1, defaultImportant(), "kj", { set: "ti" }).bundle!;
  assert.equal(b.cables!.rows[0].tray, 3);
  assert.equal(b.cables!.rows[0].projectLength, 20);
});
