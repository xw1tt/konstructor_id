import { test } from "node:test";
import assert from "node:assert/strict";
import { docFieldsByRules, parseRuDate, parseDocFieldsAnswer, mergeFields, hasText } from "@idk/shared/scan/docText";

const CERT = `ЕВРАЗИЙСКИЙ ЭКОНОМИЧЕСКИЙ СОЮЗ
СЕРТИФИКАТ СООТВЕТСТВИЯ
№ ЕАЭС RU C-RU.АД38.В.00024/21
Серия RU № 0283544
ОРГАН ПО СЕРТИФИКАЦИИ продукции ...
ЗАЯВИТЕЛЬ Общество с ограниченной ответственностью "Кабельный завод"
ИЗГОТОВИТЕЛЬ Общество с ограниченной ответственностью "Спецкабель", Место нахождения: 107497, Москва
ПРОДУКЦИЯ Кабели для промышленного интерфейса RS-485
СРОК ДЕЙСТВИЯ С 11.06.2021 ПО 10.06.2026 ВКЛЮЧИТЕЛЬНО`;

const PASS = `ПАСПОРТ КАЧЕСТВА № 1245/7
Труба гофрированная ПНД 20
Дата изготовления: 14 марта 2026 г.
Изготовитель: ООО «ДКС»`;

test("сертификат ЕАЭС: вид, рег. номер, срок действия, дата, изготовитель", () => {
  const f = docFieldsByRules(CERT);
  assert.equal(f.type, "Сертификат соответствия");
  assert.equal(f.number, "№ЕАЭС RU C-RU.АД38.В.00024/21");
  assert.equal(f.validUntil, "2026-06-10");
  assert.equal(f.issueDate, "2021-06-11");
  assert.equal(f.manufacturer, 'Общество с ограниченной ответственностью "Спецкабель"');
});

test("паспорт: номер после №, дата словами", () => {
  const f = docFieldsByRules(PASS);
  assert.equal(f.type, "Паспорт качества");
  assert.equal(f.number, "№1245/7");
  assert.equal(f.issueDate, "2026-03-14");
  assert.equal(f.validUntil, null);
  assert.equal(f.manufacturer, "ООО «ДКС»");
});

test("даты: числа, короткий год, словами; мусор — null", () => {
  assert.equal(parseRuDate("от 05.06.2026 г."), "2026-06-05");
  assert.equal(parseRuDate("5/6/26"), "2026-06-05");
  assert.equal(parseRuDate("1 мая 2025"), "2025-05-01");
  assert.equal(parseRuDate("31.13.2025"), null);
});

test("ответ нейросети: JSON в тексте, вид из списка, «№», даты; правила дополняют пропуски", () => {
  const ai = parseDocFieldsAnswer('Вот: {"type":"Декларация о соответствии","number":"ЕАЭС N RU Д-RU.РА01.В.12345/24","issueDate":"01.02.2024","validUntil":null,"manufacturer":"null"}');
  assert.deepEqual(ai, { type: "Декларация о соответствии", number: "№ЕАЭС N RU Д-RU.РА01.В.12345/24", issueDate: "2024-02-01", validUntil: null, manufacturer: null });
  assert.equal(parseDocFieldsAnswer('{"type":"Справка"}')!.type, null);
  assert.equal(parseDocFieldsAnswer("не знаю"), null);
  assert.equal(mergeFields(ai, docFieldsByRules(CERT)).validUntil, "2026-06-10");
  assert.equal(hasText(CERT), true);
  assert.equal(hasText("  \n 1 2 3 "), false);
});

test("декларация: дата регистрации важнее начала периода", () => {
  const f = docFieldsByRules(`ДЕКЛАРАЦИЯ О СООТВЕТСТВИИ ЕАЭС N RU Д-RU.РА01.В.12345/24\nДата регистрации декларации о соответствии: 01.02.2024\nДекларация о соответствии действительна с 05.02.2024 по 04.02.2029 включительно`);
  assert.equal(f.type, "Декларация о соответствии");
  assert.equal(f.number, "№ЕАЭС RU Д-RU.РА01.В.12345/24");
  assert.equal(f.issueDate, "2024-02-01");
  assert.equal(f.validUntil, "2029-02-04");
});

test("0.29: запрос со списком материалов; ответ — поля и номера материалов из списка", async () => {
  const { docIdentifyPrompt, parseIdentifyAnswer, saneDates } = await import("@idk/shared/scan/docText");
  const q = docIdentifyPrompt("текст", [{ name: "Кабель ВВГ", mark: "ВВГнг 3х2,5" }, { name: "Труба" }], true);
  assert.match(q.user, /1\. Кабель ВВГ \| ВВГнг 3х2,5\n2\. Труба/);
  assert.match(q.system, /изображения страниц/);
  const r = parseIdentifyAnswer('{"type":"Сертификат соответствия","number":"№1","issueDate":"2025-01-01","validUntil":"2030-01-01","manufacturer":null,"materials":[2, 2, 5, "1"]}', 2)!;
  assert.deepEqual(r.materials, [1, 0], "дубли и номера вне списка отброшены");
  assert.equal(r.fields.number, "№1");
  assert.deepEqual(saneDates({ ...r.fields, issueDate: "2027-01-01", validUntil: "2026-01-01" }, "2026-10-28").warnings.length, 2);
});
