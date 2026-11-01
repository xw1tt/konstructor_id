// Исполнительная схема кабельной трассы: модель, длины, отрисовка в SVG.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseRoute, resolveNodes, routeTotals, cableRouteLengths, formatLevel, RouteScheme, type RouteInput,
} from "@idk/shared/scheme/route";
import { renderRouteSvg, esc } from "@idk/shared/scheme/render";

const example: RouteInput = JSON.parse(readFileSync(new URL("./fixtures/route.example.json", import.meta.url), "utf8"));
const scheme = RouteScheme.parse(example);

test("пример разбирается, привязки к осям раскрываются в мм", () => {
  const p = resolveNodes(scheme);
  assert.deepEqual(p.get("п2"), { x: 18000, y: 7500 });
  assert.deepEqual(p.get("к207"), { x: 23400, y: 2500 });
  assert.equal(scheme.format, "A3");
  assert.equal(scheme.stamp.stage, "ИД");
});

test("ошибки — по-русски, с путём: нет оси, нет точки, повтор", () => {
  const bad = parseRoute({
    axes: { x: [{ name: "1", pos: 0 }, { name: "1", pos: 6000 }] },
    nodes: [{ id: "a", x: { axis: "9" }, y: 0 }, { id: "a", x: 0, y: 0 }],
    segments: [{ from: "a", to: "b", kind: "tray" }],
  });
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.ok(bad.errors.includes("axes.x: Ось «1» указана дважды"));
  assert.ok(bad.errors.includes("nodes: Точка «a» указана дважды"));
  assert.ok(bad.errors.includes("nodes.0.x: Точка «a»: нет оси «9» по X"));
  assert.ok(bad.errors.includes("segments.0.to: Участок 1: нет точки «b»"));
  assert.equal(parseRoute({ nodes: [], segments: [] }).ok, false);
  assert.equal(parseRoute({ nodes: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 1, y: 0 }], segments: [{ from: "a", to: "b", kind: "лоток" }] }).ok, false);
});

test("ведомость: длины по способу и марке, стояк считается по перепаду отметок", () => {
  assert.deepEqual(routeTotals(scheme), [
    // стояк 3,2 + по оси Б от 1+800 до 4 = 17,2
    { kind: "tray", mark: "ЛМ 100×50", length: 5.4 },
    { kind: "tray", mark: "ЛМ 200×50", length: 20.4 },
    { kind: "pipe", mark: "ПВХ 32", length: 6.3 },
    // 2,5 + опуск 2,9 = 5,4; 5,0 + 2,9 = 7,9
    { kind: "corrugated", mark: "ПВХ 25", length: 13.3 },
  ]);
});

test("длина трассы по кабелям — для сверки с кабельным журналом", () => {
  const m = cableRouteLengths(scheme);
  assert.equal(m.get("1"), 32.1);
  assert.equal(m.get("3"), 33.7);
});

test("отметки: +3,200 / -0,450 / ±0,000", () => {
  assert.equal(formatLevel(3.2), "+3,200");
  assert.equal(formatLevel(-0.45), "-0,450");
  assert.equal(formatLevel(0), "±0,000");
});

test("SVG: лист A3 в мм, масштаб подобран, оси, подписи, штамп", () => {
  const r = renderRouteSvg(scheme);
  assert.equal(r.width, 420);
  assert.equal(r.height, 297);
  assert.equal(r.scale, 75);
  assert.deepEqual(r.warnings, []);
  assert.match(r.svg, /^<svg [^>]*width="420mm" height="297mm" viewBox="0 0 420 297"/);
  assert.ok(r.svg.endsWith("</svg>"));
  for (const s of ["М 1:75", ">Б<", ">5<", ">6000<", ">3000<", "ЛМ 200×50, L=17,2 м", "каб. 1, 2, 3, 4", "+3,200", "±0,000", "ШК-2.1",
    "Ведомость кабельных трасс", "Итого трасс", ">45,4<", "Условные обозначения", "Труба гофрированная", "0997-01-СКС1.ИС-1", "Составил", "Примечания:"]) {
    assert.ok(r.svg.includes(s), `нет «${s}»`);
  }
  // теги сбалансированы
  const open = (r.svg.match(/<(text|svg)\b/g) ?? []).length, close = (r.svg.match(/<\/(text|svg)>/g) ?? []).length;
  assert.equal(open, close);
});

test("SVG: заданный масштаб, который не помещается, — предупреждение; текст экранируется", () => {
  const r = renderRouteSvg(RouteScheme.parse({ ...example, scale: 20, stamp: { code: "<A&B>" } }));
  assert.equal(r.scale, 20);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0]!, /1:20 трасса не помещается на лист A3/);
  assert.ok(r.svg.includes("&lt;A&amp;B&gt;"));
  assert.ok(!r.svg.includes("<A&B>"));
  assert.equal(esc(`"'`), "&quot;&#39;");
});

test("SVG: A4 книжный — таблицы над штампом, без осей тоже рисуется", () => {
  const r = renderRouteSvg(RouteScheme.parse({
    format: "A4", orientation: "portrait",
    nodes: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 12000, y: 0 }, { id: "c", x: 12000, y: 5000 }],
    segments: [{ from: "a", to: "b", kind: "tray", mark: "ЛП 100×50", width: 100 }, { from: "b", to: "c", kind: "cable", mark: "U/UTP" }],
  }));
  assert.equal(r.width, 210);
  assert.equal(r.scale, 100);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.svg.includes("Кабель открыто"));
});
