// 0.46: встроенный шаблон «Камчатка» — АОСР, реестр примененных материалов, реестр приложений, ВД и КЖ СКС по образцам.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { buildCableBundle } from "@idk/shared/workbook/cables";
import { PrintOptions } from "@idk/shared/templates";
import { BUILTIN_KAM, BUILTIN_TEMPLATES, isBuiltinTemplate } from "@idk/shared/forms/template";
import { registryRows } from "@idk/shared/kit/registry";
import { renderActDoc } from "@idk/server/print/docs";
import { renderActXlsx } from "@idk/server/print/xlsx/index";
import { buildDocDataFromBundle } from "@idk/server/print/fromBundle";
import { tiDocData } from "@idk/server/print/tiData";
import { renderBundlePdf } from "@idk/server/routes/print";
import { closeBrowser } from "@idk/server/print/browser";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { pdfPages } from "./helpers/pdftext.ts";

after(() => closeBrowser());

const KAM = PrintOptions.parse(BUILTIN_KAM.print);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bundle = async (patch: (r: any) => void = () => {}) => {
  const r: any = aov1Records();
  patch(r);
  const res = buildBundle(await readBook(new MemoryWorkbook(r)), AOV1, defaultImportant());
  assert.deepEqual(res.issues, []);
  return res.bundle!;
};

test("«Камчатка» — встроенный шаблон: АОСР, РПМ, РП, ВД, КЖ по набору «Камчатка»", () => {
  assert.ok(BUILTIN_TEMPLATES.includes(BUILTIN_KAM));
  assert.ok(isBuiltinTemplate("kam"));
  assert.equal(BUILTIN_KAM.name, "Камчатка");
  assert.equal(BUILTIN_KAM.print.formSet, "kam");
  assert.deepEqual(
    BUILTIN_KAM.docs.map((d) => d.kind === "builtin" && d.doc),
    ["aosr", "rim", "rp", "vd", "kj"],
  );
});

test("АОСР «Камчатка»: номер — номер акта; п.3 и приложения — ссылкой на реестры; п.4 — нумерованный список схем", async () => {
  const b = await bundle((r) => {
    r["Схемы"][0]["Наименование"] = "Исполнительная схема монтажа телекоммуникационных шкафов СКС1";
  });
  const d = buildDocDataFromBundle(b, "aosr", KAM);
  assert.equal(d.number, AOV1);
  assert.deepEqual(d.p3, ["Согласно реестра примененных материалов"]);
  assert.equal(d.p4[0], "1. Исполнительная схема монтажа телекоммуникационных шкафов СКС1");
  assert.equal(d.p4[1], "2. Исполнительная схема Монтаж кабельных линий на этаже П4 в осях 36-22/У-К");
  assert.equal(d.attachments, "Согласно реестру приложений");
  const { name } = renderActDoc(b, "aosr", KAM);
  assert.equal(name, `${AOV1}.pdf`);
});

test("реестр приложений «Камчатка»: ВД, схемы «Приложение N» с листами, документы качества; подписи полностью", async () => {
  const b = await bundle((r) => {
    r["Схемы"] = r["Схемы"].slice(0, 2).map((s: any, i: number) => ({ ...s, Номер: `Приложение ${i + 1}`, Листов: i ? 4 : 1 }));
  });
  const d = tiDocData(b, "kam");
  assert.equal(d.aosrNumber, `№${AOV1}`);
  assert.deepEqual(d.rp[0], { n: 1, type: "Ведомость смонтированного оборудования", date: d.actDate, number: `№${AOV1}`, sheets: 1 });
  assert.deepEqual(
    d.rp.slice(1, 3).map((r) => [r.number, r.sheets]),
    [
      ["Приложение 1", 1],
      ["Приложение 2", 4],
    ],
  );
  assert.match(d.rp[1].type, /^Исполнительная схема /);
  assert.ok(d.rp.length > 3, "за схемами — документы качества");
  assert.match(d.signs[3].label, /согласно части 2 статьи 53/);
  const { html, name } = renderActDoc(b, "rp", KAM);
  assert.equal(name, `${AOV1}.РП.pdf`);
  assert.match(html, />РЕЕСТР</);
  assert.match(html, />приложений</);
  assert.match(html, new RegExp(`к АОСР №${esc(AOV1)} от ${esc(d.actDate)}г\\.`));
  for (const g of ["Наименование документа", "Дата документа", "Номер документа", "Лист"]) assert.ok(html.includes(g), g);
});

test("реестр примененных материалов «Камчатка»: документ, под ним материалы — с маркой; без своего номера", async () => {
  const b = await bundle();
  const { html, name } = renderActDoc(b, "rim", KAM);
  assert.equal(name, `${AOV1}.РПМ.pdf`);
  assert.match(html, />примененных материалов</);
  assert.doesNotMatch(html, /РПМ<\/div>/);
  const d = tiDocData(b, "kam");
  const m = b.materials.find((x) => x.id === b.actMaterials[0].materialId)!;
  const mark = m.mark || m.article;
  if (mark)
    assert.ok(
      d.rm.some((g) => g.items.some((i) => i.name.endsWith(mark))),
      "марка в строке материала",
    );
});

test("ВД «Камчатка»: номер ведомости — номер акта, файл не совпадает с АОСР", async () => {
  const b = await bundle();
  const { html, name } = renderActDoc(b, "vd", KAM);
  assert.equal(name, `${AOV1}.ВД.pdf`);
  assert.match(html, new RegExp(`ВЕДОМОСТЬ № ${esc(AOV1)}<`));
  assert.ok(html.includes("Ед.изм") && html.includes("Примечание"));
});

test("КЖ СКС «Камчатка»: шкафы группами, ЗКУ / шкаф / п/панель / порт → розеточный модуль, итоги по маркам, «Сдал:»", async () => {
  const recs: any = aov1Records();
  const first = recs["КабельныйЖурнал"][0];
  recs["ДокументыКабелей"] = [{ Акт: AOV1, "Шифр журнала": "32/0997-01-СКС1" }];
  recs["КабельныйЖурнал"] = Array.from({ length: 4 }, (_, i) => ({
    ...first,
    Группа: i < 3 ? "Коммутационный шкаф ШТ113.1" : "Коммутационный шкаф ШТ113.2",
    "Обозначение кабеля, жгута, трубы": `Т113.1.1.${i + 1}`,
    "Кабель: марка, число жил, сечение": i < 3 ? "Кабель UTP кат. 5е" : "Кабель FTP кат. 5е",
    "Кабель: длина, м": i === 2 ? 0.5 : 70 + i,
    "Длина по проекту, м": 90,
    "№ ЗКУ": "ЗКУ 1-25.13",
    "№ шкафа": i < 3 ? "ШТ113.1" : "ШТ113.2",
    "№ п/панели": 1,
    "№ порта на панели": i + 1,
    "№ роз.модуля": `Т113.1.1.${i + 1}`,
  }));
  const res = buildCableBundle(await readBook(new MemoryWorkbook(recs)), AOV1, defaultImportant(), "kj", { set: "kam" });
  assert.deepEqual(res.issues, []);
  const b = res.bundle!;
  const kj = await renderBundlePdf(b, "kj", "kam", KAM);
  const text = (await pdfPages(kj.pdf)).join(" ");
  assert.match(text, /Кабельный журнал №32\/0997-01-СКС1/);
  for (const s of ["№ ЗКУ", "№ шкафа", "№ п/панели", "№ порта", "№ роз.модуля", "Коммутационный шкаф ШТ113.2", "ЗКУ 1-25.13", "Сдал:"])
    assert.ok(text.includes(s), s);
  assert.match(text, /Кабель UTP кат\. 5е\s+270\s+141,5/, "итог марки: по проекту 3×90, факт 70+71+0,5");
  assert.doesNotMatch(text, /Принял:/);
  const x = renderActXlsx(b, "kj", KAM);
  assert.ok(x.xlsx.length > 1000);
});

test("реестр ИД комплекта по «Камчатке»: АОСР, РПМ, РП, ВД — номера от номера акта", async () => {
  const { kitRecords } = await import("../../shared/test/fixtures/kitBook.ts");
  const r = registryRows(await readBook(new MemoryWorkbook(kitRecords())), "1", BUILTIN_KAM).rows.map((x) => x.values);
  const by = (k: string) => r.filter((x) => x["Вид"] === k)[0];
  assert.deepEqual(r.map((x) => x["Вид"]).slice(0, 4), ["АОСР", "РИМ", "РП", "ВД"]);
  assert.equal(by("ВД")["Номер документа"], `№${AOV1}`);
  assert.equal(by("ВД")["Наименование"], "Ведомость смонтированного оборудования");
  assert.match(String(by("РИМ")["Наименование"]), /^Реестр примененных материалов к АОСР/);
});

test("0.46.3: «Камчатка» в Word — АОСР, реестр примененных материалов, реестр приложений по образцам; ВД и КЖ — Excel", async () => {
  const { docFile } = await import("@idk/server/kit/xlsx");
  const { docxText } = await import("@idk/server/forms/docx");
  const b = await bundle((r) => {
    r["Схемы"] = r["Схемы"].slice(0, 2).map((s: any, i: number) => ({ ...s, Номер: `Приложение ${i + 1}`, Листов: i ? 4 : 1 }));
  });
  const file = (kind: "aosr" | "rim" | "rp" | "vd") => docFile(b, { kind, form: null }, KAM, {});
  const aosr = file("aosr");
  assert.equal(aosr.name, `${AOV1}.docx`);
  const t = docxText(aosr.buf);
  assert.doesNotMatch(t, /\{|нет поля/, "все метки заполнены");
  assert.ok(t.includes(AOV1));
  assert.ok(t.includes("Согласно реестра примененных материалов"));
  assert.ok(t.includes("Согласно реестру приложений"));
  assert.match(t, /1\. Исполнительная схема/);
  assert.ok(!t.includes("Аносов") && !t.includes("Спектрум"), "данных образца не осталось");
  const rim = file("rim");
  assert.equal(rim.name, `${AOV1}.РПМ.docx`);
  const rt = docxText(rim.buf);
  assert.doesNotMatch(rt, /\{|нет поля/);
  assert.ok(rt.includes("Паспорт качества") && rt.includes(`к АОСР №${AOV1}`));
  assert.ok(!rt.includes("Шкаф напольный"));
  const rp = docxText(file("rp").buf);
  assert.doesNotMatch(rp, /\{|нет поля/);
  assert.ok(rp.includes("Ведомость смонтированного оборудования") && rp.includes("Приложение 2"));
  assert.match(file("vd").name, /\.ВД\.xlsx$/);
});

test("0.46.4: Word «Камчатки» открывается без восстановления — в каждой ячейке есть абзац, закладки парные", async () => {
  const { docFile } = await import("@idk/server/kit/xlsx");
  const { openZip } = await import("@idk/server/zip/zip");
  const b = await bundle();
  for (const kind of ["aosr", "rim", "rp"] as const) {
    const xml = openZip(docFile(b, { kind, form: null }, KAM, {}).buf).get("word/document.xml")!().toString("utf8");
    const stack: boolean[] = [];
    let empty = 0;
    for (const m of xml.matchAll(/<(\/?)w:(tc|p)(?=[\s>/])[^>]*?(\/?)>/g)) {
      if (m[2] === "tc") {
        if (!m[1]) stack.push(false);
        else if (!stack.pop()) empty++;
      } else if (!m[1] && stack.length) stack[stack.length - 1] = true;
    }
    assert.equal(empty, 0, `${kind}: пустые ячейки таблицы`);
    const ids = (re: RegExp) => [...xml.matchAll(re)].map((x) => x[1]).sort();
    assert.deepEqual(ids(/<w:bookmarkStart[^>]*w:id="(\d+)"/g), ids(/<w:bookmarkEnd[^>]*w:id="(\d+)"/g), `${kind}: закладки`);
  }
});

test("0.46.5–0.46.6: длинное значение — по строкам бланка: первая уже (рядом с подписью поля), не влезшее — в новые строки", async () => {
  const { wrapToRows } = await import("@idk/server/forms/docx");
  assert.deepEqual(wrapToRows("раз два три четыре", [8, 12]), ["раз два", "три четыре"]);
  assert.deepEqual(wrapToRows("раз два три четыре пять шесть", [8, 12]), ["раз два", "три четыре", "пять шесть"], "не влезло — дополнительная строка");
  assert.deepEqual(wrapToRows("1. Схема А\n2. Схема Б\n3. Схема В", [40, 40]), ["1. Схема А", "2. Схема Б", "3. Схема В"]);
  assert.deepEqual(wrapToRows("коротко", [10, 10, 10]), ["коротко", "", ""]);
  const { docFile } = await import("@idk/server/kit/xlsx");
  const { docxText } = await import("@idk/server/forms/docx");
  const b = await bundle();
  const t = docxText(docFile(b, { kind: "aosr", form: null }, KAM, {}).buf);
  assert.doesNotMatch(t, /@\d+:\d+|\{/, "метки строк заполнены");
  assert.ok(t.includes(b.object.name.split(" ").slice(0, 3).join(" ")));
});

test("0.46.6: строки бланка АОСР — лишние пустые убираются, не влезшее — новые строки с подчёркиванием; подписи не разрываются", async () => {
  const { docFile } = await import("@idk/server/kit/xlsx");
  const { openZip } = await import("@idk/server/zip/zip");
  const { elements } = await import("@idk/server/forms/docx");
  const b = await bundle();
  const xml = openZip(docFile(b, { kind: "aosr", form: null }, KAM, {}).buf).get("word/document.xml")!().toString("utf8");
  // Каждая строка значения — в своей строке бланка (с подчёркиванием), без переносов внутри строки.
  assert.equal((xml.match(/<w:br\/>/g) ?? []).length, 0);
  for (const name of ["rim", "rp", "aosr"] as const) {
    const x = openZip(docFile(b, { kind: name, form: null }, KAM, {}).buf).get("word/document.xml")!().toString("utf8");
    const all = elements(x, "p");
    const last = all.slice(-6).map(({ start, end }) => x.slice(start, end));
    assert.ok(
      last.slice(0, -1).some((p) => p.includes("<w:keepNext/>")),
      `${name}: подписи держатся вместе`,
    );
  }
});

test("0.46.8: PDF «Камчатки» (АОСР, реестры) — из того же файла Word через Word; без Word — встроенная форма", async () => {
  const { setPrintOfficeRunner } = await import("@idk/server/routes/print");
  const { writeFileSync } = await import("node:fs");
  const b = await bundle();
  const seen: string[] = [];
  setPrintOfficeRunner(async (kind, _src, out) => {
    seen.push(kind);
    writeFileSync(out, Buffer.from(`%PDF-word-${seen.length}`));
    return true;
  });
  try {
    const a = await renderBundlePdf(b, "aosr", "kam", KAM);
    assert.equal(a.pdf.toString(), "%PDF-word-1");
    assert.equal(a.name, `${AOV1}.pdf`);
    assert.equal((await renderBundlePdf(b, "aosr", "kam", KAM)).pdf.toString(), "%PDF-word-1", "тот же файл — из памяти, Word не запускается");
    assert.equal((await renderBundlePdf(b, "rp", "kam", KAM)).pdf.toString(), "%PDF-word-2");
    assert.deepEqual(seen, ["docx", "docx"]);
    setPrintOfficeRunner(async () => false);
    const html = await renderBundlePdf(b, "rim", "kam", KAM);
    assert.equal(html.pdf.subarray(0, 4).toString(), "%PDF", "Word не найден — встроенная форма");
    assert.ok(html.pdf.length > 1000);
  } finally {
    setPrintOfficeRunner(null);
  }
});

test("0.46.12: «Камчатка» — материалов не больше 5: п.3 АОСР — материалы с документами, а не ссылка на реестр", async () => {
  const many = await bundle();
  assert.ok(many.actMaterials.length > 5);
  const few = await bundle((r) => {
    const mine = r["МатериалыАктов"].filter((m: any) => m["Акт"] === AOV1);
    r["МатериалыАктов"] = [...r["МатериалыАктов"].filter((m: any) => m["Акт"] !== AOV1), ...mine.slice(0, 2)];
    const kept = new Set(mine.slice(0, 2).map((m: any) => m["Материал"]));
    if (r["ВОР"]) r["ВОР"] = r["ВОР"].filter((v: any) => kept.has(v["Материал"]));
  });
  assert.equal(few.actMaterials.length, 2);
  const p3 = buildDocDataFromBundle(few, "aosr", KAM).p3;
  assert.equal(p3.length, 2);
  assert.ok(!p3.some((l) => /Согласно реестр/.test(l)));
  const name = few.materials.find((m) => m.id === few.actMaterials[0].materialId)!.name;
  assert.ok(p3.some((l) => l.startsWith(name)));
});

test("0.50: оформление Word «Камчатки» — шрифт, размер от основного, значения, поля, ориентация; без оформления — меток нет", async () => {
  const { docFile } = await import("@idk/server/kit/xlsx");
  const { openZip } = await import("@idk/server/zip/zip");
  const b = await bundle();
  const xml = (buf: Buffer) => openZip(buf).get("word/document.xml")!().toString("utf8");
  const plain = xml(docFile(b, { kind: "aosr", form: null }, KAM, {}).buf);
  assert.doesNotMatch(plain, /[]/, "метки значений сняты");
  const { styleKeyFor } = await import("@idk/shared/docStyle");
  const styled = {
    ...KAM,
    styles: {
      [styleKeyFor("aosr", KAM)!]: { font: "Arial" as const, size: 12, valueBold: true, valueItalic: false, marginLeft: 30, orientation: "landscape" as const },
    },
  };
  const out = docFile(b, { kind: "aosr", form: null }, styled, {});
  const x = xml(out.buf);
  assert.doesNotMatch(x, /[]/);
  assert.match(x, /<w:rFonts w:ascii="Arial"/);
  assert.match(x, /w:orient="landscape"/);
  assert.match(x, /<w:pgMar\b[^>]*w:left="1701"/);
  // Значение (номер акта) — жирным без курсива, отдельным прогоном.
  const run = [...x.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)].find((m) => m[1].includes(AOV1))![1];
  assert.match(run, /<w:b\/>/);
  assert.match(run, /<w:i w:val="0"\/>/);
  // Порядок в w:rPr по схеме: rFonts раньше b, b раньше sz.
  for (const r of x.matchAll(/<w:rPr>([\s\S]*?)<\/w:rPr>/g)) {
    const at = (t: string) => r[1].search(new RegExp(`<w:${t}\\b`));
    if (at("rFonts") >= 0 && at("b") >= 0) assert.ok(at("rFonts") < at("b"), r[1]);
    if (at("b") >= 0 && at("sz") >= 0) assert.ok(at("b") < at("sz"), r[1]);
  }
  const { docxText } = await import("@idk/server/forms/docx");
  assert.equal(docxText(out.buf), docxText(docFile(b, { kind: "aosr", form: null }, KAM, {}).buf), "текст тот же");
});

test("0.50: оформление своей формы Excel — шрифт, размер в пропорции, поля и ориентация листа", async () => {
  const { styleXlsxFonts, styleXlsxSheet } = await import("@idk/server/forms/xlsx");
  const fonts = '<fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>';
  const f = styleXlsxFonts(fonts, { font: "Arial", size: 12 });
  assert.match(f, /<sz val="12"\/><name val="Arial"\/>/);
  assert.match(f, /<b\/><sz val="17"\/><name val="Arial"\/>/, "заголовок крупнее в той же пропорции");
  const sheet =
    '<worksheet><sheetData></sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9"/></worksheet>';
  const x = styleXlsxSheet(sheet, { marginLeft: 25.4, orientation: "landscape" });
  assert.match(x, /left="1"/);
  assert.match(x, /<pageSetup orientation="landscape" paperSize="9"\/>/);
  const bare = styleXlsxSheet('<worksheet><sheetData></sheetData><drawing r:id="x"/></worksheet>', { marginTop: 10 });
  assert.match(bare, /<\/sheetData><pageMargins [^>]*top="0\.394"[^>]*\/><drawing/);
});
