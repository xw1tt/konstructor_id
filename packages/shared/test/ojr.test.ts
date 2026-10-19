// План 9: общий журнал работ — разделы 3 и 5 из актов.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { isoToExcelSerial, excelSerialToIso } from "@idk/shared/workbook/values";
import { ojrRows, fillOjr, workDays } from "@idk/shared/ojr";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

const d = isoToExcelSerial;
/** Книга АОВ1 + второй акт с пересекающимися датами (как в примере пользователя: 03–15.10 и 13–20.10). */
const records = (patch: (r: any) => void = () => {}) => {
  const r: any = aov1Records();
  r["Объект"].push({ "Поле": "Условия производства работ", "Значение": "Температура воздуха +18 °С, в помещении" });
  const a1 = r["Акты"][0];
  Object.assign(a1, { "Начало работ": d("2026-10-03"), "Окончание работ": d("2026-10-15"), "Работы (п.1)": "Монтаж лотковой трассы на отм. +5.400 в осях А-Р/1-5" });
  r["Акты"].push({ ...a1, "Номер акта": "А2", "Дата акта": d("2026-10-21"), "Начало работ": d("2026-10-13"), "Окончание работ": d("2026-10-20"),
    "Работы (п.1)": "Монтаж кабельных линий в осях А-Р/1-5", "ВОР: от монтажников": "Королев Д.М." });
  r["Схемы"].push({ "Акт": "А2", "Вид": "Схема", "Номер": "А2.1", "Наименование": "Монтаж кабельных линий", "Дата": d("2026-10-20") });
  patch(r);
  return r;
};
const iso = (v: unknown) => excelSerialToIso(v as number);

test("рабочие дни без воскресений", () => {
  assert.deepEqual(workDays("2026-10-03", "2026-10-06"), ["2026-10-03", "2026-10-05", "2026-10-06"]); // 04.10 — воскресенье
  assert.deepEqual(workDays("2026-10-04", "2026-10-04"), []);
  assert.deepEqual(workDays("2026-10-06", "2026-10-03"), []);
});

test("раздел 3: строка на дату, даты не повторяются, работы дня по порядку актов", async () => {
  const { s3, issues } = ojrRows(await readBook(new MemoryWorkbook(records())));
  assert.deepEqual(issues, []);
  const dates = s3.map((r) => iso(r["Дата"]));
  assert.equal(dates[0], "2026-10-03");
  assert.equal(dates.at(-1), "2026-10-20");
  assert.equal(new Set(dates).size, dates.length);
  assert.ok(!dates.includes("2026-10-04") && !dates.includes("2026-10-11") && !dates.includes("2026-10-18"), "без воскресений");
  assert.equal(dates.length, 15); // 03–20.10 = 18 дней − 3 воскресенья
  const d13 = s3.find((r) => iso(r["Дата"]) === "2026-10-13")!;
  assert.equal(d13["Наименование выполненных работ"], "Монтаж лотковой трассы на отм. +5.400 в осях А-Р/1-5\nМонтаж кабельных линий в осях А-Р/1-5");
  assert.equal(d13["Представитель"], "Начальник участка Востров В.П.\nНачальник отдела ККС Королев Д.М.");
  assert.equal(d13["Акты"], `${AOV1}; А2`);
  assert.equal(d13["Условия производства работ"], "Температура воздуха +18 °С, в помещении");
  const d16 = s3.find((r) => iso(r["Дата"]) === "2026-10-16")!;
  assert.equal(d16["Наименование выполненных работ"], "Монтаж кабельных линий в осях А-Р/1-5");
  assert.equal(d16["Представитель"], "Начальник отдела ККС Королев Д.М.");
});

test("раздел 5: документы актов по дате подписания", async () => {
  const { s5 } = ojrRows(await readBook(new MemoryWorkbook(records())));
  const names = s5.map((r) => String(r["Наименование исполнительной документации"]));
  const aosr = names.findIndex((n) => n.startsWith(`Акт освидетельствования скрытых работ №${AOV1}.АОСР`));
  assert.ok(aosr >= 0);
  assert.match(names[aosr], /приложения: реестр использованных материалов №К32\.В\.СТ\.АОВ1\.01\.00\.1\.РИМ, ведомость смонтированного оборудования, технических средств и материалов №К32\.В\.СТ\.АОВ1\.01\.00\.1\.ВД$/);
  assert.ok(names.some((n) => n === "Исполнительная схема №К32.В.СТ.АОВ1.01.00.1 Монтаж кабельных линий на этаже П5 в осях 27-13/У-К"));
  assert.ok(names.some((n) => n.startsWith("Акт входного контроля, технических средств и материалов №01/АОВ1.01.00")));
  assert.ok(names.some((n) => n === "Кабельный журнал № СБД-1436-АОВ1К1"));
  assert.ok(names.some((n) => n.startsWith("Протокол №1 проверки сопротивления изоляции")));
  // по дате подписания
  const dates = s5.map((r) => String(r["Дата подписания и подписавшие"]).slice(0, 10).split(".").reverse().join("-"));
  assert.deepEqual(dates, [...dates].sort());
  const sign = String(s5[aosr]["Дата подписания и подписавшие"]);
  assert.match(sign, /^28\.07\.2026 г\.\nВедущий инженер по автоматике и слаботочным системам Валерьянов А\.А\.\nЗаместитель руководителя проекта Аксенов А\.М\./);
  assert.match(sign, /Начальник участка Востров В\.П\.$/);
  const proto = s5.find((r) => String(r["Наименование исполнительной документации"]).startsWith("Протокол"))!;
  assert.match(String(proto["Дата подписания и подписавшие"]), /Руководитель электролаборатории Рябов Е\.А\./);
});

test("акт без дат работ — предупреждение, в раздел 3 не попадает", async () => {
  const { s3, issues } = ojrRows(await readBook(new MemoryWorkbook(records((r) => { r["Акты"][1]["Начало работ"] = null; }))));
  assert.deepEqual(issues.map((i) => i.message), ["Нет дат работ — акт «А2» не попал в раздел 3 журнала"]);
  assert.ok(s3.every((r) => !String(r["Акты"]).includes("А2")));
});

test("повторное заполнение: исправленные условия сохраняются по дате", async () => {
  const wb = new MemoryWorkbook(records());
  await fillOjr(wb, await readBook(wb));
  const t = (await wb.read("ОЖР3"))!;
  const ci = t.headers.indexOf("Условия производства работ"), di = t.headers.indexOf("Дата");
  const row = t.rows.findIndex((r) => iso(r[di]) === "2026-10-05");
  await wb.write("ОЖР3", row, { "Условия производства работ": "-2 °С, снег" });
  const n5 = (await wb.read("ОЖР5"))!.rows.length;
  await fillOjr(wb, await readBook(wb));
  const t2 = (await wb.read("ОЖР3"))!;
  assert.equal(t2.rows.length, 15);
  assert.equal(t2.rows.find((r) => iso(r[di]) === "2026-10-05")![ci], "-2 °С, снег");
  assert.equal(t2.rows.find((r) => iso(r[di]) === "2026-10-06")![ci], "Температура воздуха +18 °С, в помещении");
  assert.equal((await wb.read("ОЖР5"))!.rows.length, n5);
});
