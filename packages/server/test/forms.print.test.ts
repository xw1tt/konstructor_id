// План 11: печать своих форм — через Office (подменён) и своими силами.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { closeBrowser } from "@idk/server/print/browser";
import { officeScript, renderForm, docxToHtml, type OfficeRunner } from "@idk/server/forms/convert";
import { docxText } from "@idk/server/forms/docx";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { startTestServer } from "./helpers/server.ts";
import { makeDocx, p, r } from "./helpers/docx.ts";
import { makePdf } from "./helpers/pdf.ts";
import { pdfPages } from "./helpers/pdftext.ts";

after(() => closeBrowser());
const bundle = async () => buildBundle(await readBook(aov1Book()), AOV1, defaultImportant()).bundle!;
const form = () => ({ file: "x.docx", type: "docx" as const, original: "x.docx", buf: makeDocx(p(r("Акт гидравлических испытаний № {Акт.Номер документа}"))) });

test("команда PowerShell: экранирование путей, экспорт в PDF", () => {
  const w = officeScript("docx", "C:\\Данные\\a'b.docx", "C:\\o.pdf");
  assert.match(w, /Word\.Application/);
  assert.ok(w.includes("Documents.Open('C:\\Данные\\a''b.docx',$false,$true)"), w);
  assert.ok(w.includes("ExportAsFixedFormat('C:\\o.pdf',17)"));
  assert.match(w, /finally\{\$w\.Quit\(\)\}/);
  const x = officeScript("xlsx", "C:\\a.xlsx", "C:\\o.pdf");
  assert.match(x, /Excel\.Application/);
  assert.ok(x.includes("ExportAsFixedFormat(0,'C:\\o.pdf')"));
});

test("без Office — своими силами, с предупреждением", async () => {
  const none: OfficeRunner = async () => false;
  const res = await renderForm(await bundle(), form(), { code: "АГИ" }, none);
  assert.equal(res.via, "html");
  assert.ok(res.warnings.includes("Word не найден — форма может отличаться от Word"));
  assert.match((await pdfPages(res.pdf)).join(" "), new RegExp(`${AOV1.replace(/\./g, "\\.")}\\.АГИ`));
  assert.equal(docxText(res.source), `Акт гидравлических испытаний № ${AOV1}.АГИ`);
});

test("через Office — PDF от Office, без предупреждения", async () => {
  const pdf = await makePdf(1, "OFFICE");
  const word: OfficeRunner = async (_k, _src, out) => { writeFileSync(out, pdf); return true; };
  const res = await renderForm(await bundle(), form(), { code: "АГИ" }, word);
  assert.equal(res.via, "word");
  assert.deepEqual(res.warnings, []);
  assert.match((await pdfPages(res.pdf))[0], /OFFICE/);
});

test("HTML из Word: объединение ячеек", () => {
  const html = docxToHtml(makeDocx(`<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${p(r("Шапка"))}</w:tc></w:tr></w:tbl>`));
  assert.match(html, /<td[^>]*colspan="2"[^>]*>[\s\S]*Шапка/);
});

test("API: задание печати своей формы — PDF и заполненный файл; ошибки", async () => {
  const none: OfficeRunner = async () => false;
  const s = await startTestServer({ officeRunner: none });
  const { json: t } = await s.req("POST", "/api/templates", { name: "ПИК" });
  const f = await (await s.raw("POST", `/api/templates/${t.id}/forms`, { body: form().buf as unknown as BodyInit, headers: { "x-file-name": "agi.docx" } })).json();
  await s.req("PUT", `/api/templates/${t.id}`, { name: "ПИК", docs: [{ kind: "custom", code: "АГИ", name: "Акт гидр. испытаний", form: f }, { kind: "builtin", doc: "aosr" }] });
  const job = await s.req("POST", "/api/form-jobs", { bundle: await bundle(), template: t.id, doc: "АГИ" });
  assert.equal(job.status, 201, JSON.stringify(job.json));
  assert.equal(job.json.via, "html");
  const pdf = await s.raw("GET", `/api/form-jobs/${job.json.id}`);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  await pdf.arrayBuffer();
  const src = await s.raw("GET", `/api/form-jobs/${job.json.id}/source`);
  assert.match(decodeURIComponent(src.headers.get("content-disposition") ?? ""), new RegExp(`Акт гидр\\. испытаний ${AOV1.replace(/\./g, "\\.")}\\.АГИ\\.docx`));
  assert.equal(docxText(Buffer.from(await src.arrayBuffer())), `Акт гидравлических испытаний № ${AOV1}.АГИ`);
  const noForm = await s.req("POST", "/api/form-jobs", { bundle: await bundle(), template: t.id, doc: "aosr" });
  assert.equal(noForm.status, 400);
  assert.equal(noForm.json.error, "У документа «АОСР» нет своей формы — печать встроенной");
  const noT = await s.req("POST", "/api/form-jobs", { bundle: await bundle(), template: "t-00000000-0000-0000-0000-000000000000", doc: "АГИ" });
  assert.equal(noT.status, 404);
  const fields = await s.req("POST", "/api/form-fields", { bundle: await bundle(), code: "АГИ" });
  assert.equal(fields.json.values["Акт.Номер документа"], `${AOV1}.АГИ`);
});

test("финальная проверка: скрипт Office ограничен по времени и закрывает только свои процессы", () => {
  const w = officeScript("docx", "C:\\a.docx", "C:\\o.pdf");
  assert.match(w, /Start-Job/);
  assert.match(w, /Wait-Job \$j -Timeout 55/);
  assert.match(w, /Get-Process WINWORD -ErrorAction SilentlyContinue \| Where-Object \{ \$_\.StartTime -gt \$t0 \} \| Stop-Process -Force/);
  assert.match(officeScript("xlsx", "C:\\a.xlsx", "C:\\o.pdf"), /Get-Process EXCEL/);
});

test("финальная проверка: ошибка удаления временной папки не ломает печать", async () => {
  const { removeQuietly } = await import("@idk/server/forms/convert");
  assert.doesNotThrow(() => removeQuietly("/proc/1/нет-такой-папки"));
});
