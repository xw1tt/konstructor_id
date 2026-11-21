// План 7: сканы комплекта — поиск файла и загрузка страниц.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import { PDFDocument } from "pdf-lib";
import { openDb } from "@idk/server/db";
import { saveFile } from "@idk/server/files/store";
import { resolveScan, loadScan } from "@idk/server/kit/files";
import { tmpDir } from "./helpers/tmp.ts";
import { makePdf, PNG_WIDE } from "./helpers/pdf.ts";

const dir = tmpDir();
const scans = join(dir, "Сканы");
mkdirSync(scans);
writeFileSync(join(scans, "схема 1.pdf"), await makePdf(2));
writeFileSync(join(scans, "лого.png"), PNG_WIDE);
writeFileSync(join(scans, "битый.pdf"), "не pdf");
writeFileSync(join(scans, "письмо.docx"), "x");
const db = openDb(join(dir, "db.sqlite"));
const ctx = { db, dataDir: dir, scanFolder: scans };

test("имя в папке сканов, полный путь, ссылка на файл сервера", async () => {
  assert.deepEqual(resolveScan({ name: "схема 1.pdf", link: null }, ctx), { ok: true, path: join(scans, "схема 1.pdf"), mime: "application/pdf" });
  assert.deepEqual(resolveScan({ name: join(scans, "лого.png"), link: null }, { ...ctx, scanFolder: "" }), {
    ok: true,
    path: join(scans, "лого.png"),
    mime: "image/png",
  });
  const f = await saveFile(db, dir, Readable.from([Buffer.from(await makePdf(3))]), { name: "a.pdf", mime: "application/pdf" }, 1e7);
  const r = resolveScan({ name: "a.pdf", link: `https://localhost:3443/api/files/${f.id}` }, { ...ctx, scanFolder: "" });
  assert.equal(r.ok, true);
  assert.equal((await loadScan(r as any)).getPageCount(), 3);
});

test("ошибки поиска файла", () => {
  const msg = (name: string, c = ctx, link: string | null = null) => (resolveScan({ name, link }, c) as { message: string }).message;
  assert.equal(msg(""), "Нет скана: укажите файл в столбце «Скан»");
  assert.equal(msg("письмо.docx"), "Поддерживаются только PDF, JPG и PNG: письмо.docx");
  assert.equal(msg("нет.pdf"), `Файл не найден: ${join(scans, "нет.pdf")} (искали и в подпапках)`);
  assert.match(msg("схема 1.pdf", { ...ctx, scanFolder: " " }), /Скан «схема 1\.pdf» не найден на этом компьютере\. Укажите «Папка сканов»/);
  // 0.46.9: номера файла нет на этом компьютере — файл ищется по имени из ячейки.
  assert.match(msg("x.pdf", ctx, "https://localhost:3443/api/files/999"), /Файл не найден: .*x\.pdf/);
  assert.match(msg("", ctx, "https://localhost:3443/api/files/999"), /не найден на этом компьютере/);
});

test("страницы: PDF как есть, картинка — альбомный А4, битый PDF — ошибка", async () => {
  assert.equal((await loadScan({ path: join(scans, "схема 1.pdf"), mime: "application/pdf" })).getPageCount(), 2);
  const img = await loadScan({ path: join(scans, "лого.png"), mime: "image/png" });
  const { width, height } = img.getPage(0).getSize();
  assert.ok(width > height);
  await assert.rejects(loadScan({ path: join(scans, "битый.pdf"), mime: "application/pdf" }), /PDF повреждён или не читается/);
  // PDF с шифрованием: в словаре trailer есть /Encrypt
  const plain = await PDFDocument.create();
  plain.addPage();
  const bytes = Buffer.from(await plain.save({ useObjectStreams: false }))
    .toString("latin1")
    .replace("trailer\n<<", "trailer\n<<\n/Encrypt 1 0 R");
  writeFileSync(join(scans, "защищён.pdf"), Buffer.from(bytes, "latin1"));
  await assert.rejects(loadScan({ path: join(scans, "защищён.pdf"), mime: "application/pdf" }), /PDF защищён паролем/);
});

test("0.46.9: книга с другого компьютера — номер файла чужой: по имени из ячейки в папке сканов (с подпапками), по отпечатку", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const sub = join(scans, "Паспорта", "Кабель");
  mkdirSync(sub, { recursive: true });
  const passport = Buffer.from(await makePdf(2));
  writeFileSync(join(sub, "паспорт кабеля.pdf"), passport);
  // На этом компьютере под номером — совсем другой файл.
  const other = await saveFile(db, dir, Readable.from([Buffer.from(await makePdf(1))]), { name: "чужой.pdf", mime: "application/pdf" }, 1e7);
  const link = `https://localhost:3443/api/files/${other.id}`;
  assert.deepEqual(resolveScan({ name: "паспорт кабеля.pdf", link }, ctx), { ok: true, path: join(sub, "паспорт кабеля.pdf"), mime: "application/pdf" });
  // Имя совпадает с файлом под номером — он и берётся.
  assert.equal((resolveScan({ name: "чужой.pdf", link }, ctx) as { path: string }).path.includes(other.sha256), true);
  // Ссылка с отпечатком: файла в хранилище нет — находится в папке по содержимому, даже под другим именем.
  const sha = createHash("sha256").update(passport).digest("hex");
  assert.deepEqual(resolveScan({ name: "переименован.pdf", link: `https://localhost:3443/api/files/77?sha=${sha}` }, ctx), {
    ok: true,
    path: join(sub, "паспорт кабеля.pdf"),
    mime: "application/pdf",
  });
  // Два разных файла с одним именем в разных подпапках — не угадываем.
  const two = join(dir, "Два");
  mkdirSync(join(two, "а"), { recursive: true });
  mkdirSync(join(two, "б"), { recursive: true });
  writeFileSync(join(two, "а", "паспорт.pdf"), Buffer.from(await makePdf(1)));
  writeFileSync(join(two, "б", "паспорт.pdf"), Buffer.from(await makePdf(4)));
  const r = resolveScan({ name: "паспорт.pdf", link: null }, { ...ctx, scanFolder: two }) as { ok: boolean; message: string };
  assert.equal(r.ok, false);
  assert.match(r.message, /несколько разных файлов «паспорт\.pdf»/);
  // Несколько папок — через «;».
  assert.equal(resolveScan({ name: "паспорт кабеля.pdf", link: null }, { ...ctx, scanFolder: `${two}; ${scans}` }).ok, true);
});
