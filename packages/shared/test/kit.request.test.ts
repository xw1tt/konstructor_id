// План 7: задание сборки комплекта — проверки и состав.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { registryRows } from "@idk/shared/kit/registry";
import { buildKitRequest, KitRequest } from "@idk/shared/kit/request";
import { AOV1 } from "./fixtures/aov1Book.ts";
import { kitRecords } from "./fixtures/kitBook.ts";

/** Книга с заполненным реестром комплекта 1; patch — правки записей до чтения. */
async function filled(patch: (r: any) => void = () => {}) {
  const r = kitRecords();
  const book0 = await readBook(new MemoryWorkbook(r));
  r["РеестрИД"] = registryRows(book0, "1").rows.map((x) => x.values);
  patch(r);
  return readBook(new MemoryWorkbook(r));
}
const msgs = (x: { issues: { message: string }[] }) => x.issues.map((i) => i.message);
const NOW = new Date("2026-10-19T10:00:00");

test("без сканов комплект не собирается: ошибка на каждой строке-скане", async () => {
  const { request, issues } = buildKitRequest(await filled(), "1", defaultImportant(), "sbd", undefined, NOW);
  assert.equal(request, null);
  assert.ok(issues.length > 6);
  assert.ok(issues.every((i) => i.table === "РеестрИД" && i.column === "Скан" && i.message === "Нет скана: укажите файл в столбце «Скан»"));
});

test("сканы — свои или найденные по номеру в исходных таблицах; задание проходит схему zod", async () => {
  const book = await filled((r) => {
    for (const s of r["Схемы"]) s["Скан"] = `${s["Номер"]}.pdf`;
    for (const d of r["ДокументыКачества"]) d["Скан"] = `${d["Номер"]}.pdf`;
    for (const i of r["СредстваИзмерений"]) i["Скан"] = "поверка.pdf";
    r["Электролаборатория"][0]["Скан"] = "лаб.pdf";
    // строка реестра со своим сканом важнее исходной таблицы
    r["РеестрИД"][4]["Скан"] = "своя.pdf";
    r["Объект"].push({ "Поле": "Папка сканов", "Значение": "D:\\Сканы" });
    r["Организации"][0]["Логотип"] = "sbd.png";
  });
  const { request, issues } = buildKitRequest(book, "1", defaultImportant(), "sbd", { schemeEach: true, formSet: "sbd", forms: {}, kjReserve: 2, kjDecimals: null, blanks: {} }, NOW);
  assert.deepEqual(issues, []);
  const q = KitRequest.parse(JSON.parse(JSON.stringify(request)));
  assert.equal(q.acts.length, 1);
  assert.equal(q.acts[0].act.baseNumber, AOV1);
  assert.ok(q.acts[0].cables && q.acts[0].cables.marks.length === 1, "пакет с данными протокола");
  assert.deepEqual(q.rows.slice(0, 4).map((r) => r.doc), [
    { act: AOV1, kind: "vor" }, { act: AOV1, kind: "aosr" }, { act: AOV1, kind: "rim" }, { act: AOV1, kind: "vd" }]);
  assert.deepEqual(q.rows[4].file, { name: "своя.pdf", link: null });
  assert.equal(q.rows[5].file!.name, "К32.В.СТ.АОВ1.01.00.2.pdf");
  assert.deepEqual(q.rows.slice(10, 12).map((r) => r.doc!.kind), ["kj", "ip"]);
  assert.equal(q.rows[12].file!.name, "поверка.pdf");
  assert.equal(q.rows[14].file!.name, "лаб.pdf");
  assert.deepEqual(q.rows[15].doc, { act: AOV1, kind: "avk" });
  assert.match(q.rows[16].file!.name, /\.pdf$/);
  assert.deepEqual(q.kit, {
    number: "1", volume: "1", part: "1", building: "Корпус «В»", works: "", city: "Москва", year: "2026", cover: true, spine: true, parts: 1,
    code: "КУТ03-Р-ПИР-2-26-100-АОВ1.01.00",
    sectionName: "Комплекс работ по монтажу системы автоматизации и диспетчеризации отопления и теплоснабжения. Подземная часть.",
  });
  assert.equal(q.scanFolder, "D:\\Сканы");
  assert.equal(q.developer!.shortName, 'ООО "СБД"');
  assert.equal(q.designer!.shortName, 'ООО "МАРКС ИНЖИНИРИНГ"');
  assert.equal(q.contractor!.shortName, 'ООО "Велесстрой"');
  assert.deepEqual(q.logos, { developer: { name: "sbd.png", link: null }, contractor: null });
  assert.deepEqual(q.options, { schemeEach: true, formSet: "sbd", forms: {}, kjReserve: 2, kjDecimals: null, blanks: {} });
  assert.equal(q.object.contractNumber, "КУТ03-Р-СМР-36-26");
});

test("ошибки печати актов и строк реестра попадают в список", async () => {
  const book = await filled((r) => {
    for (const row of r["РеестрИД"]) row["Скан"] = "x.pdf";
    r["РеестрИД"][1]["Акт"] = null; // АОСР без акта
    r["РеестрИД"].push({ "Комплект": "1", "Вид": "ВД", "Акт": "чужой", "Наименование": "ВД" });
    r["ДокументыКабелей"][0]["№ протокола"] = null; // протокол в реестре есть, номер пуст
  });
  const m = msgs(buildKitRequest(book, "1", defaultImportant(), "sbd", undefined, NOW));
  assert.ok(m.includes("Укажите акт: документ «АОСР» печатает конструктор"), m.join("\n"));
  assert.ok(m.includes("Акт «чужой» не входит в комплект «1»"));
  assert.ok(m.includes("Не заполнено"));
});

test("пустой реестр — подсказка «Заполнить из актов»", async () => {
  const book = await readBook(new MemoryWorkbook(kitRecords()));
  assert.ok(msgs(buildKitRequest(book, "1", defaultImportant())).some((x) => /нажмите «Заполнить из актов»/.test(x)));
});
