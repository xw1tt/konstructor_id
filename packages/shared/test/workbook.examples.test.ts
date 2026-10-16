import { test } from "node:test";
import assert from "node:assert/strict";
import { TABLES, TABLE_NAMES, OBJECT_FIELDS, SHEETS } from "@idk/shared/workbook/schema";
import { exampleRows, isExampleRow, isExampleValue, EXAMPLE_PREFIX } from "@idk/shared/workbook/examples";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";

test("у каждого столбца и поля объекта есть подсказка ≤ 255 и пример", () => {
  for (const t of TABLE_NAMES) for (const c of TABLES[t].columns) {
    assert.ok(c.hint && c.hint.length <= 255, `${t}.${c.header}`);
    if (c.type !== "formula" && c.type !== "file" && t !== "Объект") assert.notEqual(c.example, undefined, `${t}.${c.header}`);
  }
  for (const f of OBJECT_FIELDS) assert.ok(f.hint && f.hint.length <= 255 && f.example !== undefined, f.label);
});

test("признак примера", () => {
  assert.equal(EXAMPLE_PREFIX, "Пример: ");
  assert.equal(isExampleValue(" Пример: ООО"), true);
  assert.equal(isExampleValue("Примерно"), false);
  assert.equal(isExampleRow(["Технадзор застройщика", "Должность", "Пример: Иванов И.И."], "Представители", ["Роль", "Должность", "ФИО"]), true);
  assert.equal(isExampleRow(["Пример: роль?", "Должность", "Иванов И.И."], "Представители", ["Роль", "Должность", "ФИО"]), false);
});

test("книга из одних примеров — пустая для программы", async () => {
  const b = await readBook(new MemoryWorkbook(exampleRows()));
  for (const t of TABLE_NAMES.filter((x) => x !== "Объект")) assert.deepEqual(b.tables[t], [], t);
  assert.equal(b.object.name, null);
  assert.equal(b.object.developer, null);
});

test("пример-акт не печатается; без признака примеры связаны без висячих ссылок", async () => {
  const ex = exampleRows();
  const act = String(ex["Акты"]![0]["Номер акта"]);
  assert.ok(act.startsWith(EXAMPLE_PREFIX));
  assert.equal(buildBundle(await readBook(new MemoryWorkbook(ex)), act, defaultImportant()).issues[0].message,
    `Акт «${act}» не найден на листе «База актов»`);
  const plain = JSON.parse(JSON.stringify(ex).replaceAll(EXAMPLE_PREFIX, ""));
  const r = buildBundle(await readBook(new MemoryWorkbook(plain)), act.replace(EXAMPLE_PREFIX, ""), defaultImportant());
  assert.deepEqual(r.issues, []);
  assert.equal(r.bundle!.actMaterials.length, 1);
});

test("изменение не-ключевой ячейки примера оставляет строку примером", async () => {
  const wb = new MemoryWorkbook(exampleRows());
  await wb.write("Материалы", 0, { "Завод-изготовитель": "ООО Кабельный завод" });
  assert.deepEqual((await readBook(wb)).tables["Материалы"], []);
  await wb.write("Материалы", 0, { "Наименование": "Кабель ВВГнг(А)-LS 3х1,5" });
  assert.equal((await readBook(wb)).tables["Материалы"]!.length, 1);
});

test("листа «Нормативы» в схеме нет", () => {
  assert.equal(SHEETS.some((s) => (s.name as string) === "Нормативы"), false);
  assert.equal((TABLE_NAMES as string[]).includes("Нормативы"), false);
});

test("примеры записываются в свежую книгу (пустая строка таблиц, подписи «Объекта») на свои места", async () => {
  const { OBJECT_FIELDS: F } = await import("@idk/shared/workbook/schema");
  const { writeBook } = await import("@idk/shared/workbook/migrate");
  const wb = new MemoryWorkbook({ "Объект": F.map((f) => ({ "Поле": f.label })) }, { placeholder: true });
  await writeBook(wb, exampleRows(), {});
  const obj = await wb.read("Объект");
  assert.equal(obj!.rows.length, F.length);
  assert.ok(String(obj!.rows[0][1]).startsWith(EXAMPLE_PREFIX));
  const mats = await wb.read("Материалы");
  assert.equal(mats!.rows.length, 1);
  assert.ok(String(mats!.rows[0][0]).startsWith(EXAMPLE_PREFIX));
});

test("ревью: все поля «Объекта» из примеров — пустые для программы", async () => {
  const b = await readBook(new MemoryWorkbook(exampleRows()));
  for (const f of OBJECT_FIELDS) assert.equal(b.object[f.key], null, f.label);
});

test("ревью: замена ключа строки-примера делает её обычной, ссылки на примеры — ошибки проверки", async () => {
  const wb = new MemoryWorkbook(exampleRows());
  await wb.write("Акты", 0, { "Номер акта": "К32.ЭМ1.1" });
  const b = await readBook(wb);
  assert.equal(b.tables["Акты"]!.length, 1);
  const issues = buildBundle(b, "К32.ЭМ1.1", defaultImportant()).issues.map((i) => i.message);
  assert.ok(issues.some((m) => m.startsWith("Нет в таблице") && m.includes("Пример:")), issues.join(" | "));
});

test("ревью: в таблицах без ключа пример определяется по первой ссылке (акт)", async () => {
  const wb = new MemoryWorkbook(exampleRows());
  assert.equal(isExampleRow(["Пример: К1", "Схема"], "Схемы", ["Акт", "Вид"]), true);
  assert.equal(isExampleRow(["К1", "Схема", "Пример: x"], "Схемы", ["Акт", "Вид", "Номер"]), false);
  await wb.write("Схемы", 0, { "Акт": "К1" });
  assert.equal((await readBook(wb)).tables["Схемы"]!.length, 1);
});
