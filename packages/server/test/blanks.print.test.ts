// Настройки бланков шаблона в печати: скрытые графы и строки, свои заголовки — в PDF (HTML) и Excel одинаково.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderActDoc } from "@idk/server/print/docs";
import { renderActXlsx } from "@idk/server/print/xlsx/index";
import { renderBundleXlsx } from "@idk/server/routes/print";
import { protoHtml } from "@idk/server/print/templates/proto";
import { blankView } from "@idk/shared/blanks";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { buildCableBundle } from "@idk/shared/workbook/cables";
import { buildProtoBundle } from "@idk/shared/protocols/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { PrintOptions } from "@idk/shared/templates";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { protoRecords } from "../../shared/test/fixtures/protoBook.ts";
import { readXlsx } from "./helpers/xlsxRead.ts";

const book = async () => readBook(new MemoryWorkbook(aov1Records() as any));
const KAM = PrintOptions.parse({ formSet: "ti", blanks: { "kj:ti": { hide: ["tray", "smooth", "corrugated", "reserve"], headers: { mark: "Марка кабеля" } } } });

test("КЖ «ТИ» «Камчатки»: без «Способа прокладки» и строки запаса, графа «Марка кабеля» — в PDF и Excel", async () => {
  const b = buildCableBundle(await book(), AOV1, defaultImportant(), "kj", { set: "ti" }).bundle!;
  const html = renderActDoc(b, "kj", KAM).html;
  for (const gone of ["Способ прокладки", "Лоток", "Труба гладкая", "Труба гофрированная", "с учетом кф запаса"]) assert.ok(!html.includes(gone), gone);
  for (const kept of ["Трасса", "Кабель", "Марка кабеля", "Итого всего", "в т.ч.", "Сдал:"]) assert.ok(html.includes(kept), kept);
  const full = renderActDoc(b, "kj", PrintOptions.parse({ formSet: "ti" })).html;
  assert.ok(full.includes("Труба гофрированная") && full.includes("с учетом кф запаса"));
  const s = readXlsx(renderActXlsx(b, "kj", KAM).xlsx).sheets[0];
  for (const gone of ["Способ прокладки", "Лоток", "Труба гладкая", "с учетом кф запаса"]) assert.ok(!s.text.includes(gone), gone);
  for (const kept of ["Марка кабеля", "Итого всего"]) assert.ok(s.text.includes(kept), kept);
});

test("общий заголовок над группой граф: часть граф скрыта — заголовок над оставшимися", async () => {
  const b = buildCableBundle(await book(), AOV1, defaultImportant(), "kj", { set: "ti" }).bundle!;
  const html = renderActDoc(b, "kj", PrintOptions.parse({ formSet: "ti", blanks: { "kj:ti": { hide: ["from"] } } })).html;
  assert.match(html, /<th>Трасса<\/th>/, "одна графа под «Трасса» — без colspan");
  assert.match(html, /<th colspan="3">Кабель<\/th>/);
});

test("РИМ, ВД, ВОР «СБД»: скрытая графа пропадает, номера граф — подряд; подписи ВОР по настройке", async () => {
  const b = buildBundle(await book(), AOV1, defaultImportant()).bundle!;
  const o = PrintOptions.parse({ blanks: { "vd:sbd": { hide: ["position", "article"] }, "vor:sbd": { hide: ["signs", "note"] }, "rim:sbd": { headers: { sheets: "Листов" } } } });
  const vd = renderActDoc(b, "vd", o).html;
  assert.ok(!vd.includes("№ поз по УСР") && !vd.includes("Артикул"));
  assert.match(vd, /<tr class="nums"><td>1<\/td><td>2<\/td><td>3<\/td><td>4<\/td><td>5<\/td><\/tr>/);
  const vor = renderActDoc(b, "vor", o).html;
  assert.ok(!vor.includes("Представитель монтажной организации") && !vor.includes("Примечания"));
  assert.ok(renderActDoc(b, "rim", o).html.includes("<th>Листов</th>"));
  const x = readXlsx(renderActXlsx(b, "vd", o).xlsx).sheets[0];
  assert.ok(!x.text.includes("Артикул"));
  assert.equal((x.xml.match(/<col /g) ?? []).length, 5, "столбцы листа — по видимым графам");
});

test("протокол: скрытая графа и перечень средств измерений", async () => {
  const pb = buildProtoBundle(await readBook(new MemoryWorkbook(protoRecords() as any)), "ПАВ-1", defaultImportant()).bundle!;
  const key = pb.proto!.kind;
  const v = blankView(key, { hide: ["instruments"], headers: {} });
  const h = protoHtml(pb, v);
  assert.ok(!h.includes("Перечень используемых средств измерений"));
  const o = PrintOptions.parse({ blanks: { [key]: { hide: ["instruments"] } } });
  const s = readXlsx(renderBundleXlsx(pb, key, o).xlsx).sheets[0];
  assert.ok(!s.text.includes("Перечень используемых средств измерений"));
});
