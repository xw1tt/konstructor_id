// План 11: подстановка меток в .docx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openZip } from "@idk/server/zip/zip";
import { fillDocx, docxText, FormError } from "@idk/server/forms/docx";
import type { FormData } from "@idk/shared/forms/fields";
import { makeDocx, p, r, tr } from "./helpers/docx.ts";

const data: FormData = {
  values: { "Акт.Номер": "1", "Акт.Дата": "05.06.2026 г.", "Объект.Заказчик": 'ООО "СБД" & <Ко>', "Акт.П.3": "строка 1\nстрока 2" },
  lists: {
    "Материалы": [{ "Материал.Наименование": "Кабель" }, { "Материал.Наименование": "Лоток" }, { "Материал.Наименование": "Муфта" }],
    "Схемы": [],
  },
};
const xml = (buf: Buffer, part = "word/document.xml") => openZip(buf).get(part)!().toString("utf8");

test("метки в одном куске текста; две метки в абзаце", () => {
  const out = fillDocx(makeDocx(p(r("Акт № {Акт.Номер} от {Акт.Дата}"))), data);
  assert.equal(docxText(out.buf), "Акт № 1 от 05.06.2026 г.");
  assert.deepEqual(out.warnings, []);
});

test("метка, разбитая Word на три куска с разным форматированием", () => {
  const out = fillDocx(makeDocx(p(r("Акт № "), r("{Акт.", "<w:i/>"), r("Ном", "<w:b/>"), r("ер}"), r(" готов"))), data);
  assert.equal(docxText(out.buf), "Акт № 1 готов");
  const doc = xml(out.buf);
  assert.match(doc, /<w:rPr><w:i\/><\/w:rPr><w:t xml:space="preserve">1<\/w:t>/, "форматирование первого куска метки");
  assert.doesNotMatch(doc, /<w:b\/>/, "пустой кусок удалён");
});

test("спецсимволы XML и переводы строк", () => {
  const out = fillDocx(makeDocx(p(r("{Объект.Заказчик}")) + p(r("{Акт.П.3}"))), data);
  assert.equal(docxText(out.buf), 'ООО "СБД" & <Ко>\nстрока 1\nстрока 2');
  const doc = xml(out.buf);
  assert.match(doc, /&amp; &lt;Ко&gt;/);
  assert.match(doc, /строка 1<\/w:t><w:br\/><w:t xml:space="preserve">строка 2/);
});

test("повтор строки таблицы; пустой список убирает строку", () => {
  const table = `<w:tbl>${tr("Наименование")}${tr("{#Материалы}{Материал.Наименование}{/Материалы}")}${tr("Итого")}</w:tbl>`;
  const empty = `<w:tbl>${tr("Схемы")}${tr("{#Схемы}{Схема.Номер}{/Схемы}")}</w:tbl>`;
  const out = fillDocx(makeDocx(table + empty), data);
  assert.equal(docxText(out.buf), "Наименование\nКабель\nЛоток\nМуфта\nИтого\nСхемы");
  assert.equal((xml(out.buf).match(/<w:tr>/g) ?? []).length, 6);
});

test("колонтитул; неизвестная метка", () => {
  const out = fillDocx(makeDocx(p(r("{Нет.Поля}")), { "word/header1.xml": p(r("Акт {Акт.Номер}")) }), data);
  assert.match(xml(out.buf, "word/header1.xml"), /Акт 1/);
  assert.equal(docxText(out.buf), "[нет поля: Нет.Поля]");
  assert.deepEqual(out.warnings, ["Нет поля «Нет.Поля»"]);
});

test("не .docx — FormError", () => {
  assert.throws(() => fillDocx(new TextEncoder().encode("%PDF-1.4"), data), (e: unknown) => e instanceof FormError && e.message === "Это не файл Word (.docx)");
});

test("пустые абзацы <w:p/> не склеиваются со следующими", () => {
  const out = fillDocx(makeDocx(`<w:p/>${p(r("Акт {Акт.Номер}"))}<w:p w:rsidR="00A1"/>${p(r("от {Акт.Дата}"))}`), data);
  assert.equal(docxText(out.buf), "\nАкт 1\n\nот 05.06.2026 г.");
});

const wellFormed = (xml: string) => {
  // Простая проверка вложенности тегов w:*: каждый открытый закрыт в правильном порядке.
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)(w:[A-Za-z]+)\b[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) stack.push(m[2]);
    else if (stack.pop() !== m[2]) return false;
  }
  return stack.length === 0;
};

test("финальная проверка: вложенная таблица в ячейке — повтор внутренней строки, XML цел", () => {
  const inner = `<w:tbl>${tr("{#Материалы}{Материал.Наименование}{/Материалы}")}</w:tbl>`;
  const outer = `<w:tbl><w:tr><w:tc>${inner}${p(r("после"))}</w:tc></w:tr>${tr("Акт {Акт.Номер}")}</w:tbl>`;
  const out = fillDocx(makeDocx(outer), data);
  assert.ok(wellFormed(xml(out.buf)), xml(out.buf));
  assert.equal(docxText(out.buf), "Кабель\nЛоток\nМуфта\nпосле\nАкт 1");
});

test("финальная проверка: метка после надписи (textbox) в том же абзаце подставляется", () => {
  const box = `<w:r><w:pict><v:textbox xmlns:v="urn:schemas-microsoft-com:vml"><w:txbxContent>${p(r("в рамке {Акт.Номер}"))}</w:txbxContent></v:textbox></w:pict></w:r>`;
  const out = fillDocx(makeDocx(`<w:p>${r("до ")}${box}${r(" после {Акт.Номер}")}</w:p>`), data);
  assert.ok(wellFormed(xml(out.buf)));
  assert.doesNotMatch(xml(out.buf), /\{Акт\.Номер\}/);
});

test("финальная проверка: таблица из одной строки-повтора с пустым списком удаляется целиком", () => {
  const out = fillDocx(makeDocx(`<w:tbl><w:tblPr/>${tr("{#Схемы}{Схема.Номер}{/Схемы}")}</w:tbl>${p(r("Конец"))}`), data);
  assert.doesNotMatch(xml(out.buf), /<w:tbl>/);
  assert.equal(docxText(out.buf), "Конец");
});
