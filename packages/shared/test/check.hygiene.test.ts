// 0.51: проверка чистоты данных книги и «Убрать лишние пробелы».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { checkBook, fixSpaces, mixedWords } from "@idk/shared/check/hygiene";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

test("книга образца — без замечаний по данным, кроме допустимых", async () => {
  const w = checkBook(await readBook(new MemoryWorkbook(aov1Records() as any)));
  assert.ok(!w.some((x) => /пробел|нет в «Базе актов»|повторяется|опечатку/.test(x.message)), w.map((x) => x.message).join("\n"));
});

test("пробелы, чужой акт, дубль, перерасход, мусорный номер — находятся; пробелы убираются", async () => {
  const r: any = aov1Records();
  const m = r["Материалы"][0];
  m["Наименование"] = `${m["Наименование"]} `;
  r["Материалы"].push({ ...r["Материалы"][1] });
  r["МатериалыАктов"].push({ Акт: "старый-акт", Материал: r["Материалы"][2]["Наименование"], "Кол-во": 1 });
  const used = r["МатериалыАктов"].filter((x: any) => x["Акт"] === AOV1).at(-1);
  used["Кол-во"] = 5;
  r["Материалы"].find((x: any) => x["Наименование"].trim() === used["Материал"])["Кол-во по проекту"] = 1;
  r["Материалы"][4]["Док.1: вид"] = "Паспорт качества";
  r["Материалы"][4]["Док.1: номер"] = ",/y";
  const wb = new MemoryWorkbook(r);
  const w = checkBook(await readBook(wb)).map((x) => x.message);
  assert.ok(w.some((x) => /лишний пробел в конце/.test(x)));
  assert.ok(w.some((x) => /акта «старый-акт» нет в «Базе актов»/.test(x)));
  assert.ok(w.some((x) => /повторяется/.test(x)));
  assert.ok(w.some((x) => /перерасход/.test(x)));
  assert.ok(w.some((x) => /«,\/y» похож на опечатку/.test(x)));
  assert.equal(await fixSpaces(wb, await readBook(wb)), 1);
  assert.ok(!checkBook(await readBook(wb)).some((x) => /пробел/.test(x.message)));
});

test("смешанные буквы: «КRONE» и «орrанайзер» — да, «5е» и «нг(А)» — нет", () => {
  assert.deepEqual(mixedWords("110/КRONE, с орrанайзерами, Кат.5е, нг(А)-HF"), ["КRONE", "орrанайзерами"]);
});
