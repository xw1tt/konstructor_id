// План 7: сборка комплекта АОВ1 в один PDF через сервер.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { registryRows } from "@idk/shared/kit/registry";
import { buildKitRequest, type KitRequest } from "@idk/shared/kit/request";
import { closeBrowser } from "@idk/server/print/browser";
import { pageRange, registryTitle, kitFileName } from "@idk/server/kit/assemble";
import { startTestServer } from "./helpers/server.ts";
import { pdfPages } from "./helpers/pdftext.ts";
import { makePdf, PNG_WIDE } from "./helpers/pdf.ts";
import { tmpDir } from "./helpers/tmp.ts";
import { kitRecords } from "../../shared/test/fixtures/kitBook.ts";

after(() => closeBrowser());

const scans = join(tmpDir(), "Сканы");
mkdirSync(scans);
writeFileSync(join(scans, "лого.png"), PNG_WIDE);

/** Задание сборки комплекта АОВ1: сканы — PDF по 1–3 страницы с меткой. */
async function request(patch: (r: any) => void = () => {}): Promise<KitRequest> {
  const r = kitRecords();
  r["Объект"].push({ "Поле": "Папка сканов", "Значение": scans });
  r["Организации"][2]["Логотип"] = "лого.png";
  r["Комплекты"][0]["Частей в томе"] = 3;
  const book0 = await readBook(new MemoryWorkbook(r));
  r["РеестрИД"] = registryRows(book0, "1").rows.map((x, i) => {
    if (x.values["Вид"] === "Схема" || x.values["Вид"] === "Поверка" || x.values["Вид"] === "Лаборатория" || x.values["Вид"] === "Документ качества") {
      x.values["Скан"] = `скан${i}.pdf`;
    }
    return x.values;
  });
  for (const [i, row] of r["РеестрИД"].entries()) if (row["Скан"]) writeFileSync(join(scans, `скан${i}.pdf`), await makePdf(i === 12 ? 2 : 1, `SCAN${i}`));
  patch(r);
  const { request, issues } = buildKitRequest(await readBook(new MemoryWorkbook(r)), "1", defaultImportant(), "sbd", undefined, new Date("2026-10-19"));
  assert.deepEqual(issues, []);
  return request!;
}

test("страницы и заголовок реестра", () => {
  assert.equal(pageRange(4, 1), "л. 4");
  assert.equal(pageRange(5, 2), "л. 5-6");
  const q = { kit: { number: "1", code: "К", volume: "1", part: "2" } } as KitRequest;
  assert.equal(registryTitle(q), "РЕЕСТР ПЕРЕДАЧИ ИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ №1.К Том №1, Часть №2");
  assert.equal(kitFileName(q.kit), "Реестр №1 Том 1 Часть 2.pdf");
});

test("комплект АОВ1: титул, корешки, реестр с «л.», документы по порядку", async () => {
  const s = await startTestServer();
  const q = await request();
  const r = await s.req("POST", "/api/kit-jobs", q);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const res = await s.raw("GET", `/api/kit-jobs/${r.json.id}`);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.match(decodeURIComponent(res.headers.get("content-disposition") ?? ""), /Реестр №1 Том 1 Часть 1\.pdf/);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (process.env.KIT_DUMP) writeFileSync(process.env.KIT_DUMP, buf);
  const pages = await pdfPages(buf);
  if (process.env.KIT_DUMP) pages.forEach((p, i) => console.log(`--- ${i}: ${p.slice(0, 600)}`));
  assert.equal(pages.length, r.json.pages);
  // титул
  assert.match(pages[0], /Исполнительная документация/);
  assert.match(pages[0], /Заказчик: ООО "СБД"/);
  assert.match(pages[0], /Подрядчик: ООО "Велесстрой"/);
  assert.match(pages[0], /Договор строительного подряда № КУТ03-Р-СМР-36-26/);
  assert.match(pages[0], /Том № 1/);
  assert.match(pages[0], /Москва/);
  assert.match(pages[0], /2026/);
  // корешки: три части на одном листе
  assert.match(pages[1], /Часть № 1.*Часть № 2.*Часть № 3/);
  // реестр — листы 3–4 (после титула и корешков), «Сдал/Принял» в конце
  assert.match(pages[2], /РЕЕСТР ПЕРЕДАЧИ ИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ №1\.КУТ03-Р-ПИР-2-26-100-АОВ1\.01\.00 Том №1, Часть №1/);
  assert.match(pages[2], /Объект: Корпус «В» в составе объекта/);
  assert.match(pages[2], /Подрядчик: ООО "Велесстрой", ОГРН 1087746466950/);
  assert.match(pages[2], /Основание для выполнения работ: Договор подряда №КУТ03-Р-СМР-36-26/);
  const front = pages.findIndex((p) => /Сдал:.*Принял:/.test(p)) + 1;
  assert.equal(front, 4);
  // перенос строки внутри шифра даёт «…-100- АОВ1» — склеиваем
  const reg = pages.slice(2, front).join(" ").replace(/- /g, "-");
  const at = (l: number) => pages[front + l - 1];
  // ВОР — л. 1-2, первые листы после реестра; АОСР — л. 3-4
  assert.match(reg, /1 б\/н Ведомость объемов выполненных работ 28\.07\.2026 г\. 2 1 КУТ03-Р-ПИР-2-26-100-АОВ1\.01\.00 л\. 1-2/);
  assert.match(at(1), /Ведомость|ВЕДОМОСТЬ|Наименование работ/);
  assert.match(reg, /2 №К32\.В\.СТ\.АОВ1\.01\.00\.1\.АОСР Акт освидетельствования скрытых работ Монтаж .* 28\.07\.2026 г\. 2 1 КУТ03-Р-ПИР-2-26-100-АОВ1\.01\.00 л\. 3-4/);
  assert.match(at(3), /Объект капитального строительства/);
  // первая схема — л. 8, и это её скан
  assert.match(reg, /5 №К32\.В\.СТ\.АОВ1\.01\.00\.1 Исполнительная схема Монтаж кабельных линий на этаже П5 в осях 27-13\/У-К 06\.06\.2026 г\. 1 1 КУТ03-Р-ПИР-2-26-100-АОВ1\.01\.00 л\. 8/);
  assert.match(at(8), /SCAN4/);
  // поверка — скан из двух листов
  const m = reg.match(/13 №С-АМ\/01-04-2024\/328195310 Свидетельство о поверке: Измеритель параметров электроустановок Ml3102Н CL от 15\.05\.2026 г\. до 14\.05\.2028 г\. 2 1 КУТ03-Р-ПИР-2-26-100-АОВ1\.01\.00 л\. (\d+)-(\d+)/);
  assert.ok(m, reg);
  assert.match(at(Number(m![1])), /p0 SCAN12/);
  assert.match(at(Number(m![2])), /p1 SCAN12/);
  // последняя страница — скан последней строки реестра
  assert.match(pages.at(-1)!, new RegExp(`SCAN${q.rows.length - 1}`));
});

test("ошибки файлов — 422 со строками реестра; без титула и корешков", async () => {
  const s = await startTestServer();
  const q = await request();
  q.rows[5].file = { name: "нет.pdf", link: null };
  q.logos.contractor = { name: "лого.pdf", link: null };
  const r = await s.req("POST", "/api/kit-jobs", q);
  assert.equal(r.status, 422);
  assert.equal(r.json.error, "Комплект не собран: исправьте ошибки");
  assert.deepEqual(r.json.issues, [
    { row: q.rows[5].row, column: "Скан", message: `Файл не найден: ${join(scans, "нет.pdf")}` },
    { row: null, column: "Логотип", message: `Файл не найден: ${join(scans, "лого.pdf")}` },
  ]);

  const q2 = await request();
  q2.kit.cover = false;
  q2.kit.spine = false;
  const ok = await s.req("POST", "/api/kit-jobs", q2);
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  const pages = await pdfPages(new Uint8Array(await (await s.raw("GET", `/api/kit-jobs/${ok.json.id}`)).arrayBuffer()));
  assert.match(pages[0], /РЕЕСТР ПЕРЕДАЧИ/);
  assert.equal((await s.req("GET", "/api/kit-jobs/нет")).status, 404);
});

test("тело задания больше 1 МБ принимается (несколько актов)", async () => {
  const s = await startTestServer();
  const q = await request();
  (q.kit as any).works = "x".repeat(1_500_000);
  q.kit.cover = false;
  q.kit.spine = false;
  const r = await s.req("POST", "/api/kit-jobs", q);
  assert.equal(r.status, 201, JSON.stringify(r.json).slice(0, 300));
});
