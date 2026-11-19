// 0.37: список актов окна программы — даты, комплекты, статус готовности, фильтры.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { actDates, actsOverview, filterActs, statusText } from "@idk/shared/acts/overview";
import { addNextAct } from "@idk/shared/acts/nextAct";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

test("даты работ: диапазон, год у начала только при смене года, одна дата", () => {
  assert.equal(actDates("2026-03-02", "2026-03-06"), "02.03 – 06.03.2026");
  assert.equal(actDates("2025-12-29", "2026-01-12"), "29.12.2025 – 12.01.2026");
  assert.equal(actDates("2026-03-02", ""), "02.03.2026");
  assert.equal(actDates("", ""), "");
});

test("статус: готовый акт, акт без обязательных полей — не собирается; число замечаний — словом", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  await wb.write("Акты", 0, { "Вид работ": "Кабельные линии" });
  const next = await addNextAct(wb, 0);
  await wb.write("Акты", next.row, { "Работы (п.1)": "" });
  const list = actsOverview(await readBook(wb), defaultImportant(), "2026-11-19");
  assert.equal(list.length, 2);
  const [a, b] = list;
  assert.equal(a.number, AOV1);
  assert.notEqual(a.status, "blocked");
  assert.ok(a.dates.includes("–"));
  assert.deepEqual(a.workKinds, ["Кабельные линии"]);
  assert.equal(b.status, "blocked");
  assert.ok(b.problems > 0);
  assert.equal(statusText({ status: "warn", problems: 1 }), "1 замечание");
  assert.equal(statusText({ status: "warn", problems: 3 }), "3 замечания");
  assert.equal(statusText({ status: "warn", problems: 12 }), "12 замечаний");
  assert.equal(statusText({ status: "blocked", problems: 3 }), "не собирается");

  assert.deepEqual(
    filterActs(list, { query: "", status: "blocked", workKind: "" }).map((x) => x.number),
    [b.number],
  );
  assert.equal(filterActs(list, { query: "аов1", status: "all", workKind: "Кабельные линии" }).length, 2);
  assert.equal(filterActs(list, { query: "нет такого", status: "all", workKind: "" }).length, 0);
});
