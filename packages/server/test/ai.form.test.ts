// План 20, задача 2: разметка формы помощником — текст размеченного образца, новые метки, выбор вариантов, сохранение.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPairs, applyChoices, markupText } from "@idk/server/forms/markup";
import { docxText } from "@idk/server/forms/docx";
import { isKnownField } from "@idk/shared/forms/fields";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { formData } from "@idk/server/forms/fields";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { startTestServer } from "./helpers/server.ts";
import { makeDocx, p, r } from "./helpers/docx.ts";
import { makeXlsx } from "./helpers/xlsx.ts";

test("пары → метки: текст через несколько кусков, длинные раньше коротких, отсутствующий — в missing", () => {
  const buf = makeDocx([p(r("Заказчик: ООО «Ро"), r("га и копыта»")), p(r("Город Москва, Москва")), p(r("Прораб: Иванов"))].join(""));
  const res = applyPairs(buf, "docx", [
    { text: "Москва", field: "Объект.Город" },
    { text: "ООО «Рога и копыта»", field: "Объект.Застройщик" },
    { text: "Нет такого текста", field: "Акт.Номер" },
  ]);
  const t = docxText(res.buf);
  assert.match(t, /^Заказчик: \{Объект\.Застройщик\}$/m);
  assert.match(t, /^Город \{Объект\.Город\}, \{Объект\.Город\}$/m);
  assert.equal(res.applied, 3);
  assert.deepEqual(res.missing, ["Нет такого текста"]);
  assert.equal(markupText(res.buf, "docx").split("\n")[0], "Заказчик: {Объект.Застройщик}");
  assert.ok(isKnownField("Акт.Номер АОСР") && isKnownField("Строка.Линия") && !isKnownField("Акт.Цвет"));
});

test("Excel: текст ячеек и пары в общих строках", () => {
  const buf = makeXlsx({ "Лист1": [["Объект", "ЖК Пример"], ["Дата", "28.07.2026"]] });
  assert.match(markupText(buf, "xlsx"), /B1: ЖК Пример/);
  const res = applyPairs(buf, "xlsx", [{ text: "ЖК Пример", field: "Объект.Наименование" }]);
  assert.equal(res.applied, 1);
  assert.match(markupText(res.buf, "xlsx"), /B1: \{Объект\.Наименование\}/);
});

test("маршруты: разметка → текст → пары (неизвестное поле — 400) → сохранение с выбором вариантов", async () => {
  const s = await startTestServer();
  const b = buildBundle(await readBook(aov1Book()), AOV1, defaultImportant()).bundle!;
  const v = formData(b).values;
  const doc = makeDocx([p(r(`АКТ № ${v["Акт.Номер АОСР"]}`)), p(r("Участок: Подземная часть, оси 1-5"))].join(""));
  const t = (await s.req("POST", "/api/templates", { name: "Мой" })).json;
  const mk = await s.req("POST", `/api/templates/${t.id}/markup`, { bundle: b, file: doc.toString("base64"), name: "акт.docx" });
  assert.equal(mk.status, 201, JSON.stringify(mk.json));
  const text = await s.req("GET", `/api/templates/${t.id}/markup/${mk.json.token}/text`);
  assert.match(text.json.text, /АКТ № \{Акт\.Номер АОСР\}/);
  const bad = await s.req("POST", `/api/templates/${t.id}/markup/${mk.json.token}/pairs`, { replacements: [{ text: "Подземная часть", field: "Акт.Цвет" }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, "Неизвестное поле: Акт.Цвет");
  const ok = await s.req("POST", `/api/templates/${t.id}/markup/${mk.json.token}/pairs`, { replacements: [{ text: "Подземная часть, оси 1-5", field: "Объект.Раздел" }] });
  assert.deepEqual(ok.json, { applied: 1, missing: [] });
  const saved = await s.req("POST", `/api/templates/${t.id}/markup/${mk.json.token}`, { choices: {} });
  assert.equal(saved.status, 201);
  const file = Buffer.from(await (await s.raw("GET", `/api/templates/${t.id}/forms/${saved.json.file}`)).arrayBuffer());
  assert.match(docxText(applyChoices(file, "docx", {})), /Участок: \{Объект\.Раздел\}/);
});
