// План 11: значения меток своих форм — те же, что во встроенных формах.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { docNumber } from "@idk/shared/acts/format";
import { FIELD_TREE } from "@idk/shared/forms/fields";
import { formData } from "@idk/server/forms/fields";
import { buildDocDataFromBundle } from "@idk/server/print/fromBundle";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

const bundle = async () => buildBundle(await readBook(aov1Book()), AOV1, defaultImportant()).bundle!;

test("значения акта АОВ1 совпадают со встроенной АОСР", async () => {
  const b = await bundle();
  const d = formData(b);
  const aosr = buildDocDataFromBundle(b, "aosr");
  assert.equal(d.values["Акт.Номер"], AOV1);
  assert.equal(d.values["Акт.Номер АОСР"], docNumber(AOV1, "aosr"));
  assert.equal(d.values["Акт.Дата"], "28.07.2026 г.");
  assert.equal(d.values["Акт.Дата прописью"], aosr.date);
  assert.equal(d.values["Акт.Работы"], aosr.works);
  assert.equal(d.values["Объект.Наименование"], aosr.objectName);
  assert.equal(d.values["Технадзор.Подпись"], "Ведущий инженер по автоматике и слаботочным системам Валерьянов А.А.");
  assert.equal(d.values["Технадзор.Строка АОСР"], aosr.reps[0].lines.join("\n"));
  assert.equal(d.values["Акт.П.3"], aosr.p3.join("\n"));
});

test("списки: материалы как в ВД, схемы, ВОР", async () => {
  const b = await bundle();
  const d = formData(b);
  const vd = buildDocDataFromBundle(b, "vd");
  assert.equal(d.lists["Материалы"].length, vd.rows.length);
  assert.equal(d.lists["Материалы"][0]["Материал.Наименование"], vd.rows[0].name);
  assert.equal(d.lists["Материалы"][0]["Материал.Кол-во"], vd.rows[0].quantity);
  assert.equal(d.lists["Материалы"][0]["Материал.№"], "1");
  assert.equal(d.lists["Схемы"][0]["Схема.Номер"], "К32.В.СТ.АОВ1.01.00.1");
  assert.equal(d.lists["ВОР"].length, b.vor.length);
});

test("каждое поле дерева есть в значениях; номер своего документа", async () => {
  const b = await bundle();
  const d = formData(b, { code: "АГИ" });
  for (const g of FIELD_TREE) for (const f of g.fields) {
    const key = `${g.group}.${f}`;
    if (g.list) assert.ok(key in (d.lists[g.list][0] ?? Object.fromEntries(g.fields.map((x) => [`${g.group}.${x}`, ""]))), key);
    else assert.ok(key in d.values, key);
  }
  assert.equal(d.values["Акт.Номер документа"], `${AOV1}.АГИ`);
  assert.equal(formData(b).values["Акт.Номер документа"], docNumber(AOV1, "aosr"));
});
