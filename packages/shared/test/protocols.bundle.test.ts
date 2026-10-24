// План 13, задача 3: пакет документа из книги — шапка, строки, лаборатория или комиссия, проверка.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildProtoBundle } from "@idk/shared/protocols/bundle";
import { findHeader } from "@idk/shared/protocols/find";
import { ActBundle } from "@idk/shared/workbook/bundle";
import { protoBook, AOV1 } from "./fixtures/protoBook.ts";

const build = async (number: string, patch?: Parameters<typeof protoBook>[0]) =>
  buildProtoBundle(await readBook(protoBook(patch)), number, defaultImportant());
const msgs = (r: { issues: { table: string; column: string; message: string }[] }) => r.issues.map((i) => `${i.table} | ${i.column} | ${i.message}`);

test("ПАВ на комплект: пакет первого акта комплекта, строки с результатом, лаборатория и приборы", async () => {
  const r = await build("ПАВ-1");
  assert.deepEqual(r.issues, []);
  const b = r.bundle!;
  assert.ok(ActBundle.safeParse(b).success);
  assert.equal(b.act.baseNumber, AOV1);
  const p = b.proto!;
  assert.equal(p.kind, "pav");
  assert.equal(p.number, "ПАВ-1");
  assert.equal(p.dateFrom, "2026-07-15");
  assert.equal(p.subject, "Щит ЩР-1");
  assert.equal(p.normative, "ПУЭ, п. 1.8.37 (3)", "нормативы по умолчанию — источник справочника");
  assert.equal(p.conclusion, "Результаты измерений соответствуют требованиям ПУЭ, п. 1.8.37 (3).");
  assert.equal(p.temperature, "20");
  assert.equal(p.purpose, "приемо-сдаточные");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], {
    board: "ЩР-1", line: "QF1", type: "ВА47-29 C16", rated: "16", testCurrent: "", tripNorm: "0,01–0,1", tripFact: "0,02", result: "соответствует",
  });
  assert.ok(p.lab && p.lab.head);
  assert.ok(p.instruments.length > 0);
  assert.deepEqual(p.commission, []);
});

test("шапка документа «на комплект» с актом комплекта вместо комплекта — находится и собирается", async () => {
  const book = await readBook(protoBook((r) => {
    r["Протоколы"][0]["Комплект"] = null;
    r["Протоколы"][0]["Акт"] = AOV1;
  }));
  assert.equal(findHeader(book, "ПАВ", { kit: "1" })?.v.number, "ПАВ-1");
  assert.equal(findHeader(book, "пав", { kit: "1" })?.v.number, "ПАВ-1", "код без учёта регистра");
  assert.equal(findHeader(book, "ПКЛ", { act: AOV1 })?.v.number, "ПКЛ-1");
  assert.equal(findHeader(book, "ПКЛ", { act: "другой" }), undefined);
  assert.deepEqual(buildProtoBundle(book, "ПАВ-1", defaultImportant()).issues, []);
});

test("нет результата и нормы — «Не заполнено»; «не соответствует» без заключения — ошибка шапки", async () => {
  const r = await build("ПАВ-1", (x) => {
    x["ЗамерыАвтоматов"][0]["Время срабатывания по ТУ, с"] = null;
    x["ЗамерыАвтоматов"][1]["Время срабатывания факт., с"] = 0.5;
  });
  assert.equal(r.bundle, null);
  assert.deepEqual(msgs(r), [
    "ЗамерыАвтоматов | Результат | Не заполнено",
    "Протоколы | Заключение | Есть строки «не соответствует» — впишите заключение",
  ]);
  const ok = await build("ПАВ-1", (x) => {
    x["ЗамерыАвтоматов"][1]["Время срабатывания факт., с"] = 0.5;
    x["Протоколы"][0]["Заключение"] = "QF2 подлежит замене.";
  });
  assert.deepEqual(ok.issues, []);
  assert.equal(ok.bundle!.proto!.rows[1].result, "не соответствует");
  assert.equal(ok.bundle!.proto!.conclusion, "QF2 подлежит замене.");
});

test("документ без строк — ошибка; внесённый результат печатается как есть", async () => {
  const r = await build("ПАВ-1", (x) => { x["ЗамерыАвтоматов"] = []; });
  assert.deepEqual(msgs(r), ["ЗамерыАвтоматов | № документа | Нет строк документа «ПАВ-1»"]);
  const p = (await build("ПКЛ-1")).bundle!.proto!;
  assert.equal(p.rows[0].result, "выдержала");
  assert.equal(p.rows[0].duration, "10", "значение по умолчанию столбца");
});

test("АИИ без перечня — перечень из «Материалов в актах» комплекта, одинаковые суммируются; комиссия по ролям", async () => {
  const r = await build("АИИ-1", (x) => {
    const first = x["МатериалыАктов"][0];
    x["МатериалыАктов"][0] = { ...first, "Кол-во": 3 };
    x["МатериалыАктов"].push({ ...first, "Кол-во": 2 });
  });
  assert.deepEqual(r.issues, []);
  const p = r.bundle!.proto!;
  assert.equal(p.signer, "commission");
  const first = p.rows[0];
  assert.equal(first.qty, "5");
  assert.ok(first.name.length > 0 && first.unit.length > 0);
  assert.equal(new Set(p.rows.map((x) => x.name)).size, p.rows.length, "без повторов");
  assert.deepEqual(p.commission.map((m) => m.role), [
    "Технадзор застройщика", "Лицо, осуществляющее строительство", "Выполнивший работы", "Выполнивший работы", "Проектировщик",
  ]);
  assert.deepEqual(p.commission[0], {
    role: "Технадзор застройщика", position: "Ведущий инженер по автоматике и слаботочным системам", org: 'ООО "СБД"', name: "Валерьянов А.А.",
  });
  assert.equal(p.city, "Москва");
  assert.equal(p.lab, null);
});

test("строки перечня внесены — печатаются они, а не материалы", async () => {
  const p = (await build("АИИ-1", (x) => {
    x["ПереченьОборудования"] = [{ "№ документа": "АИИ-1", "Наименование оборудования, системы": "Щит ЩР-1", "Кол-во": 1, "Ед. изм.": "шт." }];
  })).bundle!.proto!;
  assert.deepEqual(p.rows, [{ name: "Щит ЩР-1", type: "", unit: "шт.", qty: "1", note: "" }]);
});

test("нет представителей ролей документа — ошибка комиссии", async () => {
  const r = await build("АИИ-1", (x) => { for (const p of x["Представители"]) p["Роль"] = "Иные представители"; });
  assert.ok(msgs(r).includes("Представители | Роль | Представители: нет членов комиссии для АИИ"), msgs(r).join("\n"));
  const ok = await build("АИИ-1", (x) => { x["Представители"] = x["Представители"].filter((p) => p["Роль"] !== "Проектировщик"); });
  assert.deepEqual(ok.issues, [], "одной роли нет — остальные подписывают");
});

test("документ «на акт» без акта, «на комплект» без комплекта и акта, неизвестный номер", async () => {
  const noAct = await build("ПКЛ-1", (x) => { x["Протоколы"][1]["Акт"] = null; });
  assert.deepEqual(msgs(noAct), ["Протоколы | Акт | Не заполнено"]);
  const noKit = await build("ПАВ-1", (x) => { x["Протоколы"][0]["Комплект"] = null; });
  assert.deepEqual(msgs(noKit), ["Протоколы | Комплект | Укажите комплект или акт комплекта"]);
  const none = await build("ПАВ-9");
  assert.deepEqual(msgs(none), ["Протоколы | № документа | Документ «ПАВ-9» не найден в таблице «Протоколы»"]);
});

test("книга без таблицы «Протоколы» (v8) — понятная ошибка", async () => {
  const book = await readBook(protoBook());
  delete book.tables["Протоколы"];
  book.missing.push("Протоколы");
  assert.deepEqual(msgs(buildProtoBundle(book, "ПАВ-1", defaultImportant())),
    ["Протоколы | № документа | В книге нет таблицы «Протоколы» — нажмите «Обновить разметку»"]);
});

test("лабораторный документ без электролаборатории и приборов — ошибки как у протокола изоляции", async () => {
  const r = await build("ПАВ-1", (x) => { x["Электролаборатория"] = []; x["СредстваИзмерений"] = []; });
  assert.deepEqual(msgs(r), [
    "Электролаборатория | Организация и адрес | Заполните таблицу «Электролаборатория»",
    "СредстваИзмерений | Наименование СИ | Заполните таблицу «СредстваИзмерений»",
  ]);
});
