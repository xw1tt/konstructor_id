// План 28: бланки набора «ТИ» в Excel — ВД, РМ, РП, кабельный журнал (как PDF).
import type { TiData, TiHeader } from "../tiData.ts";
import type { TiJournal } from "@idk/shared/acts/cableDocs";
import type { CellStyle } from "../../xlsx/book.ts";
import { Layout, gridSpans, wrapLines, lineHeight, type TCell, type Col } from "../../xlsx/layout.ts";
import { PORTRAIT } from "./aosr.ts";

const S = 8.5;
const C: CellStyle = { h: "center" };
const N = 36;

/** Таблица на сетке: графы по долям ширины. */
function gridTable(L: Layout, pct: number[], head: string[][], body: (string | number)[][], o: { aligns?: CellStyle[]; rowStyle?: (i: number) => CellStyle | undefined; size?: number } = {}) {
  const spans = gridSpans(pct, L.cols);
  const h: Col[][] = head.map((row) => row.map((t, i) => ({ header: t, span: spans[i] })));
  const b: TCell[][] = body.map((row, ri) => row.map((t, i) => ({ text: t, span: spans[i], style: { ...o.aligns?.[i], ...o.rowStyle?.(ri) } })));
  L.table(h, b, { size: o.size ?? S });
}

/** Шапка ВД и КЖ: слева подрядчик и участок, справа город, заказчик, объект, дата — значение на линии, подпись под ним.
 *  Колонки идут строка в строку: пара «значение + подпись» слева и справа — в одних строках листа. */
export function tiHead(L: Layout, h: TiHeader) {
  const third = Math.round(L.cols * 0.36);
  const sides = [{ c1: 1, c2: third }, { c1: L.cols - third + 1, c2: L.cols }];
  const left: [string, string][] = [[h.contractor, "(подрядная организация)"], [[h.sectionName, h.sectionCode].filter(Boolean).join("\n"), "(участок)"]];
  const right: [string, string][] = [[h.city, "(город)"], [h.customer, "(заказчик)"], [h.object, "(объект)"],
    [h.day ? `"${h.day}" ${h.month} ${h.year}г.` : "", "(дата)"]];
  const val: CellStyle = { b: true, size: 9, h: "center", shrink: true, border: { b: true } };
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const items = [left[i], right[i]];
    const lines = items.map((it, k) => (it ? (it[0] ? wrapLines(it[0], L.widthPt(sides[k].c1, sides[k].c2), 9, true) : [""]) : []));
    const n = Math.max(...lines.map((l) => l.length));
    for (let r = 0; r < n; r++) {
      const row = L.next();
      L.sheet.height(row, lineHeight(9) + 0.5);
      lines.forEach((ls, k) => { if (r < ls.length) L.sheet.merge(row, sides[k].c1, row, sides[k].c2, ls[r], val); });
    }
    const cap = L.next();
    L.sheet.height(cap, lineHeight(6) + 2);
    items.forEach((it, k) => { if (it) L.sheet.merge(cap, sides[k].c1, cap, sides[k].c2, it[1], { size: 6, h: "center", v: "top" }); });
  }
  L.gap(6);
}

const title = (L: Layout, t: string, size = 10.5) => L.para(t, { b: true, h: "center", size });
const tiSigns = (L: Layout, d: TiData) => { L.gap(8); L.signs(d.signs, { labelBold: true, nameBold: false, capSize: 6, gap: 5 }); };
const nums = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));

export function tiVdSheet(d: TiData): Layout {
  const L = new Layout(`ВД ${d.vdNumber}`, Array(N).fill(180 / N), PORTRAIT);
  tiHead(L, d.header);
  title(L, `ВЕДОМОСТЬ № ${d.vdNumber}`);
  title(L, "СМОНТИРОВАННОГО ЭЛЕКТРООБОРУДОВАНИЯ И МАТЕРИАЛОВ");
  L.gap(6);
  gridTable(L, [6, 42, 20, 8, 8, 16], [["№ п/п", "Наименование электрооборудования, комплекта", "Тип, марка", "Кол-во", "Ед. изм.", "Примечания"], nums(6)],
    d.vd.map((r) => [r.n, r.name, r.type, r.quantity, r.unit, ""]), { aligns: [C, {}, C, C, C, C] });
  tiSigns(L, d);
  return L;
}

function appendixHead(L: Layout, t1: string, t2: string, number: string, d: TiData) {
  title(L, t1);
  title(L, t2);
  title(L, `№${number}`);
  L.para(`к АОСР ${d.aosrNumber} от ${d.actDate}г.`, { h: "center", size: 9 });
  L.gap(6);
}

export function tiRmSheet(d: TiData): Layout {
  const L = new Layout(`РМ ${d.rmNumber}`, Array(N).fill(180 / N), PORTRAIT);
  appendixHead(L, "РЕЕСТР", "применённых материалов", d.rmNumber, d);
  // Сначала строки документов (серые), затем материалы этих документов.
  const rows: (string | number)[][] = [];
  const gray: boolean[] = [];
  for (const g of d.rm) {
    for (const x of g.docs) { rows.push(["", x.type, x.date, x.number]); gray.push(true); }
    for (const i of g.items) { rows.push([`${i.n}.`, i.name, "", ""]); gray.push(false); }
  }
  const spans = gridSpans([6, 54, 14, 26], L.cols);
  const body: TCell[][] = rows.map((r, i) => gray[i]
    ? r.map((t, k) => ({ text: t, span: spans[k], style: { fill: "D9D9D9", ...(k >= 2 ? C : {}) } }))
    // Строка материала: наименование на три графы.
    : [{ text: r[0], span: spans[0], style: C }, { text: r[1], span: spans[1] + spans[2] + spans[3] }]);
  L.table([[{ header: "№", span: spans[0] }, { header: "Наименование", span: spans[1] }, { header: "Дата документа", span: spans[2] }, { header: "Номер документа", span: spans[3] }]], body, { size: S });
  tiSigns(L, d);
  return L;
}

export function tiRpSheet(d: TiData): Layout {
  const L = new Layout(`РП ${d.rpNumber}`, Array(N).fill(180 / N), PORTRAIT);
  appendixHead(L, "РЕЕСТР", "документов, подтверждающих соответствие работ", d.rpNumber, d);
  gridTable(L, [6, 40, 14, 32, 8], [["№", "Наименование", "Дата документа", "Номер документа", "Лист"]],
    d.rp.map((r) => [r.n, r.type, r.date, r.number, r.sheets || ""]), { aligns: [C, {}, C, C, C] });
  tiSigns(L, d);
  return L;
}

export function tiKjSheet(d: { header: TiHeader; number: string; journal: TiJournal }): Layout {
  // Альбомный лист, поля 10/10/10/12 мм: 275 мм, сетка 55 столбцов по 5 мм.
  const L = new Layout(`КЖ ${d.number}`, Array(55).fill(5), { landscape: true, margins: [10, 10, 10, 12] });
  tiHead(L, d.header);
  title(L, `Кабельный журнал №${d.number}`, 12);
  L.gap(6);
  const j = d.journal;
  const spans = gridSpans([12, 10, 10, 22, 9, 9, 9, 9, 10], L.cols);
  const sp = (i: number, n = 1) => spans.slice(i, i + n).reduce((a, b) => a + b, 0);
  const cell = (text: string, i: number, n = 1, s: CellStyle = {}): TCell => ({ text, span: sp(i, n), style: { h: "center", ...s } });
  const body: TCell[][] = j.lines.map((l) => l.kind === "group"
    ? [cell(l.title, 0, 9, { b: true })]
    : [l.designation, l.from, l.to, l.mark, l.project, l.fact, l.tray, l.smooth, l.corrugated].map((t, i) => cell(t, i)));
  const B: CellStyle = { b: true };
  body.push([cell("", 0, 3), cell("Итого всего", 3, 1, B), cell("", 4), cell("", 5), cell(j.total.tray, 6, 1, B), cell(j.total.smooth, 7, 1, B), cell(j.total.corrugated, 8, 1, B)]);
  for (const m of j.byMark) body.push([cell("", 0, 3), cell(`в т.ч. ${m.mark}`, 3, 1, B), cell(m.project, 4, 1, B), cell(m.fact, 5, 1, B), cell("", 6), cell("", 7), cell("", 8)]);
  body.push([cell("", 0, 3), cell(`с учетом кф запаса ${j.reserve.pct}%`, 3, 1, B), cell("", 4), cell(j.reserve.fact, 5, 1, B),
    cell(j.reserve.tray, 6, 1, B), cell(j.reserve.smooth, 7, 1, B), cell(j.reserve.corrugated, 8, 1, B)]);
  L.table([
    [{ header: "Обозначение кабеля, провода", span: sp(0), rowspan: 2 }, { header: "Трасса", span: sp(1, 2) }, { header: "Кабель", span: sp(3, 3) }, { header: "Способ прокладки", span: sp(6, 3) }],
    ["Начало", "Конец", "Марка", "Длина по проекту, м", "Длина фактическая, м", "Лоток", "Труба гладкая", "Труба гофрированная"].map((t, i) => ({ header: t, span: sp(i + 1) })),
  ], body, { size: 8 });
  // «Сдал:» / «Принял:» — надпись 20 мм, линия 70 мм, линия 40 мм («Подпись»), линия 30 мм («Дата»).
  for (const label of ["Сдал:", "Принял:"]) {
    L.gap(10);
    L.line([
      { c1: 1, c2: 4, text: label, style: { h: "left" } }, { c1: 5, c2: 18, text: "", under: true },
      { c1: 21, c2: 28, text: "", under: true, caption: "Подпись" }, { c1: 31, c2: 36, text: "", under: true, caption: "Дата" },
    ], 9);
  }
  return L;
}
