// 0.33: оформление документа — схема, ключи, CSS поверх формы, описание отличий, готовые наборы.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDocStyle, cleanStyle, describeStyle, docStyleCss, isSampleStyle, STYLE_PRESETS, styleKeyFor, styleLabel } from "@idk/shared/docStyle";
import { PrintOptions } from "@idk/shared/templates";

test("ключ оформления: «вид:форма» у документов акта, вид — у протоколов", () => {
  assert.equal(styleKeyFor("aosr", {}), "aosr:sbd");
  assert.equal(styleKeyFor("vd", { formSet: "ti" }), "vd:ti");
  assert.equal(styleKeyFor("vd", { formSet: "sbd", forms: { vd: "ti" } }), "vd:ti");
  assert.equal(styleKeyFor("kj", { formSet: "ti" }), "kj:ti");
  assert.equal(styleKeyFor("aosr", { formSet: "ti" }), "aosr:sbd", "у АОСР одна форма");
  assert.equal(styleKeyFor("nope", {}), null);
  assert.equal(styleLabel("vd:ti"), "ВД (ТИ)");
});

test("образец — пусто: без стиля HTML не меняется; настройки печати без styles читаются", () => {
  assert.equal(docStyleCss({}), "");
  assert.equal(applyDocStyle("<html><body>x</body></html>", null), "<html><body>x</body></html>");
  assert.ok(isSampleStyle({ size: undefined }));
  assert.deepEqual(PrintOptions.parse({}).styles, {});
  assert.throws(() => cleanStyle({ size: 40 }), "кегль вне пределов");
});

test("CSS: шрифт, кегли, значения, поля — после стилей формы; линия значений следует за кеглем", () => {
  const html = applyDocStyle("<html><head><style>body{font-size:10pt}</style></head><body><p>x</p></body></html>", {
    font: "Arial",
    size: 12,
    tableSize: 9,
    headerSize: 8,
    valueBold: false,
    valueItalic: false,
    marginLeft: 25,
    orientation: "landscape",
  });
  const css = html.slice(html.indexOf('<style id="idk-doc-style">'));
  assert.ok(html.indexOf("idk-doc-style") > html.indexOf("<p>x</p>"), "последним в body");
  assert.match(css, /font-family: "Arial", "Liberation Sans"/);
  assert.match(css, /body \{ font-size: 12pt !important; \}/);
  assert.match(css, /table td, table td \* \{ font-size: 9pt !important; \}/);
  assert.match(css, /table th, table th \* \{ font-size: 8pt !important; \}/);
  assert.match(css, /font-weight: normal !important/);
  assert.match(css, /font-style: normal !important/);
  assert.match(css, /@page \{ size: A4 landscape; margin: 10mm 10mm 10mm 25mm; \}/);
  assert.match(css, /\.field \.val \{ line-height: 15\.60pt/, "12 пт × 1,3 — высота строки значения с линией");
  assert.doesNotMatch(css, /<script>/);
  assert.match(docStyleCss({ headerRotate: true }), /<script>.*idk-rot/s);
});

test("описание отличий и готовые наборы", () => {
  assert.deepEqual(describeStyle({ font: "Arial", size: 9.5, valueItalic: false, marginTop: 15 }), [
    "шрифт Arial",
    "текст 9,5 пт",
    "значения без курсива",
    "поля 15/—/—/— мм",
  ]);
  assert.equal(STYLE_PRESETS[0].label, "Как в образце");
  for (const p of STYLE_PRESETS) assert.deepEqual(cleanStyle(p.style), p.style, p.id);
});

test("помощник: propose_style — правка параметров, набор, сброс, ошибки; get_blanks показывает оформление", async () => {
  const { validateStyleProposal, getBlanks } = await import("@idk/shared/ai/templateTools");
  const { BUILTIN_SBD, UserTemplate } = await import("@idk/shared/forms/template");
  const t = UserTemplate.parse({ id: "t-1", name: "Объект", docs: BUILTIN_SBD.docs, print: {} });
  const r = validateStyleProposal(t, { doc: "АОСР", font: "Arial", size: "11", valueItalic: false }) as any;
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.change.after.styles, { "aosr:sbd": { font: "Arial", size: 11, valueItalic: false } });
  assert.match(r.lines[0], /оформление «АОСР \(СБД\)»: шрифт Arial; текст 11 пт; значения без курсива/);
  const t2 = { ...t, print: r.change.after };
  const back = validateStyleProposal(t2, { doc: "АОСР", font: null }) as any;
  assert.deepEqual(back.change.after.styles["aosr:sbd"], { size: 11, valueItalic: false });
  assert.match(back.lines[0], /\(было: шрифт Arial/);
  const preset = validateStyleProposal(t2, { doc: "ВД", preset: "compact" }) as any;
  assert.equal(preset.change.after.styles["vd:sbd"].size, 9);
  assert.equal(preset.change.after.styles["aosr:sbd"].font, "Arial", "другой документ не задет");
  const reset = validateStyleProposal(t2, { doc: "АОСР", reset: true }) as any;
  assert.deepEqual(reset.change.after.styles, {});
  assert.match((validateStyleProposal(t, { doc: "АОСР", size: 40 }) as any).error, /Неверное значение «size»/);
  assert.match((validateStyleProposal(t, { doc: "ХЗ" }) as any).error, /нет документа/);
  assert.match((validateStyleProposal(t, { doc: "АОСР", preset: "nope" }) as any).error, /Набора «nope» нет/);
  assert.match((validateStyleProposal(t, { doc: "АОСР" }) as any).error, /Ничего не меняется/);
  const g = getBlanks(t2, "АОСР") as any;
  assert.deepEqual(g.documents[0].style, ["шрифт Arial", "текст 11 пт", "значения без курсива"]);
});
