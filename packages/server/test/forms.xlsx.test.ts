// План 11: подстановка меток в .xlsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openZip } from "@idk/server/zip/zip";
import { readXlsx } from "@idk/server/xlsx/read";
import { fillXlsx } from "@idk/server/forms/xlsx";
import { FormError } from "@idk/server/forms/docx";
import type { FormData } from "@idk/shared/forms/fields";
import { makeXlsx } from "./helpers/xlsx.ts";

const data: FormData = {
  values: { "Акт.Номер": "1", "Объект.Заказчик": 'ООО "СБД" & <Ко>' },
  lists: {
    "Материалы": [
      { "Материал.Наименование": "Кабель", "Материал.Кол-во": "120,5" },
      { "Материал.Наименование": "Лоток", "Материал.Кол-во": "10" },
      { "Материал.Наименование": "Муфта", "Материал.Кол-во": "3" },
    ],
    "Схемы": [],
  },
};
const sheet = (buf: Buffer) => openZip(buf).get("xl/worksheets/sheet1.xml")!().toString("utf8");

test("метки в ячейках, спецсимволы", () => {
  const out = fillXlsx(makeXlsx({ "Л": [["Акт № {Акт.Номер}", "{Объект.Заказчик}"]] }), data);
  assert.deepEqual(readXlsx(out.buf).grid("Л"), [["Акт № 1", 'ООО "СБД" & <Ко>']]);
  assert.deepEqual(out.warnings, []);
});

test("повтор строки: числа, сдвиг строк ниже, объединения и области печати", () => {
  const src = makeXlsx({ "Л": [
    ["Шапка"], [], [], [],
    ["{#Материалы}{Материал.Наименование}", "{Материал.Кол-во}{/Материалы}"],
    ["Итого", null, "x"],
  ] }, { merges: ["A6:C6"], printArea: "'Л'!$A$1:$C$6" });
  const out = fillXlsx(src, data);
  const g = readXlsx(out.buf).grid("Л");
  assert.deepEqual(g.slice(4), [["Кабель", 120.5], ["Лоток", 10], ["Муфта", 3], ["Итого", null, "x"]]);
  assert.match(sheet(out.buf), /<mergeCell ref="A8:C8"\/>/);
  assert.match(openZip(out.buf).get("xl/workbook.xml")!().toString("utf8"), /\$A\$1:\$C\$8/);
});

test("пустой список убирает строку, нижние поднимаются", () => {
  const out = fillXlsx(makeXlsx({ "Л": [["Схемы"], ["{#Схемы}{Схема.Номер}{/Схемы}"], ["Конец"]] }), data);
  assert.deepEqual(readXlsx(out.buf).grid("Л"), [["Схемы"], ["Конец"]]);
});

test("неизвестная метка; не xlsx", () => {
  const out = fillXlsx(makeXlsx({ "Л": [["{Нет.Поля}"]] }, { shared: false }), data);
  assert.deepEqual(readXlsx(out.buf).grid("Л"), [["[нет поля: Нет.Поля]"]]);
  assert.deepEqual(out.warnings, ["Нет поля «Нет.Поля»"]);
  assert.throws(() => fillXlsx(new TextEncoder().encode("%PDF"), data), (e: unknown) => e instanceof FormError && e.message === "Это не файл Excel (.xlsx)");
});

test("цепочка вычислений удаляется вместе со ссылками на неё", async () => {
  const { writeZip } = await import("@idk/server/zip/zip");
  const base = openZip(makeXlsx({ "Л": [["{Акт.Номер}"]] }));
  const files: [string, Buffer][] = [...base].map(([k, g]) => [k, g()]);
  files.push(["xl/calcChain.xml", Buffer.from("<calcChain/>")]);
  const fix = (k: string, f: (s: string) => string) => { const i = files.findIndex(([n]) => n === k); files[i][1] = Buffer.from(f(files[i][1].toString())); };
  fix("xl/_rels/workbook.xml.rels", (s) => s.replace("</Relationships>", '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>'));
  fix("[Content_Types].xml", (s) => s.replace("/>", '><Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>'));
  const out = openZip(fillXlsx(writeZip(files), data).buf);
  assert.ok(!out.has("xl/calcChain.xml"));
  assert.doesNotMatch(out.get("xl/_rels/workbook.xml.rels")!().toString(), /calcChain/);
  assert.doesNotMatch(out.get("[Content_Types].xml")!().toString(), /calcChain/);
});
