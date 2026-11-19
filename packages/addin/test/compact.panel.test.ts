// 0.38: «Компактная панель» — настройка компьютера; без хранилища — выключена, ошибки хранилища не мешают.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PANEL_SCREENS, readCompact, writeCompact } from "@idk/addin/panel/compact";

test("компактная панель: запись и чтение, сбой хранилища — выключена", () => {
  const m = new Map<string, string>();
  const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  assert.equal(readCompact(st), false);
  writeCompact(true, st);
  assert.equal(readCompact(st), true);
  writeCompact(false, st);
  assert.equal(readCompact(st), false);
  const broken = {
    getItem: () => {
      throw new Error("нет доступа");
    },
    setItem: () => {
      throw new Error("нет доступа");
    },
  };
  assert.equal(readCompact(broken), false);
  assert.doesNotThrow(() => writeCompact(true, broken));
  assert.equal(readCompact(null), false);
  assert.ok(PANEL_SCREENS.includes("home") && PANEL_SCREENS.includes("settings") && !PANEL_SCREENS.includes("assistant"));
});
