import { test } from "node:test";
import assert from "node:assert/strict";
import { column } from "@idk/shared/workbook/schema";
import { toCellFor } from "@idk/addin/panel/card/editValue";

test("дата поля «Объект» пишется текстом (столбец «Значение» текстовый), в остальных — серийным числом", () => {
  const date = { ...column("Объект", "value"), type: "date" as const };
  assert.deepEqual(toCellFor("Объект", date, "02.01.2026"), { ok: true, value: "02.01.2026" });
  assert.deepEqual(toCellFor("Акты", column("Акты", "date"), "28.07.2026"), { ok: true, value: 46231 });
});
