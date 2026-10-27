// План 31: одна таблица «Материалы» — виртуальные «Спецификация» и «ДокументыКачества», перенос старой книги,
// повторная загрузка РКЦ на месте. Проверка равенства: книга до и после переноса печатает те же документы.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { withVirtualTables } from "@idk/shared/workbook/virtual";
import { planMerge } from "@idk/shared/workbook/mergeOld";
import { applySpec } from "@idk/shared/spec/merge";
import { specClosed } from "@idk/shared/spec/closed";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

/** Старая книга → одна таблица «Материалы» (как «Обновить разметку»), хранилище с виртуальными таблицами. */
async function merged(r: any) {
  const old = new MemoryWorkbook(r);
  const plan = planMerge((await old.read("Материалы"))!, await old.read("Спецификация"), await old.read("ДокументыКачества"));
  const wb = new MemoryWorkbook(r);
  wb.drop("Спецификация");
  wb.drop("ДокументыКачества");
  for (const u of plan.updates) await wb.write("Материалы", u.row, u.values, u.links);
  const n = (await wb.read("Материалы"))!.rows.length;
  if (plan.appended.length) await wb.insert("Материалы", n, plan.appended.map((a) => a.values));
  for (const [i, a] of plan.appended.entries()) if (Object.keys(a.links).length) await wb.write("Материалы", n + i, {}, a.links);
  return { wb, store: withVirtualTables(wb), plan };
}

const withSpec = () => {
  const r: any = aov1Records();
  const mats = r["Материалы"];
  mats[0]["№ п/п РКЦ"] = "1.1";
  mats[1]["№ п/п РКЦ"] = "1.1";
  mats[2]["№ п/п РКЦ"] = "1.2";
  r["Спецификация"] = [
    { "№ п/п": "1.1", "Раздел": "Слаботочные", "Наименование": "Кабель по РКЦ", "Ед. изм.": "м", "Кол-во по проекту": 2000, "Источник": "РКЦ" },
    { "№ п/п": "1.2", "Раздел": "Слаботочные", "Наименование": "Труба по РКЦ", "Ед. изм.": "м", "Кол-во по проекту": 300, "Источник": "РКЦ" },
    { "№ п/п": "2.7", "Раздел": "Прочее", "Наименование": "Позиция без материала", "Ед. изм.": "шт", "Кол-во по проекту": 4, "Источник": "РКЦ" },
  ];
  return r;
};

test("после переноса книга печатает те же документы качества, а спецификация закрывается так же", async () => {
  const r = withSpec();
  const before = await readBook(new MemoryWorkbook(r));
  const { store, plan } = await merged(r);
  assert.deepEqual(plan.problems, []);
  const after = await readBook(store);
  const docs = (b: typeof before) => (b.tables["ДокументыКачества"] ?? []).map((x) => [x.v.type, x.v.number, x.v.materials, x.v.sheets]).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  assert.deepEqual(docs(after), docs(before));
  const q = (b: typeof before) => buildBundle(b, AOV1, defaultImportant()).bundle!.qualityDocs.map((d) => [d.type, d.number, d.materialIds.length]).sort();
  assert.deepEqual(q(after), q(before));
  const sc = (b: typeof before) => specClosed(b).map((p) => [p.number, p.quantity, p.closed, p.number === "2.7" ? "-" : p.materials.length]);
  assert.deepEqual(sc(after), sc(before));
  // Позиция без материала — новой строкой «Материалов».
  assert.ok((after.tables["Материалы"] ?? []).some((m) => m.v.name === "Позиция без материала" && m.v.rkc === "2.7"));
});

test("виртуальные документы: новый — в свободный «Док.N» каждого материала; отвязка, удаление; больше трёх — ошибка", async () => {
  const { wb, store } = await merged(aov1Records());
  const book = await readBook(store);
  const [m1, m2] = (book.tables["Материалы"] ?? []).map((m) => String(m.v.name));
  const before = (await store.read("ДокументыКачества"))!.rows.length;
  const i = await store.insert("ДокументыКачества", 0, [{ "Материалы": `${m1}; ${m2}`, "Тип": "Сертификат соответствия", "Номер": "ОБЩ-1", "Листов": 2 }]);
  const docs = await readBook(store);
  const d = docs.tables["ДокументыКачества"]!.find((x) => x.v.number === "ОБЩ-1")!;
  assert.equal(d.row, i);
  assert.equal(d.v.materials, `${m1}; ${m2}`);
  assert.equal((await store.read("ДокументыКачества"))!.rows.length, before + 1, "один документ на два материала");
  await store.write("ДокументыКачества", i, { "Скан": "общ.pdf" }, { "Скан": "https://localhost:3443/api/files/9" });
  const t = (await store.read("ДокументыКачества"))!;
  assert.equal(t.links[i][t.headers.indexOf("Скан")], "https://localhost:3443/api/files/9");
  // Отвязать второй материал.
  await store.write("ДокументыКачества", i, { "Материалы": m1 });
  assert.equal((await readBook(store)).tables["ДокументыКачества"]!.find((x) => x.v.number === "ОБЩ-1")!.v.materials, m1);
  await store.remove("ДокументыКачества", [i]);
  assert.ok(!(await readBook(store)).tables["ДокументыКачества"]!.some((x) => x.v.number === "ОБЩ-1"));
  // Четвёртый документ материалу — ошибка с понятным текстом.
  for (const n of ["A", "B", "C", "D"]) {
    try { await store.insert("ДокументыКачества", 0, [{ "Материалы": "Новый М", "Тип": "Паспорт качества", "Номер": n }]); }
    catch (e) { assert.equal(n, "D"); assert.match((e as Error).message, /У материала «Новый М» уже 3 документа/); }
  }
  assert.ok((await wb.read("Материалы"))!.rows.some((r) => r[0] === "Новый М"), "материала не было — строка создана");
});

test("виртуальная спецификация: новая позиция, правка, удаление (материал остаётся, позиция без материала — удаляется)", async () => {
  const { wb, store } = await merged(withSpec());
  const spec = () => readBook(store).then((b) => b.tables["Спецификация"] ?? []);
  const i = await store.insert("Спецификация", 0, [{ "№ п/п": "3.1", "Наименование": "Лоток", "Ед. изм.": "м", "Кол-во по проекту": 50 }]);
  assert.equal((await spec())[i].v.number, "3.1");
  await store.write("Спецификация", i, { "Кол-во по проекту": 60 });
  assert.equal((await spec())[i].v.quantity, 60);
  const rows = (await wb.read("Материалы"))!.rows.length;
  const i11 = (await spec()).findIndex((x) => x.v.number === "1.1");
  await store.remove("Спецификация", [i11]);
  assert.equal((await wb.read("Материалы"))!.rows.length, rows, "строки материалов не удаляются");
  assert.ok(!(await spec()).some((x) => x.v.number === "1.1"));
  const i31 = (await spec()).findIndex((x) => x.v.number === "3.1");
  await store.remove("Спецификация", [i31]);
  assert.equal((await wb.read("Материалы"))!.rows.length, rows - 1, "позиция без материала — строка удалена");
});

test("повторная загрузка РКЦ: на месте по № п/п, материал не удаляется и не переименовывается, новая позиция — строкой", async () => {
  const { wb, store } = await merged(withSpec());
  const rows = (await wb.read("Материалы"))!.rows.length;
  const book = await readBook(store);
  const used = String((book.tables["Материалы"] ?? []).find((m) => m.v.rkc === "1.1")!.v.name);
  await applySpec(store, book, [
    { number: "1.1", section: "Слаботочные", name: "Кабель по РКЦ (новое)", unit: "м", quantity: 2500 },
    { number: "1.2", section: "Слаботочные", name: "Труба по РКЦ", unit: "м", quantity: 300 },
    { number: "2.7", section: "Прочее", name: "Позиция без материала", unit: "шт", quantity: 4 },
    { number: "4.4", section: "Новое", name: "Новая позиция", unit: "шт", quantity: 1 },
  ] as any);
  const after = await readBook(store);
  assert.equal((await wb.read("Материалы"))!.rows.length, rows + 1, "добавлена одна строка, ни одной не удалено");
  const p11 = after.tables["Спецификация"]!.find((x) => x.v.number === "1.1")!;
  assert.equal(p11.v.quantity, 2500);
  assert.equal(p11.v.name, used, "наименование материала из актов не меняется");
  assert.match(String(p11.v.note), /в РКЦ: «Кабель по РКЦ \(новое\)»/);
  assert.ok(after.tables["Спецификация"]!.some((x) => x.v.number === "4.4"));
});

test("перенос: документ четвёртым на материал — в списке проблем; документ без материалов — тоже", async () => {
  const r: any = aov1Records();
  const m = r["Материалы"][0]["Наименование"];
  r["ДокументыКачества"].push(...["X1", "X2", "X3", "X4"].map((n) => ({ "Материалы": m, "Тип": "Паспорт качества", "Номер": n, "Листов": 1 })));
  r["ДокументыКачества"].push({ "Материалы": "", "Тип": "Паспорт качества", "Номер": "БЕЗ", "Листов": 1 });
  const { plan } = await merged(r);
  assert.ok(plan.problems.some((p) => /уже 3 документа — не поместился/.test(p)));
  assert.ok(plan.problems.some((p) => /«Паспорт качества БЕЗ»: не указаны материалы/.test(p)));
});

test("запись из библиотеки: документы ложатся в строки своих материалов, сканы — каждому свой", async () => {
  const { writeBook } = await import("@idk/shared/workbook/write");
  const { store } = await merged(aov1Records());
  await writeBook(store, {
    "Материалы": [{ "Наименование": "Лоток Б" }, { "Наименование": "Лоток А" }],
    "ДокументыКачества": [
      { "Материалы": "Лоток А", "Тип": "Паспорт качества", "Номер": "ЛА", "Листов": 1, "Скан": "а.pdf" },
      { "Материалы": "Лоток Б", "Тип": "Паспорт качества", "Номер": "ЛБ", "Листов": 1, "Скан": "б.pdf" },
    ],
  } as any, { "ДокументыКачества": [{ "Скан": "https://h/api/files/1" }, { "Скан": "https://h/api/files/2" }] } as any);
  const t = (await store.read("ДокументыКачества"))!;
  const at = (n: string) => t.links[t.rows.findIndex((r) => r[t.headers.indexOf("Номер")] === n)][t.headers.indexOf("Скан")];
  assert.equal(at("ЛА"), "https://h/api/files/1");
  assert.equal(at("ЛБ"), "https://h/api/files/2");
});

test("помощник: добавленные документы качества отменяются по виду и номеру", async () => {
  const { applyChanges, undoChanges } = await import("@idk/shared/ai/changes");
  const { store } = await merged(aov1Records());
  const before = (await store.read("ДокументыКачества"))!.rows.length;
  const book = await readBook(store);
  const [m1, m2] = (book.tables["Материалы"] ?? []).map((m) => String(m.v.name));
  const undo = await applyChanges(store, [{ kind: "add", table: "ДокументыКачества", rows: [
    { "Материалы": m2, "Тип": "Паспорт качества", "Номер": "У-2", "Листов": 1 },
    { "Материалы": m1, "Тип": "Паспорт качества", "Номер": "У-1", "Листов": 1 },
  ] }]);
  assert.equal((await store.read("ДокументыКачества"))!.rows.length, before + 2);
  await undoChanges(store, undo);
  const after = (await readBook(store)).tables["ДокументыКачества"]!;
  assert.equal(after.length, before);
  assert.ok(!after.some((d) => /^У-/.test(String(d.v.number))));
});
