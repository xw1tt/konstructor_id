import { test } from "node:test";
import assert from "node:assert/strict";
import { extractNormativ, normKey, portalTarget, appendDesignation } from "@idk/shared/normativ";
import { loadTemplate, saveTemplate } from "@idk/shared/templates";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";

const P6 = 'Шифр рабочей документации: КУТ03-Р-ПИР-2-26-100-АОВ1.01.00 листы 0210-0230, рев.1 , СП 76.13330.2016 "Электротехнические устройства", ПУЭ "Правила устройства электроустановок" (6-е и 7-е издания), СП 77.13330.2016 "Системы автоматизации", СП 134.13330.2012 "Системы электросвязи зданий и сооружений. Основные положения проектирования".';

test("обозначения из п.6 акта АОВ1", () => {
  assert.deepEqual(extractNormativ(P6).map((x) => x.designation), ["СП 76.13330.2016", "ПУЭ", "СП 77.13330.2016", "СП 134.13330.2012"]);
  assert.deepEqual(extractNormativ(P6).map((x) => x.kind), ["СП", "ПУЭ", "СП", "СП"]);
});
test("ГОСТ Р, ГОСТ, ТР ТС, точка в конце, повтор", () => {
  assert.deepEqual(extractNormativ("по ГОСТ Р 50571.5.52-2011, ГОСТ 10434-82. ТР ТС 004/2011 и снова гост р 50571.5.52-2011.").map((x) => [x.designation, x.kind]),
    [["ГОСТ Р 50571.5.52-2011", "ГОСТ Р"], ["ГОСТ 10434-82", "ГОСТ"], ["ТР ТС 004/2011", "ТР"]]);
});
test("normKey", () => assert.equal(normKey(" сп76.13330.2016 "), normKey("СП 76.13330.2016")));
test("адрес портала", () => {
  assert.deepEqual(portalTarget({ designation: "СП 76.13330.2016", kind: "СП", link: "" }),
    { ok: true, url: "https://protect.gost.ru/sp?search=" + encodeURIComponent("СП 76.13330.2016") });
  assert.equal((portalTarget({ designation: "ГОСТ Р 1", kind: "ГОСТ Р", link: "" }) as any).url.startsWith("https://protect.gost.ru/gost?search="), true);
  assert.equal((portalTarget({ designation: "ТР ТС 004/2011", kind: "ТР", link: "" }) as any).url.startsWith("https://protect.gost.ru/tr?search="), true);
  assert.deepEqual(portalTarget({ designation: "ПУЭ", kind: "ПУЭ", link: "" }), { ok: false, message: "Нет на портале" });
  const d = "https://protect.gost.ru/sp/details/9fdcb635-708c-4c67-81a7-83e6baad9ab3";
  assert.deepEqual(portalTarget({ designation: "x", kind: "СП", link: d }), { ok: true, url: d });
});
test("чужие ссылки не открываются", () => {
  for (const link of ["http://protect.gost.ru/sp", "https://protect.gost.ru.evil.ru/x", "javascript:alert(1)", "https://example.com", "не ссылка"])
    assert.deepEqual(portalTarget({ designation: "x", kind: "СП", link }), { ok: false, message: "Можно открывать только страницы protect.gost.ru" });
});
test("шаблон: по умолчанию СБД, сохранение", async () => {
  const wb = new MemoryWorkbook();
  assert.equal(await loadTemplate(wb), "sbd");
  await wb.setSetting("idk.template", "zzz"); assert.equal(await loadTemplate(wb), "sbd");
  await saveTemplate(wb, "sbd"); assert.equal(await wb.setting("idk.template"), "sbd");
});
test("appendDesignation", () => {
  assert.equal(appendDesignation("", "СП 1.1"), "СП 1.1");
  assert.equal(appendDesignation("  ", "СП 1.1"), "СП 1.1");
  assert.equal(appendDesignation("СП 76.13330.2016.", "ГОСТ 10434-82"), "СП 76.13330.2016, ГОСТ 10434-82.");
  assert.equal(appendDesignation("ПУЭ", "ГОСТ 1-1"), "ПУЭ, ГОСТ 1-1");
  assert.equal(appendDesignation("по СП 76.13330.2016", "сп 76.13330.2016"), null);
  assert.equal(appendDesignation("СНиП 3.05.06-85", "СНиП 3.05.06-85"), null);
  assert.equal(appendDesignation("по СТО 123-2020 и ПУЭ", "сто 123-2020"), null);
  assert.equal(appendDesignation("СНиП 3.05.06-85", "СНиП 3.05.06"), "СНиП 3.05.06-85, СНиП 3.05.06");
  assert.equal(appendDesignation("по СНиП 3.05.06-85.", "СНиП 3.05.06-85"), null);
  assert.equal(appendDesignation("СТО 1.2.3", "СТО 1.2"), "СТО 1.2.3, СТО 1.2");
});
