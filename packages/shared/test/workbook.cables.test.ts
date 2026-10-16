import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { exampleRows } from "@idk/shared/workbook/examples";
import { buildCableBundle, collectMarks, markKey } from "@idk/shared/workbook/cables";
import { aov1Book, aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

const book = async (patch: (r: any) => void = () => {}) => {
  const r: any = aov1Records();
  patch(r);
  return readBook(new MemoryWorkbook(r));
};
const msgs = (x: { issues: { message: string }[] }) => x.issues.map((i) => i.message);

test("кабели АОВ1 для журнала и протокола", async () => {
  const { bundle, issues } = buildCableBundle(await readBook(aov1Book()), AOV1, defaultImportant(), "ip");
  assert.deepEqual(issues, []);
  const c = bundle!.cables!;
  assert.equal(c.rows.length, 25);
  assert.equal(c.rows.reduce((a, r) => a + (r.cableLength ?? 0), 0).toFixed(1), "1618.9");
  assert.equal(c.rows[0].designation, "П2.Щ-АК2-17");
  assert.equal(c.doc!.journalCode, "СБД-1436-АОВ1К1");
  assert.equal(c.doc!.journalDate, "2026-06-30");
  assert.equal(c.doc!.normative, "ПУЭ 7 изд. 1.8.37 п.1, таблица 1.8.34");
  assert.equal(c.instruments.length, 2);
  assert.equal(c.instruments[0].checkedOn, "2026-05-15");
  assert.equal(c.lab!.head, "Рябов Е.А.");
  assert.equal(c.marks.length, 1);
  assert.equal(c.marks[0].values[0], ">1000");
});

test("марка с двойным пробелом находит измерения", () => {
  assert.equal(markKey("СегментКИ-485-ПсЭнг(А)-HF  1х2х0,78-300 В "), markKey("СегментКИ-485-ПсЭнг(А)-HF 1х2х0,78-300 В"));
  assert.equal(markKey("ввг 3х2,5"), markKey("ВВГ 3х2,5"));
});

test("длина текстом «48,5» читается, пустая длина не ломает журнал", async () => {
  const b = await book((r) => {
    r["КабельныйЖурнал"][0]["Кабель: длина, м"] = "48,5";
    r["КабельныйЖурнал"][1]["Кабель: длина, м"] = null;
  });
  const imp = defaultImportant();
  imp["КабельныйЖурнал"] = (imp["КабельныйЖурнал"] ?? []).filter((h) => h !== "Кабель: длина, м");
  const { bundle, issues } = buildCableBundle(b, AOV1, imp, "kj");
  assert.deepEqual(issues, []);
  assert.equal(bundle!.cables!.rows[0].cableLength, 48.5);
  assert.equal(bundle!.cables!.rows[1].cableLength, null);
  assert.ok(msgs(buildCableBundle(b, AOV1, defaultImportant(), "kj")).includes("Не заполнено"));
});

test("нет кабелей акта / нет строки документов — сообщения", async () => {
  const noCables = await book((r) => { r["КабельныйЖурнал"] = []; });
  assert.ok(msgs(buildCableBundle(noCables, AOV1, defaultImportant(), "kj")).includes(`В кабельном журнале нет кабелей акта «${AOV1}»`));
  const noDoc = await book((r) => { r["ДокументыКабелей"] = []; });
  const r = buildCableBundle(noDoc, AOV1, defaultImportant(), "kj");
  assert.equal(r.bundle, null);
  assert.ok(msgs(r).includes(`Нет строки акта «${AOV1}» в таблице «ДокументыКабелей»`));
});

test("протокол: марки нет в «ИзмеренияМарок»", async () => {
  const b = await book((r) => { r["ИзмеренияМарок"] = []; });
  const m = msgs(buildCableBundle(b, AOV1, defaultImportant(), "ip"));
  assert.ok(m.includes("Нет в таблице «ИзмеренияМарок»: СегментКИ-485-ПсЭнг(А)-HF  1х2х0,78-300 В"), m.join(" | "));
});

test("протокол без лаборатории и приборов (только примеры) — сообщения", async () => {
  const ex = exampleRows();
  const b = await book((r) => {
    r["Электролаборатория"] = ex["Электролаборатория"];
    r["СредстваИзмерений"] = ex["СредстваИзмерений"];
  });
  const m = msgs(buildCableBundle(b, AOV1, defaultImportant(), "ip"));
  assert.ok(m.includes("Заполните таблицу «Электролаборатория»"));
  assert.ok(m.includes("Заполните таблицу «СредстваИзмерений»"));
});

test("журнал не требует марок, лаборатории и приборов", async () => {
  const b = await book((r) => { r["ИзмеренияМарок"] = []; r["Электролаборатория"] = []; r["СредстваИзмерений"] = []; });
  assert.deepEqual(buildCableBundle(b, AOV1, defaultImportant(), "kj").issues, []);
});

test("Собрать марки из журнала", async () => {
  const r: any = aov1Records();
  r["ИзмеренияМарок"] = [];
  const wb = new MemoryWorkbook(r);
  assert.equal(await collectMarks(wb, await readBook(wb)), 1);
  const t = await wb.read("ИзмеренияМарок");
  assert.equal(t!.rows.length, 1);
  assert.equal(t!.rows[0][2], 500);
  assert.equal(t!.rows[0][3], 0.5);
  assert.equal(await collectMarks(wb, await readBook(wb)), 0);
});

test("ревью: журнал не требует полей протокола в «ДокументыКабелей»", async () => {
  const b = await book((r) => {
    const d = r["ДокументыКабелей"][0];
    d["№ протокола"] = null; d["Измерения с"] = null; d["Измерения по"] = null;
  });
  assert.deepEqual(buildCableBundle(b, AOV1, defaultImportant(), "kj").issues, []);
  const ip = msgs(buildCableBundle(b, AOV1, defaultImportant(), "ip"));
  assert.equal(ip.filter((m) => m === "Не заполнено").length, 3);
});

test("ревью: протокол не требует шифра и даты журнала", async () => {
  const b = await book((r) => { const d = r["ДокументыКабелей"][0]; d["Шифр журнала"] = null; d["Дата журнала"] = null; });
  assert.deepEqual(buildCableBundle(b, AOV1, defaultImportant(), "ip").issues, []);
  assert.equal(msgs(buildCableBundle(b, AOV1, defaultImportant(), "kj")).filter((m) => m === "Не заполнено").length, 2);
});
