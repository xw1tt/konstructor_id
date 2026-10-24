// План 11: разметка своей формы по заполненному образцу акта.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { formData } from "@idk/server/forms/fields";
import { markupForm, applyChoices } from "@idk/server/forms/markup";
import { fillDocx, docxText } from "@idk/server/forms/docx";
import { fillXlsx } from "@idk/server/forms/xlsx";
import { readXlsx } from "@idk/server/xlsx/read";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { startTestServer } from "./helpers/server.ts";
import { makeDocx, p, r, tr } from "./helpers/docx.ts";
import { makeXlsx } from "./helpers/xlsx.ts";

const bundle = async (patch: (b: any) => void = () => {}) => {
  const b = buildBundle(await readBook(aov1Book()), AOV1, defaultImportant()).bundle!;
  patch(b);
  return b;
};

/** Заполненный акт «как у пользователя»: значения акта АОВ1 в тексте и таблица материалов. */
async function sample() {
  const b = await bundle((x) => { x.act.dateStart = x.act.date; x.act.dateEnd = x.act.date; });
  const d = formData(b);
  const v = d.values, m = d.lists["Материалы"];
  const body = [
    p(r(`АКТ № ${v["Акт.Номер АОСР"]}`)),
    p(r(`Объект: ${v["Объект.Наименование"]}`)),
    p(r(`Технадзор: ${v["Технадзор.Подпись"]}`)),
    p(r(`Начало работ ${v["Акт.Начало"]} Окончание ${v["Акт.Окончание"]}`)),
    `<w:tbl>${tr("№", "Наименование", "Кол-во")}${m.map((x) => tr(x["Материал.№"], x["Материал.Наименование"], x["Материал.Кол-во"])).join("")}${tr("", "Итого", "")}</w:tbl>`,
    p(r("Подпись нет данных")),
  ].join("");
  return { b, d, buf: makeDocx(body) };
}

test("метки на местах значений, строка материалов — повтор", async () => {
  const { d, buf } = await sample();
  const res = markupForm(buf, "docx", d);
  const text = docxText(applyChoices(res.buf, "docx", {}));
  assert.match(text, /^АКТ № \{Акт\.Номер АОСР\}$/m);
  assert.match(text, /^Объект: \{Объект\.Наименование\}$/m);
  assert.match(text, /^Технадзор: \{Технадзор\.Подпись\}$/m);
  assert.match(text, /^\{#Материалы\}\{Материал\.№\}\n\{Материал\.Наименование\}\n\{Материал\.Кол-во\}\{\/Материалы\}$/m);
  assert.doesNotMatch(text, new RegExp(d.lists["Материалы"][1]["Материал.Наименование"].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "строки других материалов удалены");
  assert.match(text, /Итого/);
  assert.match(text, /Подпись нет данных/, "короткие значения («нет») не ищутся внутри обычного текста");
  assert.ok(res.found >= 6, String(res.found));
});

test("одинаковые даты — неоднозначно, выбор по приоритету и вручную", async () => {
  const { d, buf } = await sample();
  const res = markupForm(buf, "docx", d);
  const dates = res.ambiguous.filter((a) => a.text === d.values["Акт.Начало"]);
  assert.equal(dates.length, 2);
  assert.deepEqual(dates[0].options.slice(0, 3), ["Акт.Дата", "Акт.Окончание", "Акт.Начало"]);
  assert.equal(dates[0].chosen, "Акт.Дата");
  const text = docxText(applyChoices(res.buf, "docx", { [dates[0].id]: "Акт.Начало", [dates[1].id]: "Акт.Окончание" }));
  assert.match(text, /Начало работ \{Акт\.Начало\} Окончание \{Акт\.Окончание\}/);
});

test("обратная проверка: размеченная форма на том же акте даёт исходный текст", async () => {
  const { d, buf } = await sample();
  const res = markupForm(buf, "docx", d);
  const dates = res.ambiguous.filter((a) => a.text === d.values["Акт.Начало"]);
  const form = applyChoices(res.buf, "docx", { [dates[0].id]: "Акт.Начало", [dates[1].id]: "Акт.Окончание" });
  assert.equal(docxText(fillDocx(form, d).buf), docxText(buf));
});

test(".xlsx: метки в ячейках и строка-повтор", async () => {
  const { d } = await sample();
  const m = d.lists["Материалы"];
  const src = makeXlsx({ "Л": [[`Акт ${d.values["Акт.Номер АОСР"]}`], ...m.map((x) => [x["Материал.Наименование"], x["Материал.Кол-во"]]), ["Итого"]] });
  const res = markupForm(src, "xlsx", d);
  const form = applyChoices(res.buf, "xlsx", {});
  assert.deepEqual(readXlsx(form).grid("Л").slice(0, 3), [["Акт {Акт.Номер АОСР}"], ["{#Материалы}{Материал.Наименование}", "{Материал.Кол-во}{/Материалы}"], ["Итого"]]);
  assert.equal(readXlsx(fillXlsx(form, d).buf).grid("Л").length, m.length + 2);
});

test("API: разметить, скачать, сохранить как форму шаблона", async () => {
  const { b, buf } = await sample();
  const s = await startTestServer({ officeRunner: async () => false });
  const { json: t } = await s.req("POST", "/api/templates", { name: "ПИК" });
  const mk = await s.req("POST", `/api/templates/${t.id}/markup`, { bundle: b, file: buf.toString("base64"), name: "АОСР ПИК.docx" });
  assert.equal(mk.status, 201, JSON.stringify(mk.json));
  assert.ok(mk.json.found > 0 && mk.json.ambiguous.length > 0);
  const dl = await s.raw("GET", `/api/templates/${t.id}/markup/${mk.json.token}`);
  assert.match(docxText(Buffer.from(await dl.arrayBuffer())), /\{Объект\.Наименование\}/);
  const saved = await s.req("POST", `/api/templates/${t.id}/markup/${mk.json.token}`, { choices: {} });
  assert.equal(saved.status, 201);
  assert.equal(saved.json.type, "docx");
  assert.equal(saved.json.original, "АОСР ПИК.docx");
});

const wellFormedW = (xml: string) => {
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)(w:[A-Za-z]+)\b[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) stack.push(m[2]);
    else if (stack.pop() !== m[2]) return false;
  }
  return stack.length === 0;
};

test("финальная проверка: однострочный список — оба маркера в одном абзаце, XML цел", async () => {
  const { openZip } = await import("@idk/server/zip/zip");
  const { d } = await sample();
  const m = d.lists["Материалы"];
  const src = makeDocx(`<w:tbl>${m.map((x) => tr(x["Материал.Наименование"])).join("")}</w:tbl>`);
  const out = applyChoices(markupForm(src, "docx", d).buf, "docx", {});
  assert.ok(wellFormedW(openZip(out).get("word/document.xml")!().toString()));
  assert.equal(docxText(out), "{#Материалы}{Материал.Наименование}{/Материалы}");
});

test("финальная проверка: строка повтора — только ячейка, равная наименованию; посторонние строки не удаляются", async () => {
  const { d } = await sample();
  const [a, b] = d.lists["Материалы"].map((x) => x["Материал.Наименование"]);
  const src = makeDocx(`<w:tbl>${tr(`Применены: ${a}, ${b}`)}</w:tbl>` + p(r(`${b} прочее`)));
  const text = docxText(applyChoices(markupForm(src, "docx", d).buf, "docx", {}));
  assert.doesNotMatch(text, /\{#Материалы\}/);
  assert.ok(text.includes(`${b} прочее`), text);
});

test("финальная проверка: .xlsx — объединения удалённых строк материалов не накладываются", async () => {
  const { openZip, writeZip } = await import("@idk/server/zip/zip");
  const { d } = await sample();
  const m = d.lists["Материалы"].slice(0, 3);
  const z = openZip(makeXlsx({ "Л": [["Шапка"], ...m.map((x) => [x["Материал.Наименование"]]), ["Итого"]] }));
  const src = writeZip([...z].map(([k, g]) => [k, k === "xl/worksheets/sheet1.xml"
    ? g().toString().replace("</sheetData>", '</sheetData><mergeCells count="4"><mergeCell ref="A2:C2"/><mergeCell ref="A3:C3"/><mergeCell ref="A4:C4"/><mergeCell ref="A5:C5"/></mergeCells>') : g()]));
  const out = applyChoices(markupForm(src, "xlsx", d).buf, "xlsx", {});
  const xml = openZip(out).get("xl/worksheets/sheet1.xml")!().toString();
  assert.deepEqual([...xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map((x) => x[1]), ["A2:C2", "A3:C3"]);
  assert.match(xml, /<mergeCells count="2">/);
});
