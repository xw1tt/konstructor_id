import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildCableBundle } from "@idk/shared/workbook/cables";
import { cableDocData } from "@idk/server/print/cableData";
import { kjHtml } from "@idk/server/print/templates/kj";
import { htmlToPdf, closeBrowser, currentBrowserForTests } from "@idk/server/print/browser";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

after(() => closeBrowser());

/** Геометрия листов журнала в браузере: нижняя граница таблицы, верх штампа, переполненные ячейки. */
async function measure(html: string) {
  await htmlToPdf("<p>x</p>");
  const b = (await currentBrowserForTests())!;
  const page = await b.newPage();
  await page.setContent(html, { waitUntil: "load" });
  const r = await page.evaluate(() => [...document.querySelectorAll(".sheet")].map((s) => {
    const t = s.querySelector("table.kj-t")!.getBoundingClientRect();
    const st = s.querySelector(".stamp")!.getBoundingClientRect();
    const sheet = s.getBoundingClientRect();
    const over = [...s.querySelectorAll(".fit")].filter((el) => (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight + 1).length;
    const fits = s.querySelectorAll(".stamp .fit").length;
    return { tableBottom: t.bottom, stampTop: st.top, stampBottom: st.bottom, sheetBottom: sheet.bottom, over, fits };
  }));
  await page.close();
  return r;
}

async function data(patch: (b: any) => void) {
  const b = buildCableBundle(await readBook(aov1Book()), AOV1, defaultImportant(), "kj").bundle!;
  patch(b);
  return cableDocData(b, "kj");
}

test("ревью: длинные марки кабеля и трубы не раздвигают строки — таблица выше штампа", async () => {
  const d = await data((b) => {
    const r0 = b.cables.rows[0];
    b.cables.rows = Array.from({ length: 28 }, (_, i) => ({ ...r0, designation: `Л-${i + 1}`,
      cableMark: "Кабель силовой с медными жилами с изоляцией и оболочкой из ПВХ пониженной пожарной опасности ВВГнг(А)-LS 5х16мк(N,PE)-0,66 кВ",
      pipeMark: "Труба гофрированная ПВХ с зондом лёгкая d=20 мм серая", pipeLength: 12 }));
  });
  assert.equal(d.sheets.length, 1);
  const [s] = await measure(kjHtml(d));
  assert.ok(s.tableBottom <= s.stampTop + 0.5, `таблица ${s.tableBottom} заходит на штамп ${s.stampTop}`);
  assert.equal(s.over, 0, "текст не помещается в ячейки");
});

test("ревью: длинные наименования объекта и раздела помещаются в штамп", async () => {
  const d = await data(() => {});
  d.stamp.section = "Комплекс работ по монтажу системы автоматизации и диспетчеризации отопления, вентиляции, кондиционирования и теплоснабжения. Подземная часть. Корпуса А, Б, В";
  d.stamp.object = "Реконструируемый деловой комплекс в составе корп. А, Б, В, Г, Е с единой стилобатной (подземной) частью и устройством надземной объединительной аркады по адресу: г. Москва, пересечение Кутузовского проспекта и улицы Кульнева (ЗАО г. Москвы). Корпус В. Очередь строительства 2, этап 3";
  const [s] = await measure(kjHtml(d));
  assert.ok(s.fits >= 3, "тексты штампа вписываются (класс fit)");
  assert.equal(s.over, 0, "текст штампа не помещается");
  assert.ok(s.stampBottom <= s.sheetBottom + 0.5);
});
