// 0.35: формы .doc/.xls — перевод в .docx/.xlsx (Word/Excel на компьютере); файлы всех документов акта архивом.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isOle, legacyKind, legacyScript, toOpenXml, type LegacyConverter } from "@idk/server/forms/legacy";
import { openZip } from "@idk/server/zip/zip";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { startTestServer } from "./helpers/server.ts";
import { makeDocx, p, r } from "./helpers/docx.ts";
import { tmpDir } from "./helpers/tmp.ts";

/** Составной файл OLE с потоком WordDocument (достаточно для определения вида). */
const ole = (stream: string) => {
  const b = Buffer.alloc(2048);
  b.writeUInt32BE(0xd0cf11e0, 0);
  b.writeUInt32BE(0xa1b11ae1, 4);
  b.write(stream, 1024, "utf16le");
  return b;
};
const DOCX = makeDocx([p(r("АКТ")), p(r("освидетельствования скрытых работ"))].join(""));

/** Поддельный Word: «переводит», кладя заранее готовый .docx. */
const fakeWord =
  (calls: string[]): LegacyConverter =>
  async (kind, src, out) => {
    calls.push(kind);
    const dir = tmpDir();
    const f = join(dir, "x.docx");
    writeFileSync(f, DOCX);
    copyFileSync(f, out);
    return true;
  };

test("вид старого файла: по расширению и по потоку внутри; .docx — не старый", () => {
  assert.ok(isOle(ole("WordDocument")));
  assert.equal(legacyKind(ole("WordDocument")), "doc");
  assert.equal(legacyKind(ole("Workbook")), "xls");
  assert.equal(legacyKind(ole("x"), "Ведомость.XLS"), "xls");
  assert.equal(legacyKind(DOCX, "a.docx"), null);
  const sc = legacyScript("doc", "C:\\a'b.doc", "C:\\out.docx");
  assert.match(sc, /SaveAs2\('C:\\a''b\.doc'|SaveAs2\('C:\\out\.docx',16\)/);
  assert.match(legacyScript("xls", "a.xls", "b.xlsx"), /SaveAs\('b\.xlsx',51\)/);
});

test("перевод .doc: файл формы в .docx; без Word — понятная ошибка", async () => {
  const calls: string[] = [];
  const x = await toOpenXml(ole("WordDocument"), "АОСР 14.doc", fakeWord(calls));
  assert.equal(x.converted, true);
  assert.equal(x.name, "АОСР 14.docx");
  assert.deepEqual(calls, ["doc"]);
  const same = await toOpenXml(DOCX, "a.docx", fakeWord(calls));
  assert.equal(same.converted, false);
  await assert.rejects(
    toOpenXml(ole("Workbook"), "КЖ.xls", async () => false),
    /перевести \.xls в \.xlsx — нужен установленный Excel/,
  );
});

test("сервер: /api/forms/convert и распознавание .doc", async () => {
  const calls: string[] = [];
  const s = await startTestServer({ legacyConverter: fakeWord(calls) });
  const c = await s.req("POST", "/api/forms/convert", { file: ole("WordDocument").toString("base64"), name: "АОСР.doc" });
  assert.equal(c.status, 200, JSON.stringify(c.json));
  assert.equal(c.json.name, "АОСР.docx");
  assert.equal(c.json.converted, true);
  const t = (await s.req("POST", "/api/templates", { name: "Заказчик" })).json;
  const d = await s.req("POST", `/api/templates/${t.id}/recognize/detect`, { file: ole("WordDocument").toString("base64"), name: "АОСР.doc" });
  assert.equal(d.status, 200);
  assert.equal(d.json.kind, "aosr");
  assert.equal(d.json.name, "АОСР.docx");
  assert.ok(d.json.file, "переведённый файл — для следующих шагов");
  const bad = await startTestServer({ legacyConverter: async () => false });
  const e = await bad.req("POST", "/api/forms/convert", { file: ole("WordDocument").toString("base64"), name: "АОСР.doc" });
  assert.equal(e.status, 422);
  assert.match(e.json.error, /нужен установленный Word/);
});

test("файлы акта: своя форма — заполненный .docx, встроенный — .xlsx; ошибки — в списке; архив по ссылке", async () => {
  const s = await startTestServer();
  const b = buildBundle(await readBook(aov1Book()), AOV1, defaultImportant()).bundle!;
  const t = (await s.req("POST", "/api/templates", { name: "Заказчик" })).json;
  const form = makeDocx([p(r("АКТ № {Акт.Номер АОСР} от {Акт.Дата}"))].join(""));
  const up = await s.raw("POST", `/api/templates/${t.id}/forms`, { body: new Uint8Array(form), headers: { "x-file-name": encodeURIComponent("АОСР.docx") } });
  const ref = await up.json();
  const docs = [...t.docs.filter((d: any) => !(d.kind === "builtin" && d.doc === "aosr")), { kind: "builtin", doc: "aosr", form: ref }];
  assert.equal((await s.req("PUT", `/api/templates/${t.id}`, { ...t, docs })).status, 200);
  const res = await s.req("POST", "/api/act-files", {
    name: `Акт ${AOV1}`,
    items: [
      { bundle: b, kind: "aosr", form: { template: t.id, doc: "aosr" } },
      { bundle: b, kind: "vd", form: null },
      { bundle: b, kind: null, form: { template: t.id, doc: "НЕТ" } },
    ],
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.equal(res.json.files.length, 3, JSON.stringify(res.json));
  assert.match(res.json.files[0], /^01 АОСР .*\.docx$/);
  assert.match(res.json.files[1], /^02 .*\.xlsx$/);
  assert.equal(res.json.files[2], "Ошибки.txt");
  assert.equal(res.json.errors.length, 1);
  const zip = await s.raw("GET", `/api/act-files/${res.json.id}`);
  assert.equal(zip.headers.get("content-type"), "application/zip");
  const files = openZip(new Uint8Array(await zip.arrayBuffer()));
  const docx = openZip(new Uint8Array(files.get(res.json.files[0])!()));
  assert.match(docx.get("word/document.xml")!().toString("utf8"), new RegExp(`АКТ № ${AOV1.replace(/\./g, "\\.")}\\.АОСР от `));
  assert.equal((await s.raw("GET", "/api/act-files/nope")).status, 404);
});
