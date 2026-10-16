import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { exportToBook, exportLinks, writeBook, isEmptyExport, type ExportData } from "@idk/shared/workbook/migrate";

const ORIGIN = "https://localhost:3443";
const org = { id: 7, shortName: 'ООО "СБД"', fullName: "x", ogrn: "1", inn: "2", address: "a", phone: "", sroName: "", sroOgrn: "", sroInn: "" };
const exp = (): ExportData => ({
  object: { name: "Корпус", address: "", contractNumber: "", contractDate: "2026-01-02", city: "", roles: { developer: 7, builder: 7, designer: null, performer: null } },
  organizations: [org],
  sections: [],
  representatives: [{ id: 3, role: "performer", position: "Нач.", fullName: "Иванов", orgId: 7, authorityDoc: "пр.", nrsNumber: "", nrsDate: null, validFrom: null, validTo: null, sortOrder: 2, actText: "" }],
  materials: [{ id: 5, name: "Кабель", mark: "", article: "", manufacturer: "З", unit: "м." }, { id: 6, name: "Труба", mark: "", article: "", manufacturer: "З", unit: "м." }],
  qualityDocs: [{ id: 1, type: "passport", number: "№1", issueDate: "2025-05-09", validUntil: null, sheets: 1, fileId: 11, materialIds: [5, 6], registryName: "" }],
  acts: [],
  files: [{ id: 11, sha256: "x", name: "паспорт.pdf", mime: "application/pdf", size: 1, pages: 1 }],
});

test("пустая база — isEmptyExport", () => {
  assert.equal(isEmptyExport({ ...exp(), organizations: [], materials: [], qualityDocs: [] }), true);
  assert.equal(isEmptyExport(exp()), false);
});

test("перенос: ссылки ключами, даты серийными числами, роли подписями", async () => {
  const rows = exportToBook(exp(), ORIGIN);
  assert.deepEqual(rows["ДокументыКачества"]![0]["Материалы"], "Кабель; Труба");
  assert.equal(rows["ДокументыКачества"]![0]["Тип"], "Паспорт качества");
  assert.equal(rows["ДокументыКачества"]![0]["Дата"], 45786);
  assert.equal(rows["Представители"]![0]["Роль"], "Выполнивший работы");
  assert.equal(rows["Представители"]![0]["Организация"], 'ООО "СБД"');
});

test("скан документа качества — имя файла и ссылка /api/files/<id>", async () => {
  const wb = new MemoryWorkbook();
  await writeBook(wb, exportToBook(exp(), ORIGIN), exportLinks(exp(), ORIGIN));
  const b = await readBook(wb);
  const d = b.tables["ДокументыКачества"]![0];
  assert.equal(d.v.file, "паспорт.pdf");
  assert.equal(d.link.file, `${ORIGIN}/api/files/11`);
});

test("поля объекта пишутся в существующие строки «Поле»", async () => {
  const wb = new MemoryWorkbook({ "Объект": [{ "Поле": "Наименование объекта" }, { "Поле": "Город" }] });
  await writeBook(wb, exportToBook(exp(), ORIGIN), exportLinks(exp(), ORIGIN));
  const t = await wb.read("Объект");
  assert.deepEqual(t!.rows[0], ["Наименование объекта", "Корпус"]);
  const b = await readBook(wb);
  assert.equal(b.object.developer, 'ООО "СБД"');
  assert.equal(b.object.contractDate, "02.01.2026");
  assert.equal(t!.rows.filter((r) => r[0] === "Наименование объекта").length, 1);
});
