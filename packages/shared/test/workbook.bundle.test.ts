import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { aov1Book, aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

const build = async (wb: MemoryWorkbook, n = AOV1) => buildBundle(await readBook(wb), n, defaultImportant());
const withRecords = (patch: (r: any) => void) => { const r = aov1Records() as any; patch(r); return new MemoryWorkbook(r); };

test("пакет контрольного акта собирается без ошибок", async () => {
  const { bundle, issues } = await build(aov1Book());
  assert.deepEqual(issues, []);
  assert.equal(bundle!.actMaterials.length, 20);
  assert.equal(bundle!.documents.filter((d) => d.kind === "scheme").length, 6);
  assert.equal(bundle!.act.date, "2026-07-28");
  assert.equal(bundle!.act.baseNumber, AOV1);
  assert.equal(bundle!.representatives.filter((r) => r.role === "performer").length, 2);
  assert.equal(bundle!.vor.length, 73);
  assert.equal(bundle!.object.roles.developer, bundle!.organizations.find((o) => o.shortName === 'ООО "СБД"')!.id);
  assert.equal(bundle!.qualityDocs[0].materialIds.length, 1);
  assert.ok(bundle!.qualityDocs.some((q) => q.materialIds.length > 1));
});

test("нет акта", async () => {
  const { bundle, issues } = await build(aov1Book(), "X");
  assert.equal(bundle, null);
  assert.deepEqual(issues, [{ table: "Акты", row: null, column: "Номер акта", message: "Акт «X» не найден на листе «База актов»" }]);
});

test("пустая дата документа качества — Не заполнено, со строкой", async () => {
  const { bundle, issues } = await build(withRecords((r) => { r["ДокументыКачества"][3]["Дата"] = null; }));
  assert.equal(bundle, null);
  assert.deepEqual(issues, [{ table: "ДокументыКачества", row: 3, column: "Дата", message: "Не заполнено" }]);
});

test("дата текстом «28.07.2026» принимается, «завтра» — ошибка", async () => {
  const ok = await build(withRecords((r) => { r["Акты"][0]["Дата акта"] = "28.07.2026"; }));
  assert.deepEqual(ok.issues, []);
  assert.equal(ok.bundle!.act.date, "2026-07-28");
  const bad = await build(withRecords((r) => { r["Акты"][0]["Дата акта"] = "завтра"; }));
  assert.deepEqual(bad.issues, [{ table: "Акты", row: 0, column: "Дата акта", message: "Дата в формате ДД.ММ.ГГГГ" }]);
});

test("число текстом с запятой принимается, мусор — ошибка", async () => {
  const ok = await build(withRecords((r) => { r["ВОР"][0]["Объём"] = "1 618,9"; }));
  assert.equal(ok.bundle!.vor[0].quantity, 1618.9);
  const bad = await build(withRecords((r) => { r["ВОР"][0]["Объём"] = "много"; }));
  assert.deepEqual(bad.issues, [{ table: "ВОР", row: 0, column: "Объём", message: "Нужно число" }]);
});

test("висячая ссылка и значение не из списка", async () => {
  const { issues } = await build(withRecords((r) => {
    r["МатериалыАктов"][0]["Материал"] = "Нет такого";
    r["Представители"][0]["Роль"] = "Прораб";
  }));
  assert.ok(issues.some((i) => i.table === "МатериалыАктов" && i.message === "Нет в таблице «Материалы»: Нет такого"));
  assert.ok(issues.some((i) => i.table === "Представители" && i.row === 0 && i.message === "Значение не из списка"));
});

test("ВОР с материалом вне акта", async () => {
  const { issues } = await build(withRecords((r) => { r["МатериалыАктов"].pop(); }));
  assert.ok(issues.length > 0);
  assert.ok(issues.every((i) => i.table === "ВОР" && i.column === "Материал" && i.message === "Материала нет в «Материалах в актах» этого акта"));
});

test("повтор номера акта — Значение повторяется", async () => {
  const { issues } = await build(withRecords((r) => { r["Акты"].push({ ...r["Акты"][0] }); }));
  assert.ok(issues.some((i) => i.table === "Акты" && i.column === "Номер акта" && i.message === "Значение повторяется"));
});

test("наименование материала с «;» — ошибка", async () => {
  const { issues } = await build(withRecords((r) => {
    const old = r["Материалы"][1]["Наименование"];
    const name = "Труба; серая";
    r["Материалы"][1]["Наименование"] = name;
    for (const t of ["МатериалыАктов", "ВОР"]) for (const x of r[t]) if (x["Материал"] === old) x["Материал"] = name;
  }));
  assert.ok(issues.some((i) => i.table === "Материалы" && i.row === 1 && i.message === "Наименование не должно содержать «;»"));
});

test("акт без материалов: проверка проходит, материалов нет", async () => {
  const { bundle, issues } = await build(withRecords((r) => { r["МатериалыАктов"] = []; r["ВОР"] = []; }));
  assert.deepEqual(issues, []);
  assert.deepEqual(bundle!.actMaterials, []);
});

test("пустые строки в середине таблиц не дают ошибок", async () => {
  const { issues } = await build(withRecords((r) => {
    for (const t of ["Материалы", "ДокументыКачества", "ВОР", "МатериалыАктов", "Схемы"]) r[t].splice(1, 0, {}, {});
  }));
  assert.deepEqual(issues, []);
});

test("пробелы по краям ссылки не мешают", async () => {
  const { issues } = await build(withRecords((r) => { r["ВОР"][0]["Материал"] += "  "; }));
  assert.deepEqual(issues, []);
});

test("в пакет попадают только материалы и документы этого акта", async () => {
  const { bundle } = await build(withRecords((r) => {
    r["Материалы"].push({ "Наименование": "Чужой", "Завод-изготовитель": "X", "Ед. изм.": "шт." });
    r["ДокументыКачества"].push({ "Материалы": "Чужой", "Тип": "Паспорт качества", "Номер": "9", "Дата": 46000, "Листов": 1 });
  }));
  assert.equal(bundle!.materials.length, 20);
  assert.equal(bundle!.qualityDocs.length, 24);
});
