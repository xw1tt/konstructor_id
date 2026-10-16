import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildCableBundle } from "@idk/shared/workbook/cables";
import { journalLines, journalSheets, journalSigners, monthYear, protocolRows, JOURNAL_LINES_PER_SHEET } from "@idk/shared/acts/cableDocs";
import type { CableRow } from "@idk/shared/workbook/cableTypes";
import { aov1Book, AOV1 } from "./fixtures/aov1Book.ts";

const bundle = async (kind: "kj" | "ip") => buildCableBundle(await readBook(aov1Book()), AOV1, defaultImportant(), kind).bundle!;
const MARK = "СегментКИ-485-ПсЭнг(А)-HF  1х2х0,78-300 В";

test("журнал АОВ1: 25 кабелей + ИТОГО = 26 строк, один лист", async () => {
  const lines = journalLines((await bundle("kj")).cables!.rows);
  assert.equal(lines.filter((l) => l.kind === "cable").length, 25);
  assert.equal(lines.length, 26);
  assert.deepEqual(lines.at(-1), { kind: "total", label: "ИТОГО", mark: MARK, length: "1618,9" });
  assert.equal(journalSheets(lines).length, 1);
  assert.equal(JOURNAL_LINES_PER_SHEET, 30);
});

test("30 строк — один лист, 31 — два", async () => {
  const c0 = (await bundle("kj")).cables!.rows[0];
  const mk = (n: number): CableRow[] => Array.from({ length: n }, (_, i) => ({ ...c0, designation: `К${i}` }));
  assert.equal(journalSheets(journalLines(mk(29))).length, 1);
  const two = journalSheets(journalLines(mk(30)));
  assert.equal(two.length, 2);
  assert.equal(two[0].length, 30);
  assert.equal(two[1].length, 1);
  assert.equal(journalSheets([]).length, 1);
});

test("две марки — ИТОГО по каждой и Всего; трубы; заголовки групп", () => {
  const r = (designation: string, cableMark: string, cableLength: number, group = "", pipeMark = "", pipeLength: number | null = null): CableRow =>
    ({ group, designation, from: "", to: "", direction: "", cableMark, cableLength, pipeMark, pipeLength, note: "" });
  const lines = journalLines([r("1", "А", 10.5, "Этаж П1"), r("2", "Б", 5, "Этаж П1", "Труба 20", 3), r("3", "А", 1, "Этаж П2")]);
  assert.deepEqual(lines.map((l) => l.kind === "group" ? `г:${l.title}` : l.kind === "cable" ? `к:${l.row.designation}` : `${l.label}:${l.mark}:${l.length}${l.pipe ? ":т" : ""}`),
    ["г:Этаж П1", "к:1", "к:2", "г:Этаж П2", "к:3", "ИТОГО:А:11,5", "ИТОГО:Б:5", "Всего::16,5", "ИТОГО:Труба 20:3:т"]);
});

test("подписи штампа АОВ1: Востров, Королев, Валерьянов; дата 06.26", async () => {
  const b = await bundle("kj");
  const s = journalSigners(b.representatives, b.organizations, b.act.date);
  assert.deepEqual(s.map((x) => x.name), ["Востров В.П.", "Королев Д.М.", "Валерьянов А.А."]);
  assert.equal(s[0].org, 'ООО "ТехноИнжиниринг"');
  assert.equal(s[0].position, "Начальник участка");
  assert.equal(monthYear("2026-06-30"), "06.26");
  assert.equal(monthYear(null), "");
});

test("строки протокола АОВ1", async () => {
  const c = (await bundle("ip")).cables!;
  const rows = protocolRows(c.rows, c.marks);
  assert.equal(rows.length, 25);
  assert.deepEqual(rows[0], { n: 1, line: "П2.Щ-АК2-17; RS-485", mark: MARK, voltage: "500", allowed: "0,5",
    values: [">1000", "—", "—", "—", "—", "—", "—", "—", "—", "—"] });
  const noPurpose = protocolRows(c.rows.slice(0, 1), [{ ...c.marks[0], purpose: "" }]);
  assert.equal(noPurpose[0].line, "П2.Щ-АК2-17");
});
