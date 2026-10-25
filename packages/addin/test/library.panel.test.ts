// План 16, задача 3: панель — «Добавить в книгу» и «В библиотеку» на модели книги и подменённом api.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { libKey, type LibKind, type LibRecord } from "@idk/shared/library/model";
import type { CellValue } from "@idk/shared/workbook/values";
import { addToBook, loadAll, sendToLibrary } from "@idk/addin/panel/library";
import type { LibraryApi } from "@idk/addin/panel/libraryApi";

/** Библиотека в памяти с тем же правилом ключа, что у сервера. */
function fakeApi(): LibraryApi & { recs: Map<string, LibRecord>; imports: string[] } {
  const recs = new Map<string, LibRecord>();
  const imports: string[] = [];
  return {
    recs, imports,
    list: async (kind) => [...recs.values()].filter((r) => r.kind === kind),
    save: async (kind: LibKind, values: Record<string, CellValue>, fileId) => {
      const id = `${kind}:${libKey(kind, values)}`;
      const created = !recs.has(id);
      recs.set(id, { id, kind, values, scan: fileId ? { sha256: String(fileId).padStart(64, "0"), name: `скан${fileId}.pdf`, mime: "application/pdf" } : recs.get(id)?.scan ?? null, updatedAt: "", updatedBy: "" });
      return { id, created };
    },
    importScan: async (sha) => { imports.push(sha); return { fileId: 100 + imports.length, name: "x.pdf" }; },
  };
}

const ORIGIN = "https://localhost:3443";

test("«В библиотеку» строк книги, затем «Добавить в книгу» в пустую книгу: строки, сканы, без дублей", async () => {
  const src = new MemoryWorkbook({
    "Организации": [{ "Краткое наименование": "ООО А", "ИНН": "1" }],
    "Представители": [{ "ФИО": "Иванов И.И.", "Организация": "ООО А", "Должность": "Прораб" }],
    "Материалы": [{ "Наименование": "Кабель", "Марка": "М", "Ед. изм.": "м." }, { "Наименование": "" , "Марка": "пусто" }],
    "ДокументыКачества": [{ "Материалы": "Кабель", "Тип": "Паспорт качества", "Номер": "№1", "Листов": 1 }],
  } as any);
  await src.write("ДокументыКачества", 0, { "Скан": "паспорт.pdf" }, { "Скан": `${ORIGIN}/api/files/7` });
  const api = fakeApi();
  const book = await readBook(src);
  assert.deepEqual(await sendToLibrary(book, "Материалы", [0, 1], api), { added: 1, updated: 0, empty: 1 });
  assert.deepEqual(await sendToLibrary(book, "Материалы", [0], api), { added: 0, updated: 1, empty: 0 });
  await sendToLibrary(book, "Организации", [0], api);
  await sendToLibrary(book, "Представители", [0], api);
  await sendToLibrary(book, "ДокументыКачества", [0], api);
  const doc = [...api.recs.values()].find((r) => r.kind === "doc")!;
  assert.equal(doc.scan?.sha256, "7".padStart(64, "0"), "fileId из ссылки скана");

  const dst = new MemoryWorkbook({}, { placeholder: true });
  const all = await loadAll(api);
  const picked = all.filter((r) => r.kind === "material" || r.kind === "rep");
  assert.deepEqual(await addToBook(dst, await readBook(dst), picked, all, api, ORIGIN), { added: 4, skipped: 0 });
  const b = await readBook(dst);
  assert.deepEqual(b.tables["Организации"]!.map((r) => r.v.shortName), ["ООО А"]);
  assert.deepEqual(b.tables["Представители"]!.map((r) => r.v.fullName), ["Иванов И.И."]);
  assert.deepEqual(b.tables["ДокументыКачества"]!.map((r) => [r.v.number, r.link.file]), [["№1", `${ORIGIN}/api/files/101`]]);
  assert.deepEqual(await addToBook(dst, await readBook(dst), picked, all, api, ORIGIN), { added: 0, skipped: 4 }, "повтор — без дублей");
  assert.equal((await readBook(dst)).tables["Материалы"]!.length, 1);
  await assert.rejects(sendToLibrary(b, "Акты", [0], api), /не хранится в библиотеке/);
});
