// Настройки бланков и предложения помощника по шаблону.
import { test } from "node:test";
import assert from "node:assert/strict";
import { blankKeyFor, blankView, blankDef, findBlankPart, describeBlank } from "@idk/shared/blanks";
import { getBlanks, validateBlankProposal, validatePrintProposal, findTemplateDoc } from "@idk/shared/ai/templateTools";
import { BUILTIN_TI, UserTemplate } from "@idk/shared/forms/template";
import { PrintOptions } from "@idk/shared/templates";

const kamchatka = UserTemplate.parse({ id: "t-1", name: "Камчатка", docs: BUILTIN_TI.docs, print: { formSet: "ti" } });

test("ключ бланка — по форме документа; кабельный журнал СБД и АОСР не настраиваются", () => {
  assert.equal(blankKeyFor("kj", { formSet: "ti" }), "kj:ti");
  assert.equal(blankKeyFor("kj", { formSet: "sbd" }), null);
  assert.equal(blankKeyFor("kj", { formSet: "sbd", forms: { kj: "ti" } }), "kj:ti");
  assert.equal(blankKeyFor("aosr", {}), null);
  assert.equal(blankKeyFor("rim", { formSet: "ti" }), "rim:ti");
  assert.equal(blankKeyFor("pav", {}), "pav");
  assert.ok(blankDef("pav")!.columns.length > 2);
});

test("вид бланка: скрытые графы, свои заголовки; основную графу скрыть нельзя", () => {
  const v = blankView("kj:ti", { hide: ["tray", "designation", "reserve"], headers: { mark: "Марка кабеля" } });
  assert.deepEqual(v.columns.map((c) => c.key), ["designation", "from", "to", "mark", "project", "fact", "smooth", "corrugated"]);
  assert.equal(v.columns.find((c) => c.key === "mark")!.header, "Марка кабеля");
  assert.equal(v.shown("reserve"), false);
  assert.equal(v.shown("total"), true);
  assert.deepEqual(describeBlank("kj:ti", { hide: ["tray", "reserve"], headers: { mark: "Марка кабеля" } }),
    ["без графы «Лоток»", "без «Строка «с учетом кф запаса»»", "графа «Марка» → «Марка кабеля»"]);
});

test("часть бланка по словам пользователя: «Лоток, м», «Труба гладкая, м», «строку с коэффициентом запаса»", () => {
  const d = blankDef("kj:ti")!;
  assert.equal(findBlankPart(d, "Лоток, м")!.key, "tray");
  assert.equal(findBlankPart(d, "Труба гладкая, м")!.key, "smooth");
  assert.equal(findBlankPart(d, "«Труба гофрированная, м»")!.key, "corrugated");
  assert.equal(findBlankPart(d, "строку с коэффициентом запаса 2%")!.key, "reserve");
  assert.equal(findBlankPart(d, "reserve")!.key, "reserve");
  assert.equal(findBlankPart(d, "Длина")?.key, undefined, "две графы «Длина…» — неоднозначно");
});

test("предложение помощника: шаблон «Камчатка» — КЖ без строки запаса и способов прокладки", () => {
  assert.equal(findTemplateDoc(kamchatka, "Кабельный журнал")!.kind, "kj");
  const r = validateBlankProposal(kamchatka, { doc: "КЖ", hide: ["Лоток, м", "Труба гладкая, м", "Труба гофрированная, м", "строка с коэффициентом запаса 2%"] });
  assert.ok(r.ok, !r.ok ? r.error : "");
  if (!r.ok) return;
  assert.deepEqual(r.change.after.blanks["kj:ti"], { hide: ["tray", "smooth", "corrugated", "reserve"], headers: {} });
  assert.equal(r.change.copy, false);
  assert.match(r.lines[0], /Шаблон «Камчатка», бланк «Кабельный журнал \(ТИ\)»: без графы «Лоток»; без графы «Труба гладкая»/);
  // Повтор того же — «ничего не меняется».
  const again = validateBlankProposal({ ...kamchatka, print: r.change.after }, { doc: "КЖ", hide: ["tray"] });
  assert.equal(again.ok, false);
  // Вернуть и сбросить.
  const back = validateBlankProposal({ ...kamchatka, print: r.change.after }, { doc: "КЖ", show: ["Лоток"], rename: { "Марка": "Марка, сечение" } });
  assert.ok(back.ok && back.change.after.blanks["kj:ti"].hide.length === 3 && back.change.after.blanks["kj:ti"].headers.mark === "Марка, сечение");
  const reset = validateBlankProposal({ ...kamchatka, print: r.change.after }, { doc: "КЖ", reset: true });
  assert.ok(reset.ok && !("kj:ti" in reset.change.after.blanks));
});

test("предложение: ошибки — нет документа, основная графа, своя форма, бланк по нормативу; встроенный шаблон — копия", () => {
  assert.match((validateBlankProposal(kamchatka, { doc: "ВОР", hide: ["Объем"] }) as any).error, /нет документа «ВОР»/);
  assert.match((validateBlankProposal(kamchatka, { doc: "КЖ", hide: ["Обозначение кабеля, провода"] }) as any).error, /скрыть нельзя/);
  assert.match((validateBlankProposal(kamchatka, { doc: "КЖ", hide: ["Цвет"] }) as any).error, /нет графы или строки «Цвет»/);
  assert.match((validateBlankProposal(kamchatka, { doc: "АОСР", hide: ["x"] }) as any).error, /нормативом/);
  const own = { ...kamchatka, docs: kamchatka.docs.map((d) => (d.kind === "builtin" && d.doc === "kj" ? { ...d, form: { file: "f.xlsx", type: "xlsx" as const, original: "КЖ.xlsx" } } : d)) };
  assert.match((validateBlankProposal(own, { doc: "КЖ", hide: ["Лоток"] }) as any).error, /своя форма из файла/);
  const ti = validateBlankProposal(BUILTIN_TI, { doc: "КЖ", hide: ["Лоток"] });
  assert.ok(ti.ok && ti.change.copy && ti.lines.some((l) => /будет создана копия «ТИ \(копия\)»/.test(l)));
});

test("настройки печати: набор, форма документа, запас, п.4 АОСР; сведения о бланках для модели", () => {
  const r = validatePrintProposal(kamchatka, { forms: { kj: "sbd" }, kjReserve: 5, schemeEach: true });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.change.after.forms, { kj: "sbd" });
  assert.equal(r.change.after.kjReserve, 5);
  assert.match(r.lines[0], /форма КЖ: СБД; запас кабеля в КЖ «ТИ»: 2% → 5%; п\.4 АОСР/);
  assert.equal(validatePrintProposal(kamchatka, { forms: { aosr: "ti" } }).ok, false);
  assert.equal(validatePrintProposal(kamchatka, {}).ok, false);
  const info = getBlanks({ ...kamchatka, print: PrintOptions.parse({ formSet: "ti", blanks: { "kj:ti": { hide: ["tray"] } } }) }, "КЖ") as any;
  assert.equal(info.documents[0].blank, "Кабельный журнал (ТИ)");
  assert.equal(info.documents[0].columns.find((c: any) => c.key === "tray").shown, false);
  assert.deepEqual(info.documents[0].changes, ["без графы «Лоток»"]);
  assert.match((getBlanks(kamchatka, "ВОР") as any).error, /нет документа/);
});
