// План 13, задача 8: панель — кнопки печати по области документа, статус «нет данных», пакет документа для печати.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import type { UserTemplate } from "@idk/shared/forms/template";
import { templateButtons } from "@idk/addin/panel/templatesApi";
import { statusText } from "@idk/addin/panel/catalogApi";
import { protoBundleFor, bundleFor } from "@idk/addin/panel/print";
import { protoRecords, AOV1 } from "../../shared/test/fixtures/protoBook.ts";
import { PrintOptions } from "@idk/shared/templates";

const tpl: UserTemplate = {
  id: "t-1", name: "Т", print: PrintOptions.parse({ schemeEach: false }),
  docs: [{ kind: "builtin", doc: "aosr", form: null }, { kind: "builtin", doc: "pkl", form: null }, { kind: "builtin", doc: "pav", form: null }],
};
const book = async (patch?: Parameters<typeof protoRecords>[0]) => readBook(new MemoryWorkbook(protoRecords(patch) as any));

test("кнопки печати: в карточке акта — документы «на акт», в карточке комплекта — «на комплект»", () => {
  assert.deepEqual(templateButtons(tpl).map((b) => b.label), ["АОСР", "ПКЛ"]);
  assert.deepEqual(templateButtons(tpl, "kit").map((b) => b.label), ["ПАВ"]);
});

test("статус полноты «нет данных»", () => {
  assert.equal(statusText("noData", "ПКЛ"), "нет данных: ПКЛ");
});

test("пакет документа для печати: по акту, по комплекту, по акту комплекта; нет шапки — ошибка «Протоколы»", async () => {
  const b = await book();
  assert.equal(protoBundleFor(b, "pkl", { act: AOV1 }, defaultImportant()).bundle?.proto?.number, "ПКЛ-1");
  assert.equal(protoBundleFor(b, "pav", { kit: "1" }, defaultImportant()).bundle?.proto?.number, "ПАВ-1");
  assert.equal(protoBundleFor(b, "pav", { act: AOV1 }, defaultImportant()).bundle?.proto?.number, "ПАВ-1", "документ комплекта, в который входит акт");
  const none = protoBundleFor(b, "pokb", { act: AOV1 }, defaultImportant());
  assert.equal(none.bundle, null);
  assert.deepEqual(none.issues.map((i) => [i.table, i.column, i.message]),
    [["Протоколы", "№ документа", `Нет строки «ПОКБ» в таблице «Протоколы» для акта «${AOV1}»`]]);
  assert.equal(bundleFor(b, AOV1, defaultImportant(), "pkl").bundle?.proto?.code, "ПКЛ", "своя форма протокола — пакет протокола");
});
