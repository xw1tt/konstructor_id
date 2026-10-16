import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { openDb } from "@idk/server/db";
import { seedSbdAov1 } from "@idk/server/seed/sbdAov1";
import { buildDocData } from "@idk/server/print/data";
import { renderHtml } from "@idk/server/print/templates/index";
import { tmpDir } from "./helpers/tmp.ts";

const db = openDb(join(tmpDir(), "db.sqlite"));
const { actId } = seedSbdAov1(db);
const text = (kind: "aosr" | "rim" | "vd" | "vor") =>
  renderHtml(kind, buildDocData(db, actId, kind)).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");

test("aosr: шапка с полными реквизитами застройщика", () => {
  const t = text("aosr");
  assert.match(t, /Застройщик, технический заказчик.*ООО "СБД", ОГРН 1197746498916, ИНН 7736323532/);
  assert.match(t, /Корпус "В"/);
});

test("aosr: номер и дата", () => {
  const t = text("aosr");
  assert.ok(t.includes("№К32.В.СТ.АОВ1.01.00.1.АОСР"));
  assert.ok(t.includes("28 июля 2026 г."));
  assert.ok(t.includes("5 июня 2026 г.") && t.includes("6 июня 2026 г."));
});

test("aosr: два представителя в роли performer, по порядку", () => {
  const t = text("aosr");
  const k = t.indexOf("Начальник отдела ККС Королев Д.М.");
  const v = t.indexOf("Начальник участка Востров В.П.");
  assert.ok(k > 0 && v > k);
  assert.ok(t.includes('произвели осмотр работ, выполненных: ООО "Велесстрой"'));
});

test("aosr: п.2, п.3 — ссылка на РИМ и ВД, п.4 — 6 схем", () => {
  const t = text("aosr");
  assert.ok(t.includes('Шифр рабочей документации: КУТ03-Р-ПИР-2-26-100-АОВ1.01.00 листы 0210-0230, рев.1, ООО "МАРКС ИНЖИНИРИНГ"'));
  assert.ok(t.includes("Согласно реестру использованных материалов №К32.В.СТ.АОВ1.01.00.1.РИМ"));
  assert.equal(t.match(/Исполнительная схема №К32\.В\.СТ\.АОВ1\.01\.00\.\d\./g)?.length, 6);
});

test("aosr: подписи — 6 фамилий в порядке ролей", () => {
  const t = text("aosr");
  const tail = t.slice(t.lastIndexOf("Приложения"));
  const order = ["Валерьянов А.А.", "Аксенов А.М.", "Филиппов М.И.", "Смирнов М.А.", "Королев Д.М.", "Востров В.П."].map((n) => tail.indexOf(n));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), String(order));
});

test("rim: 24 строки, первая — паспорт №3/405", () => {
  const html = renderHtml("rim", buildDocData(db, actId, "rim"));
  assert.equal((html.match(/<tr class="row">/g) ?? []).length, 24);
  const t = text("rim");
  assert.ok(t.includes("Реестр использованных материалов №К32.В.СТ.АОВ1.01.00.1.РИМ"));
  assert.match(t, /1 Кабель СегментКИ-485-ПсЭнг\(А\)-HF 1х2х0,78-300 В паспорт качества №3\/405 09\.05\.2025 г\. 1/);
  assert.ok(!t.includes("Смирнов"));
});

test("vd: 20 строк, кабель 1618,9 м.", () => {
  const html = renderHtml("vd", buildDocData(db, actId, "vd"));
  assert.equal((html.match(/<tr class="row">/g) ?? []).length, 20);
  assert.match(text("vd"), /1 б\/н Кабель для промышленного интерфейса RS-485.* м\. 1618,9/);
});

test("vor: 98 пронумерованных строк, 5 групп", () => {
  const html = renderHtml("vor", buildDocData(db, actId, "vor"));
  assert.equal((html.match(/<tr class="(row|group)">/g) ?? []).length, 98);
  assert.equal((html.match(/<tr class="group">/g) ?? []).length, 5);
  const t = text("vor");
  assert.ok(t.includes("Итого по этажам П5, П4, П3, П2"));
  assert.ok(t.includes("Представитель заказчика: Ведущий инженер по автоматике и слаботочным системам ООО \"СБД\" Валерьянов А.А."));
});

test("html: экранирование", async () => {
  const { escapeHtml } = await import("@idk/server/print/templates/common");
  assert.equal(escapeHtml(`<test & "x">`), "&lt;test &amp; &quot;x&quot;&gt;");
  db.prepare("UPDATE acts SET works=? WHERE id=?").run(`<script>alert(1)</script> & "x"`, actId);
  const html = renderHtml("aosr", buildDocData(db, actId, "aosr"));
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;"));
});
