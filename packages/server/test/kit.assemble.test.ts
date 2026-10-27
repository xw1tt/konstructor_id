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
  // номер листа документа совпадает с «л.» реестра; титул, корешки и реестр — без номера
  for (const l of [1, 2, 3, 8]) assert.match(at(l), new RegExp(` ${l}$`), `лист ${l}`);
  assert.doesNotMatch(pages[0], / 1$/);
  // поверка — скан из двух листов
  const m = reg.match(/13 №С-АМ\/01-04-2024\/328195310 Свидетельство о поверке: Измеритель параметров электроустановок Ml3102Н CL от 15\.05\.2026 г\. до 14\.05\.2028 г\. 2 1 КУТ03-Р-ПИР-2-26-100-АОВ1\.01\.00 л\. (\d+)-(\d+)/);
  assert.ok(m, reg);
  assert.match(at(Number(m![1])), /p0 SCAN12/);
  assert.match(at(Number(m![2])), /p1 SCAN12/);
  // последняя страница — скан последней строки реестра
  assert.match(pages.at(-1)!, new RegExp(`SCAN${q.rows.length - 1}`));
});

test("номер листа — в правом нижнем углу, в том числе на повёрнутом скане", async () => {
  const { stampNumber } = await import("@idk/server/kit/assemble");
  const { PDFDocument, StandardFonts, degrees } = await import("pdf-lib");
  const { getDocument, Util } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  for (const angle of [0, 90, 180, 270]) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    page.setRotation(degrees(angle));
    stampNumber(page, 17, await doc.embedFont(StandardFonts.Helvetica));
    const pdf = await getDocument({ data: new Uint8Array(await doc.save()) }).promise;
    const p = await pdf.getPage(1);
    const vp = p.getViewport({ scale: 1 });
    const item: any = (await p.getTextContent()).items.find((i: any) => i.str === "17");
    const [, , , , x, y] = Util.transform(vp.transform, item.transform);
    // видимые координаты: x — от левого края, y — от верхнего
    assert.ok(x > vp.width * 0.85 && y > vp.height * 0.97, `поворот ${angle}: ${x.toFixed(0)},${y.toFixed(0)} из ${vp.width}x${vp.height}`);
  }
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
  // повторный запрос (окно предпросмотра открывает комплект по прямой ссылке) и скачивание
  const again = await s.raw("GET", `/api/kit-jobs/${ok.json.id}`);
  assert.equal(again.status, 200);
  assert.match(again.headers.get("content-disposition") ?? "", /^inline;/);
  const dl = await s.raw("GET", `/api/kit-jobs/${ok.json.id}?download=1`);
  assert.match(dl.headers.get("content-disposition") ?? "", /^attachment;/);
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

test("План 11: свой документ шаблона — в комплекте, номер листа как в реестре", async () => {
  const { makeDocx, p: para, r: run } = await import("./helpers/docx.ts");
  const s = await startTestServer({ officeRunner: async () => false });
  const { json: t } = await s.req("POST", "/api/templates", { name: "ПИК", from: "sbd" });
  const f = await (await s.raw("POST", `/api/templates/${t.id}/forms`, {
    body: makeDocx(para(run("АКТ ГИДРОИСПЫТАНИЙ {Акт.Номер документа}"))) as unknown as BodyInit, headers: { "x-file-name": "agi.docx" },
  })).json();
  const { json: tpl } = await s.req("PUT", `/api/templates/${t.id}`, { name: "ПИК", docs: [...t.docs, { kind: "custom", code: "АГИ", name: "Акт гидравлических испытаний", form: f }] });
  const r = kitRecords();
  r["Объект"].push({ "Поле": "Папка сканов", "Значение": scans });
  const book0 = await readBook(new MemoryWorkbook(r));
  r["РеестрИД"] = registryRows(book0, "1", tpl).rows.map((x) => x.values).filter((v) => !["Схема", "Поверка", "Лаборатория", "Документ качества"].includes(String(v["Вид"])));
  r["Комплекты"][0]["Титул"] = "нет";
  r["Комплекты"][0]["Корешки"] = "нет";
  const { request: q, issues } = buildKitRequest(await readBook(new MemoryWorkbook(r)), "1", defaultImportant(), tpl.id, undefined, new Date("2026-10-24"), tpl);
  assert.deepEqual(issues, []);
  const res = await s.req("POST", "/api/kit-jobs", q);
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const pages = await pdfPages(new Uint8Array(await (await s.raw("GET", `/api/kit-jobs/${res.json.id}`)).arrayBuffer()));
  const reg = pages.slice(0, pages.findIndex((x) => /Сдал:.*Принял:/.test(x)) + 1).join(" ").replace(/- /g, "-");
  const m = reg.match(/№[^ ]+\.АГИ Акт гидравлических испытаний .*? л\. (\d+)/);
  assert.ok(m, reg);
  const front = pages.findIndex((x) => /Сдал:.*Принял:/.test(x)) + 1;
  assert.match(pages[front + Number(m![1]) - 1], /АКТ ГИДРОИСПЫТАНИЙ .*\.АГИ/);
});

test("Excel комплекта: архив — по файлу .xlsx на каждый документ реестра (без сканов), по порядку", async () => {
  const { openZip } = await import("@idk/server/zip/zip");
  const s = await startTestServer();
  const q = await request();
  q.kit.cover = false;
  q.kit.spine = false;
  const r = await s.req("POST", "/api/kit-jobs", q);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const res = await s.raw("GET", `/api/kit-jobs/${r.json.id}/xlsx`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/zip");
  assert.match(decodeURIComponent(res.headers.get("content-disposition") ?? ""), /^attachment;.*Реестр №1 Том 1 Часть 1 \(Excel\)\.zip/);
  const names = [...openZip(new Uint8Array(await res.arrayBuffer())).keys()];
  const docs = q.rows.filter((x) => x.doc);
  assert.equal(names.length, docs.length, names.join(", "));
  assert.ok(names.every((n, i) => n.startsWith(String(i + 1).padStart(2, "0") + " ") && n.endsWith(".xlsx")), names.join(", "));
  assert.equal((await s.req("GET", "/api/kit-jobs/нет/xlsx")).status, 404);
});

test("общий реестр: комплекты подряд группами, сквозная нумерация, листы по документам, PDF и Excel; нет скана — предупреждение", async () => {
  const s = await startTestServer();
  const q1 = await request();
  const q2 = structuredClone(q1);
  q2.kit.number = "2";
  q2.kit.volume = "2";
  q2.rows[5].file = { name: "нет.pdf", link: null };
  q2.rows[5].sheets = 3;
  const r = await s.req("POST", "/api/common-registry-jobs", { kits: [q1, q2] });
  assert.equal(r.status, 201, JSON.stringify(r.json).slice(0, 300));
  assert.equal(r.json.kits, 2);
  assert.equal(r.json.docs, q1.rows.length * 2);
  assert.equal(r.json.warnings.length, 1);
  assert.match(r.json.warnings[0], /Реестр №2, строка .*Файл не найден/);
  const pdf = await pdfPages(new Uint8Array(await (await s.raw("GET", `/api/common-registry-jobs/${r.json.id}`)).arrayBuffer()));
  const all = pdf.join(" ");
  assert.match(all, /ОБЩИЙ РЕЕСТР ИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ/);
  assert.match(all, /Реестр №1\.[^ ]+ Том 1 Часть 1/);
  assert.match(all, /Реестр №2\.[^ ]+ Том 2 Часть 1/);
  assert.match(all, new RegExp(`Всего: комплектов 2, документов ${q1.rows.length * 2}`));
  const x = await s.raw("GET", `/api/common-registry-jobs/${r.json.id}/xlsx`);
  assert.match(decodeURIComponent(x.headers.get("content-disposition") ?? ""), /Общий реестр ИД\.xlsx/);
  const { readXlsx } = await import("./helpers/xlsxRead.ts");
  const sheet = readXlsx(new Uint8Array(await x.arrayBuffer())).sheets[0];
  // Номера строк — сквозные: последняя строка второго комплекта — 2×N.
  assert.ok(sheet.rows.some((row) => row.startsWith(`${q1.rows.length * 2} `)), "сквозная нумерация");
  assert.ok(sheet.text.includes("Сдал:") && sheet.text.includes("Принял:"));
  assert.equal((await s.req("GET", "/api/common-registry-jobs/нет")).status, 404);
});
