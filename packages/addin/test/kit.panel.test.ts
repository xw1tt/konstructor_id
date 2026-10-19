// План 7: панель — комплект строки, ошибки сборки, умолчания новых строк.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { newRowDefaults } from "@idk/addin/book/defaults";
import { kitOfRow, kitIssueLines, kitRegistryCount, previewUrl } from "@idk/addin/panel/kit";
import { kitRecords } from "../../shared/test/fixtures/kitBook.ts";

test("комплект строки: ключ «Комплектов», столбец «Комплект» в остальных таблицах", () => {
  assert.equal(kitOfRow("Комплекты", ["№ реестра", "Том"], ["2", "1"]), "2");
  assert.equal(kitOfRow("РеестрИД", ["Комплект", "Вид"], ["1", "ВОР"]), "1");
  assert.equal(kitOfRow("АктыКомплектов", ["Комплект", "Акт"], [3, "А"]), "3");
  assert.equal(kitOfRow("Акты", ["Номер акта"], ["1"]), "");
  assert.equal(kitOfRow("РеестрИД", ["Комплект"], ["Пример: 1"]), "");
});

test("ошибки сервера → строки со ссылками на ячейки", () => {
  const lines = kitIssueLines([
    { row: 4, column: "Скан", message: "Файл не найден: D:\\a.pdf" },
    { row: null, column: "Логотип", message: "Логотип — только PNG или JPG: a.pdf" },
  ], 6);
  assert.deepEqual(lines, [
    { text: "Реестр ИД, строка 10, «Скан»: Файл не найден: D:\\a.pdf", table: "РеестрИД", row: 4, column: "Скан" },
    { text: "Реквизиты, «Логотип»: Логотип — только PNG или JPG: a.pdf", table: "Организации", row: null, column: "Логотип" },
  ]);
  assert.equal(previewUrl("/api/kit-jobs/x1", "https://localhost:3443"),
    `https://localhost:3443/addin/preview.html?src=${encodeURIComponent("/api/kit-jobs/x1")}`);
});

test("число строк комплекта в реестре", async () => {
  const b = await readBook(new MemoryWorkbook(kitRecords((r) => {
    r["РеестрИД"] = [{ "Комплект": "1", "Вид": "ВОР", "Наименование": "a" }, { "Комплект": "2", "Вид": "ВОР", "Наименование": "b" }];
  })));
  assert.equal(kitRegistryCount(b, "1"), 1);
  assert.equal(kitRegistryCount(b, "3"), 0);
});

test("новые строки: номер комплекта — следующий, «Комплект» — последний комплект книги", async () => {
  const b = await readBook(new MemoryWorkbook(kitRecords((r) => { r["Комплекты"].push({ "№ реестра": "2", "Том": "1" }); })));
  assert.equal(newRowDefaults("Комплекты", b)["№ реестра"], "3");
  assert.equal(newRowDefaults("Комплекты", b)["Титул"], "да");
  assert.equal(newRowDefaults("РеестрИД", b)["Комплект"], "2");
  assert.equal(newRowDefaults("РеестрИД", b)["Экз."], 1);
  assert.equal(newRowDefaults("АктыКомплектов", b)["Комплект"], "2");
  const empty = await readBook(new MemoryWorkbook({}));
  assert.equal(newRowDefaults("Комплекты", empty)["№ реестра"], "1");
  assert.equal(newRowDefaults("РеестрИД", empty)["Комплект"], undefined);
});

test("разметка прежней версии — предложить обновление", async () => {
  const { isOutdated } = await import("@idk/addin/panel/useBook");
  assert.equal(isOutdated("2"), true);
  assert.equal(isOutdated("3"), true);
  assert.equal(isOutdated("4"), false);
  assert.equal(isOutdated(null), false);
});
