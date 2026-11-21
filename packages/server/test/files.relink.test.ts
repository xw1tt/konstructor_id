// 0.46.9: «Привязать сканы» — книга с другого компьютера: файлы находятся здесь по отпечатку и по имени в папке сканов.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { startTestServer } from "./helpers/server.ts";
import { tmpDir } from "./helpers/tmp.ts";
import { makePdf } from "./helpers/pdf.ts";

test("привязка: чужой номер — по имени в подпапке «Папки сканов»; затем ссылка с отпечатком; не найден — причина", async () => {
  const s = await startTestServer();
  const scans = tmpDir();
  mkdirSync(join(scans, "Сертификаты", "Кабель"), { recursive: true });
  writeFileSync(join(scans, "Сертификаты", "Кабель", "шнур зеленый.pdf"), await makePdf(2));
  // На этом компьютере под номером 1 — другой файл.
  const other = await s.raw("POST", "/api/files", {
    headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent("другой.pdf") },
    body: Buffer.from(await makePdf(1)),
  });
  const otherId = (await other.json()).id;
  const r = await s.req("POST", "/api/files/relink", {
    scanFolder: scans,
    items: [
      { link: `https://localhost:3443/api/files/${otherId}`, name: "шнур зеленый.pdf" },
      { link: `https://localhost:3443/api/files/${otherId}`, name: "другой.pdf" },
      { link: "https://localhost:3443/api/files/555", name: "https://localhost:3443/api/files/555" },
      { link: null, name: "нет такого.pdf" },
    ],
  });
  assert.equal(r.status, 200);
  const [a, b, c, d] = r.json.items;
  assert.equal(a.ok, true);
  assert.notEqual(a.id, otherId, "файл из папки положен в хранилище под своим номером");
  assert.equal(a.name, "шнур зеленый.pdf");
  assert.match(a.sha256, /^[0-9a-f]{64}$/);
  assert.equal(b.ok && b.id, otherId, "имя совпало — файл под этим номером и есть");
  assert.equal(c.ok, false);
  assert.match(c.message, /не найден на этом компьютере/);
  assert.equal(d.ok, false);
  // Новая ссылка с отпечатком открывается по отпечатку, даже с чужим номером.
  const file = await s.raw("GET", `/api/files/9999?sha=${a.sha256}`);
  assert.equal(file.status, 200);
  assert.equal((await s.req("GET", `/api/files/9999/pages?sha=${a.sha256}`)).json.pages, 2);
  assert.equal((await s.raw("GET", `/api/files/${otherId}?sha=${"0".repeat(64)}`)).status, 404, "отпечаток чужой — не подменяется файлом по номеру");
  const again = await s.req("POST", "/api/files/relink", {
    scanFolder: "",
    items: [{ link: `https://x/api/files/1?sha=${a.sha256}`, name: "переименован.pdf" }],
  });
  assert.equal(again.json.items[0].id, a.id);
});
