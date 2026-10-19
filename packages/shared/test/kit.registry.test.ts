// План 7: «Заполнить из актов» — строки реестра ИД по образцу комплекта «Монтаж кабеля».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { registryRows, fillRegistry, labCertificateParts } from "@idk/shared/kit/registry";
import { AOV1 } from "./fixtures/aov1Book.ts";
import { kitRecords } from "./fixtures/kitBook.ts";

const SECTION = "КУТ03-Р-ПИР-2-26-100-АОВ1.01.00";
const v = (x: { values: Record<string, unknown> }, h: string) => x.values[h];

test("строки комплекта АОВ1 — в порядке образца СБД", async () => {
  const book = await readBook(new MemoryWorkbook(kitRecords()));
  const { rows, issues } = registryRows(book, "1");
  assert.deepEqual(issues, []);
  const kinds = rows.map((r) => v(r, "Вид"));
  assert.deepEqual(kinds.slice(0, 15), ["ВОР", "АОСР", "РИМ", "ВД", "Схема", "Схема", "Схема", "Схема", "Схема", "Схема",
    "КЖ", "Протокол", "Поверка", "Поверка", "Лаборатория"]);
  assert.ok(kinds.slice(15).every((k) => k === "Документ качества"));
  assert.deepEqual([v(rows[0], "Номер документа"), v(rows[0], "Наименование"), v(rows[0], "Дата / период")],
    ["б/н", "Ведомость объемов выполненных работ", "28.07.2026 г."]);
  assert.equal(v(rows[1], "Номер документа"), "№К32.В.СТ.АОВ1.01.00.1.АОСР");
  assert.match(String(v(rows[1], "Наименование")), /^Акт освидетельствования скрытых работ Монтаж кабельных линий на этаже П5/);
  assert.equal(v(rows[2], "Номер документа"), "№К32.В.СТ.АОВ1.01.00.1.РИМ");
  assert.equal(v(rows[3], "Наименование"), "Ведомость смонтированного оборудования, технических средств и материалов");
  assert.deepEqual([v(rows[4], "Номер документа"), v(rows[4], "Наименование"), v(rows[4], "Дата / период")],
    ["№К32.В.СТ.АОВ1.01.00.1", "Исполнительная схема Монтаж кабельных линий на этаже П5 в осях 27-13/У-К", "06.06.2026 г."]);
  assert.deepEqual([v(rows[10], "Номер документа"), v(rows[10], "Наименование")], ["№ СБД-1436-АОВ1К1", "Кабельный журнал"]);
  assert.equal(v(rows[11], "Номер документа"), "№1");
  assert.equal(v(rows[11], "Наименование"), "Протокол проверки сопротивления изоляции проводов, кабелей и обмоток электрических машин");
  assert.match(String(v(rows[11], "Дата / период")), /^от \d\d\.\d\d\.2026 г\. до \d\d\.\d\d\.2026 г\.$/);
  assert.deepEqual([v(rows[12], "Номер документа"), v(rows[12], "Наименование"), v(rows[12], "Дата / период")],
    ["№С-АМ/01-04-2024/328195310", "Свидетельство о поверке: Измеритель параметров электроустановок Ml3102Н CL", "от 15.05.2026 г. до 14.05.2028 г."]);
  assert.deepEqual([v(rows[14], "Номер документа"), v(rows[14], "Дата / период")], ["№9305", "от 28.07.2023 г."]);
  assert.deepEqual([v(rows[15], "Номер документа"), v(rows[15], "Наименование"), v(rows[15], "Дата / период")],
    ["№3/405", "Паспорт качества: Кабель СегментКИ-485-ПсЭнг(А)-HF 1х2х0,78-300 В", "09.05.2025 г."]);
  assert.match(String(v(rows[16], "Наименование")), /^Сертификат соответствия: Кабель СегментКИ/);
  assert.equal(v(rows[16], "Дата / период"), "от 11.06.2021 г. до 10.06.2026 г.");
  for (const r of rows) {
    assert.equal(v(r, "Комплект"), "1");
    assert.equal(v(r, "Шифр чертежа"), SECTION);
    assert.equal(v(r, "Экз."), 1);
    assert.equal(v(r, "Листов"), null);
  }
});

test("два акта: поверки и документ качества — один раз на комплект; скан копируется", async () => {
  const book = await readBook(new MemoryWorkbook(kitRecords((r) => {
    const act2 = { ...r["Акты"][0], "Номер акта": "А2" };
    r["Акты"].push(act2);
    r["АктыКомплектов"].push({ "Комплект": "1", "Акт": "А2" });
    r["МатериалыАктов"].push({ ...r["МатериалыАктов"][0], "Акт": "А2" });
    r["КабельныйЖурнал"].push({ ...r["КабельныйЖурнал"][0], "Акт": "А2", "Обозначение кабеля, жгута, трубы": "Х-1" });
    r["ДокументыКабелей"].push({ ...r["ДокументыКабелей"][0], "Акт": "А2" });
    r["Схемы"][0]["Скан"] = "схема1.pdf";
    r["ДокументыКачества"][0]["Дата"] = null;
  })));
  const { rows, issues } = registryRows(book, "1");
  assert.deepEqual(issues, []);
  const a2 = rows.filter((r) => v(r, "Акт") === "А2").map((r) => v(r, "Вид"));
  assert.deepEqual(a2, ["АОСР", "РИМ", "ВД", "КЖ", "Протокол"]);
  assert.equal(rows.filter((r) => v(r, "Вид") === "Поверка").length, 2);
  assert.equal(rows[4].values["Скан"], "схема1.pdf");
  assert.equal(rows.find((r) => v(r, "Вид") === "Документ качества")!.values["Дата / период"], "б/д");
});

test("ошибки: нет комплекта, нет актов, неизвестный акт", async () => {
  const none = await readBook(new MemoryWorkbook(kitRecords((r) => { r["АктыКомплектов"] = []; })));
  assert.match(registryRows(none, "1").issues[0].message, /не включены акты/);
  assert.match(registryRows(none, "9").issues[0].message, /Комплект «9» не найден/);
  const bad = await readBook(new MemoryWorkbook(kitRecords((r) => { r["АктыКомплектов"].push({ "Комплект": "1", "Акт": "нет" }); })));
  assert.match(registryRows(bad, "1").issues[0].message, /Акт «нет» не найден/);
});

test("номер и дата свидетельства лаборатории", () => {
  assert.deepEqual(labCertificateParts("Свидетельство … №9305 от 28.07.2023 Выдано: …"), { number: "№9305", date: "от 28.07.2023 г." });
  assert.deepEqual(labCertificateParts("без номера"), { number: "", date: "" });
});

test("fillRegistry: строки комплекта заменяются на месте, чужие не трогаются, ссылка скана сохраняется", async () => {
  const wb = new MemoryWorkbook(kitRecords((r) => {
    r["Комплекты"].push({ "№ реестра": "2", "Том": "1", "Часть": "2" });
    r["АктыКомплектов"].push({ "Комплект": "2", "Акт": AOV1 });
    r["РеестрИД"] = [
      { "Комплект": "2", "Вид": "Прочее", "Наименование": "чужая до" },
      { "Комплект": "1", "Вид": "Прочее", "Наименование": "старая" },
      { "Комплект": "2", "Вид": "Прочее", "Наименование": "чужая после" },
    ];
  }));
  await wb.write("Схемы", 0, { "Скан": "s.pdf" }, { "Скан": "https://localhost:3443/api/files/5" });
  const book = await readBook(wb);
  const { count, issues } = await fillRegistry(wb, book, "1");
  assert.deepEqual(issues, []);
  const t = (await wb.read("РеестрИД"))!;
  const name = t.headers.indexOf("Наименование"), kit = t.headers.indexOf("Комплект"), scan = t.headers.indexOf("Скан");
  assert.equal(t.rows.length, count + 2);
  assert.equal(t.rows[0][name], "чужая до");
  assert.equal(t.rows[1][kit], "1");
  assert.equal(t.rows.at(-1)![name], "чужая после");
  assert.equal(t.rows[5][scan], "s.pdf");
  assert.equal(t.links[5][scan], "https://localhost:3443/api/files/5");
});
