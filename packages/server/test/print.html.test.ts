import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHtml } from "@idk/server/print/templates/index";
import { buildDocDataFromBundle } from "@idk/server/print/fromBundle";
import { aov1Bundle } from "./helpers/aov1.ts";

const b = await aov1Bundle();
const buildDocData = <K extends "aosr" | "rim" | "vd" | "vor">(k: K) => buildDocDataFromBundle(b, k);
const text = (kind: "aosr" | "rim" | "vd" | "vor") =>
  renderHtml(kind, buildDocData(kind)).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")
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
  assert.equal(t.match(/№К32\.В\.СТ\.АОВ1\.01\.00\.\d\. Монтаж/g)?.length, 6);
  assert.equal(t.match(/Исполнительная схема №/g)?.length, 1);
  assert.ok(t.includes("ИНН 7714322214."), "реквизиты заканчиваются точкой");
  assert.ok(t.includes("6. Работы выполнены в соответствии с ") && !t.includes("в соответствии с:"));
});

test("aosr: подписи — 6 фамилий в порядке ролей", () => {
  const t = text("aosr");
  const tail = t.slice(t.lastIndexOf("Приложения"));
  const order = ["Валерьянов А.А.", "Аксенов А.М.", "Филиппов М.И.", "Смирнов М.А.", "Королев Д.М.", "Востров В.П."].map((n) => tail.indexOf(n));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), String(order));
});

test("rim: 24 строки, первая — паспорт №3/405", () => {
  const html = renderHtml("rim", buildDocData("rim"));
  assert.equal((html.match(/<tr class="row">/g) ?? []).length, 24);
  const t = text("rim");
  assert.ok(t.includes("Реестр использованных материалов №К32.В.СТ.АОВ1.01.00.1.РИМ"));
  assert.match(t, /1 Кабель СегментКИ-485-ПсЭнг\(А\)-HF 1х2х0,78-300 В паспорт качества №3\/405 09\.05\.2025 г\. 1/);
  assert.ok(!t.includes("Смирнов"));
});

test("vd: 20 строк, кабель 1618,9 м.", () => {
  const html = renderHtml("vd", buildDocData("vd"));
  assert.equal((html.match(/<tr class="row">/g) ?? []).length, 20);
  assert.match(text("vd"), /1 б\/н Кабель для промышленного интерфейса RS-485.* м\. 1618,9/);
});

test("vor: 98 пронумерованных строк, 5 групп", () => {
  const html = renderHtml("vor", buildDocData("vor"));
  assert.equal((html.match(/<tr class="(row|group)">/g) ?? []).length, 98);
  assert.equal((html.match(/<tr class="group">/g) ?? []).length, 5);
  const t = text("vor");
  assert.ok(t.includes("Итого по этажам П5, П4, П3, П2"));
  assert.ok(t.includes("Представитель заказчика: Ведущий инженер по автоматике и слаботочным системам ООО \"СБД\" Валерьянов А.А."));
});

test("html: экранирование", async () => {
  const { escapeHtml } = await import("@idk/server/print/templates/common");
  assert.equal(escapeHtml(`<test & "x">`), "&lt;test &amp; &quot;x&quot;&gt;");
  const bad = await aov1Bundle((r) => { r["Акты"][0]["Работы (п.1)"] = `<script>alert(1)</script> & "x"`; });
  const html = renderHtml("aosr", buildDocDataFromBundle(bad, "aosr"));
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("rim: материал с несколькими документами — наименование один раз, группа в своём tbody", () => {
  const html = renderHtml("rim", buildDocData("rim"));
  const kabel = "Кабель СегментКИ-485-ПсЭнг(А)-HF 1х2х0,78-300 В";
  const t = text("rim");
  assert.equal(t.split(kabel).length - 1, 1);
  assert.match(html, /<tbody class="grp">/);
  // Наименование группы — одна ячейка на все строки документов материала.
  assert.match(html, /<td class="l" rowspan="\d+">Кабель СегментКИ[^<]*<\/td>/);
});

test("aosr: настройка «Исполнительная схема» перед каждой схемой", async () => {
  assert.equal(buildDocDataFromBundle(b, "aosr", { schemeEach: true }).p4.filter((l) => l.startsWith("Исполнительная схема")).length, 6);
  assert.equal(buildDocDataFromBundle(b, "aosr").p4.filter((l) => l.startsWith("Исполнительная схема")).length, 1);
});
