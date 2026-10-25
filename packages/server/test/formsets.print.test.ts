// План 14, задачи 3–4: формы набора «ТИ» — ВД, РМ, РП, КЖ; выбор формы по опциям печати.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { PrintOptions } from "@idk/shared/templates";
import { renderBundlePdf } from "@idk/server/routes/print";
import { tiVdHtml, tiRmHtml, tiRpHtml } from "@idk/server/print/templates/ti";
import { tiDocData } from "@idk/server/print/tiData";
import { closeBrowser } from "@idk/server/print/browser";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { pdfPages } from "./helpers/pdftext.ts";

after(() => closeBrowser());

const TI = PrintOptions.parse({ formSet: "ti" });
const bundle = async (patch: (r: any) => void = () => {}) => {
  const r: any = aov1Records();
  patch(r);
  const res = buildBundle(await readBook(new MemoryWorkbook(r)), AOV1, defaultImportant());
  assert.deepEqual(res.issues, []);
  return res.bundle!;
};

test("ВД «ТИ»: шапка, номер, графы, марка (иначе артикул), подписи пяти ролей", async () => {
  const b = await bundle();
  const d = tiDocData(b);
  const h = tiVdHtml(d);
  assert.match(h, /ООО &quot;Велесстрой&quot;/, "подрядчик — выполнивший работы акта");
  assert.match(h, /\(подрядная организация\)/);
  assert.match(h, />Москва</);
  assert.match(h, /\(заказчик\)/);
  assert.match(h, /&quot;28&quot; июля 2026г\./);
  assert.match(h, new RegExp(`ВЕДОМОСТЬ № ${AOV1.replace(/\./g, "\\.")}\\.ВД`));
  assert.match(h, /СМОНТИРОВАННОГО ЭЛЕКТРООБОРУДОВАНИЯ И МАТЕРИАЛОВ/);
  for (const g of ["№ п/п", "Наименование электрооборудования, комплекта", "Тип, марка", "Кол-во", "Ед. изм.", "Примечания"]) assert.ok(h.includes(g), g);
  const first = b.materials.find((m) => m.id === b.actMaterials[0].materialId)!;
  assert.ok(h.includes(first.mark || first.article));
  assert.equal((h.match(/class="ti-sign"/g) ?? []).length, 5);
  assert.match(h, /Валерьянов А\.А\./);
  assert.match(h, /\(фамилия, инициалы, подпись\)/);
});

test("РМ «ТИ»: строка документа, под ней его материалы с номерами; документ без даты — «б/д»", async () => {
  const b = await bundle((r) => { r["ДокументыКачества"][0]["Дата"] = null; r["ДокументыКачества"][0]["Действует до"] = null; });
  const d = tiDocData(b);
  assert.ok(d.rm.length > 0);
  assert.ok(d.rm.every((g) => g.items.length > 0));
  const nums = d.rm.flatMap((g) => g.items.map((i) => i.n));
  assert.deepEqual(nums, nums.map((_, i) => i + 1), "материалы пронумерованы подряд");
  assert.ok(d.rm.some((g) => g.date === "б/д"));
  const h = tiRmHtml(d);
  assert.match(h, /применённых материалов/);
  assert.match(h, new RegExp(`№${AOV1.replace(/\./g, "\\.")}\\.РМ`));
  assert.match(h, new RegExp(`к АОСР ${AOV1.replace(/\./g, "\\.")} от 28\\.07\\.2026г\\.`));
  assert.equal((h.match(/class="ti-doc"/g) ?? []).length, d.rm.length);
});

test("РП «ТИ»: документы качества акта с листами", async () => {
  const b = await bundle();
  const d = tiDocData(b);
  const h = tiRpHtml(d);
  assert.match(h, /документов, подтверждающих соответствие работ/);
  assert.match(h, new RegExp(`№${AOV1.replace(/\./g, "\\.")}\\.РП`));
  assert.equal((h.match(/<tr class="row">/g) ?? []).length, d.rp.length);
  assert.ok(d.rp.length === b.qualityDocs.length);
  assert.ok(h.includes(">Лист<"));
});

test("печать по опциям: ВД и РИМ — форма набора; РП; имена файлов по нумерации набора", async () => {
  const b = await bundle();
  const vd = await renderBundlePdf(b, "vd", "ti", TI);
  assert.equal(vd.name, `${AOV1}.ВД.pdf`);
  assert.match((await pdfPages(vd.pdf)).join(" "), /СМОНТИРОВАННОГО ЭЛЕКТРООБОРУДОВАНИЯ/);
  const rim = await renderBundlePdf(b, "rim", "ti", TI);
  assert.equal(rim.name, `${AOV1}.РМ.pdf`);
  assert.match((await pdfPages(rim.pdf)).join(" "), /применённых материалов/);
  const rp = await renderBundlePdf(b, "rp", "ti", TI);
  assert.equal(rp.name, `${AOV1}.РП.pdf`);
  const aosr = await renderBundlePdf(b, "aosr", "ti", TI);
  assert.equal(aosr.name, `${AOV1}.pdf`);
  const sbdVd = await renderBundlePdf(b, "vd", "ti", PrintOptions.parse({ formSet: "ti", forms: { vd: "sbd" } }));
  assert.match((await pdfPages(sbdVd.pdf)).join(" "), /Ведомость смонтированного оборудования, технических средств и материалов/, "форма ВД «СБД» в наборе «ТИ»");
});
