// План 27: бланки набора «СБД» в Excel — РИМ, ВД, ВОР, АВК, протокол изоляции, кабельный журнал (как PDF).
import type { RimData, VdData, VorData, AvkData } from "../data.ts";
import type { KjData, IpData } from "../cableData.ts";
import type { JournalLine } from "@idk/shared/acts/cableDocs";
import { JOURNAL_LINES_PER_SHEET } from "@idk/shared/acts/cableDocs";
import { formatNumber } from "@idk/shared/acts/format";
import { Sheet, type CellStyle } from "../../xlsx/book.ts";
import { Layout, pctCols, wrapLines, type TCell } from "../../xlsx/layout.ts";
import { fitFont } from "../templates/kj.ts";
import { blankView, type BlankView } from "@idk/shared/blanks";
import { xlsxBlankTable } from "../blankTable.ts";
import { rimRowsOf } from "../templates/rim.ts";
import { vdRowsOf } from "../templates/vd.ts";
import { vorRowsOf } from "../templates/vor.ts";
import { avkRowsOf } from "../templates/avk.ts";
import { ipRowsOf } from "../templates/ip.ts";
import { PORTRAIT } from "./aosr.ts";

const W = 180;
const c = (text: string | number, style?: CellStyle): TCell => ({ text, style });
const C: CellStyle = { h: "center" };
const nums = (n: number) => Array.from({ length: n }, (_, i) => ({ header: String(i + 1) }));
/** Шапка «Приложение №…» справа и заголовок по центру. */
function appendixHead(L: Layout, appx: string[], head: string[]) {
  for (const t of appx) L.para(t, { h: "right" });
  L.gap(12);
  for (const t of head) L.para(t, { b: true, h: "center" });
  L.gap(10);
}
/** Подписи как в АОСР: надпись роли, ФИО полужирным курсивом на линии. */
const signs = (L: Layout, s: { label: string; names: string[] }[]) => { L.gap(6); L.signs(s); };

export function rimSheet(d: RimData, view: BlankView = blankView("rim:sbd")): Layout {
  const L = new Layout(d.number || "РИМ", pctCols(W, view.columns.map((x) => x.width)), PORTRAIT);
  appendixHead(L, ["Приложение №2", `Приложение к акту освидетельствования скрытых работ №${d.aosrNumber}`],
    ["Реестр использованных материалов", `№${d.number}`, "Сопроводительные документы качества (паспорта, сертификаты, заключения и т.д.)"]);
  xlsxBlankTable(L, view, rimRowsOf(d), { nums: true, size: 9.5 });
  signs(L, d.signs);
  return L;
}

export function vdSheet(d: VdData, view: BlankView = blankView("vd:sbd")): Layout {
  const L = new Layout(d.number || "ВД", pctCols(W, view.columns.map((x) => x.width)), PORTRAIT);
  appendixHead(L, ["Приложение №1", `Приложение к акту освидетельствования скрытых работ №${d.aosrNumber}`],
    ["Ведомость смонтированного оборудования, технических средств и материалов", `№${d.number}`]);
  xlsxBlankTable(L, view, vdRowsOf(d), { nums: true, size: 9.5 });
  signs(L, d.signs);
  return L;
}

export function vorSheet(d: VorData, view: BlankView = blankView("vor:sbd")): Layout {
  const L = new Layout("ВОР", pctCols(W, view.columns.map((x) => x.width)), { ...PORTRAIT, pageNumbers: true });
  const S = 8;
  L.para("Объект:", { b: true, size: S });
  L.para(d.objectName, { size: S });
  L.gap(8);
  L.para("Ведомость объёмов выполненных работ", { b: true, h: "center", size: 11 });
  L.gap(6);
  L.para(d.title, { size: S });
  L.gap(4);
  L.para("Объём работ составлен согласно комплектам исполнительной документации:", { size: S });
  L.para(`№ ${d.sectionCode}`, { size: S });
  L.gap(6);
  xlsxBlankTable(L, view, vorRowsOf(d), { nums: true, size: S });
  L.gap(14);
  // Надпись — на все графы, кроме последней; линия подписи — последняя графа.
  if (view.shown("signs")) for (const [label, who] of [["Представитель заказчика", d.customer], ["Представитель монтажной организации", d.contractor]]) {
    L.line([{ c1: 1, c2: Math.max(1, L.cols - 2), text: `${label}: ${who}` }, { c1: L.cols, c2: L.cols, text: "", under: true, caption: "(подпись)" }], S);
    L.gap(10);
  }
  return L;
}

export function avkSheet(d: AvkData, view: BlankView = blankView("avk:sbd")): Layout {
  // Альбомный лист, поля 10/12/10/15 мм: 297 − 27 = 270 мм; сетка 54 столбца по 5 мм.
  const L = new Layout(`АВК ${d.number}`, Array(54).fill(5), { landscape: true, margins: [10, 12, 10, 15] });
  const S = 9.5;
  L.para(`Акт входного контроля, технических средств и материалов № ${d.number}`, { b: true, h: "center", size: 13 });
  L.gap(6);
  L.line([{ c1: 1, c2: 27, text: d.city ? `Адрес : ${d.city}` : "" }, { c1: 28, c2: 54, text: `Дата составления: ${d.date}`, style: { h: "right" } }], S);
  L.para(d.customer ? `Заказчик: ${d.customer}` : "", { h: "right", size: S });
  L.gap(6);
  L.para(`Наименование объекта: ${d.objectName}`, { size: S });
  L.gap(6);
  L.para("Комиссия в составе", { b: true, size: S });
  L.field(`Представитель заказчика: ${d.customerRep}`, "", { size: S, i: false });
  L.field(`Представитель монтажной организации: ${d.contractorRep}`, "", { size: S, i: false });
  L.gap(4);
  L.para(`Составили настоящий акт о том, что поступившие на строительный объект следующие технические средства и материалы для зоны ${d.sectionName} прошедшие входной контроль соответствуют технической документации. Спецификации РД, Техническим решениям авторского надзора : ${d.sectionCode}`, { size: S });
  L.gap(8);
  xlsxBlankTable(L, view, avkRowsOf(d), { size: 9 });
  for (const [label, who] of [["Представитель заказчика", d.customerRep], ["Представитель монтажной организации", d.contractorRep]]) {
    L.gap(10);
    L.field(`${label}: ${who}`, "", { size: S, i: false });
    L.caption("Должность/ФИО/Подпись", 1, L.cols, 6.5);
  }
  return L;
}

const PAIRS = ["А-В", "В-С", "С-А", "A-N (PEN)", "B-N (PEN)", "C-N (PEN)", "A-PE", "B-PE", "C-PE", "N-PE"];

export function ipSheet(d: IpData, view: BlankView = blankView("ip:sbd")): Layout {
  // Альбомный лист, поля 10 мм: 277 мм; столбцы — как графы таблицы результатов (видимые по настройке бланка).
  const L = new Layout(`Протокол ${d.number}`, pctCols(277, view.columns.map((x) => x.width)), { landscape: true, margins: [10, 10, 10, 10] });
  ipHead(L, d.lab.nameAddress, d.lab.certificate, `Заказчик: ${d.customer} Объект: ${d.object}. Проектная документация: ${d.project} Дата проведения измерений: ${d.dates}`);
  const S = 9;
  L.para(`Протокол №${d.number}`, { b: true, h: "center", size: 11 });
  L.para("проверки сопротивления изоляции проводов, кабелей и обмоток электрических машин.", { b: true, h: "center", size: S });
  L.gap(4);
  L.para("Климатические условия при проведении измерений", { b: true, h: "center", size: S });
  L.para(`Температура воздуха ${d.temperature} °C Влажность воздуха ${d.humidity} %`, { h: "center", size: S });
  L.gap(4);
  L.para("Цель измерений (испытаний)", { b: true, h: "center", size: S });
  L.para(d.purpose, { b: true, u: true, h: "center", size: S });
  L.caption("(приемо-сдаточные, сличительные, контрольные испытания, эксплуатационные, для целей сертификации)");
  L.gap(4);
  L.para(`Нормативные и технические документы, на соответствие требованиям которых проведены измерения (испытания): ${d.normative}`, { b: true, size: S });
  L.para("Результаты измерений:", { b: true, size: S });
  xlsxBlankTable(L, view, ipRowsOf(d), { nums: true, size: 8, minRow: 28 });
  L.gap(4);
  L.para(d.integrity, { size: S });
  L.para(`Заключение на соответствие требованиям НТД: ${d.conclusion}`, { size: S });
  L.gap(4);
  if (view.shown("instruments")) {
    L.para("Перечень используемых средств измерений.", { size: S });
    instruments(L, d.instruments);
  }
  L.gap(12);
  const half = Math.max(2, Math.floor(L.cols / 2));
  L.line([{ c1: 1, c2: Math.max(1, Math.floor(half / 2)), text: "Руководитель электролаборатории:" }, { c1: Math.floor(half / 2) + 1, c2: half, text: d.lab.head }], S);
  L.gap(8);
  L.line([{ c1: 1, c2: Math.max(1, Math.floor(half / 2)), text: "Испытания провел:" }, { c1: Math.floor(half / 2) + 1, c2: half, text: d.lab.tester }], S);
  return L;
}

/** Шапка протокола: две рамки — лаборатория (по центру) и заказчик/объект. */
export function ipHead(L: Layout, lab: string, cert: string, right: string) {
  const half = Math.ceil(L.cols / 2);
  const r = L.r + 1;
  const box = (c1: number, c2: number, lines: { t: string; s: CellStyle }[]) => {
    lines.forEach((l, i) => L.sheet.merge(r + i, c1, r + i, c2, l.t, { wrap: true, v: "top", ...l.s,
      border: { l: true, r: true, t: i === 0, b: i === lines.length - 1 } }));
  };
  const leftLines = [{ t: lab, s: { b: true, h: "center" as const } }, { t: "(наименование организации, предприятия)", s: { size: 6, h: "center" as const } }, { t: cert, s: { h: "center" as const, size: 9 } }];
  box(1, half, leftLines);
  L.sheet.merge(r, half + 1, r + 2, L.cols, right, { wrap: true, v: "top", size: 9, border: { t: true, b: true, l: true, r: true } });
  const wl = L.widthPt(1, half), wr = L.widthPt(half + 1, L.cols);
  const n = (t: string, w: number, size: number, b = false) => Math.max(1, Math.ceil(t.length ? wrapCount(t, w, size, b) : 1));
  const h0 = n(lab, wl, 10, true) * 12.5 + 1, h1 = 8, h2 = n(cert, wl, 9) * 11.5 + 1;
  const need = n(right, wr, 9) * 11.5 + 2;
  const extra = Math.max(0, need - (h0 + h1 + h2));
  L.sheet.height(r, h0 + extra / 2); L.sheet.height(r + 1, h1); L.sheet.height(r + 2, h2 + extra / 2);
  L.r = r + 2;
  L.gap(8);
}
const wrapCount = (t: string, w: number, size: number, b: boolean) => wrapLines(t, w, size, b).length;

/** Таблица средств измерений (протоколы): 9 граф, «Дата поверки» на две. */
export function instruments(L: Layout, list: { name: string; type: string; range: string; accuracy: string; serial: string; certificate: string; checkedOn: string; nextCheck: string; authority: string }[]) {
  // Таблица в 9 граф на сетке листа: каждая графа — несколько столбцов листа поровну.
  const per = Math.floor(L.cols / 9), extra = L.cols - per * 9;
  const spans = Array.from({ length: 9 }, (_, i) => per + (i === 8 ? extra : 0));
  const h = (header: string, i: number, rowspan = 2) => ({ header, span: spans[i], rowspan });
  L.table([
    [h("Наименование СИ", 0), h("Тип применяемого СИ", 1), h("Диапазон измерений", 2), h("Точность измерений", 3), h("Заводской номер", 4),
      h("№ свидетельства о поверке", 5), { header: "Дата поверки", span: spans[6] + spans[7] }, h("Орган государственной метрологической службы, проводивший поверку", 8)],
    [{ header: "последней", span: spans[6] }, { header: "очередной", span: spans[7] }],
  ], list.map((i) => [i.name, i.type, i.range, i.accuracy, i.serial, i.certificate, i.checkedOn, i.nextCheck, i.authority]
    .map((t, k) => ({ text: t, span: spans[k], style: C }))), { size: 7.5, repeat: false });
}

/** Кабельный журнал: на каждом листе — таблица на 30 строк и основная надпись (форма 3), как PDF «СБД». */
export function kjSheet(d: KjData): Sheet {
  // Границы столбцов (мм от левого края рамки): таблица журнала и основная надпись — на общей сетке.
  const COLS = [22, 18, 18, 22, 38, 13, 20, 12, 22];
  const tableB = COLS.reduce<number[]>((a, w) => [...a, (a.at(-1) ?? 0) + w], []);
  const stampB = [9, 18, 27, 39, 53, 65, 135, 135 + 50 / 3, 135 + 100 / 3, 185];
  const bounds = [...new Set([...tableB, ...stampB].map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b);
  const colsMm = bounds.map((b, i) => b - (bounds[i - 1] ?? 0));
  const col = (mm: number) => bounds.findIndex((b) => Math.abs(b - mm) < 0.01) + 1;
  /** Столбцы листа от левой границы a до правой b (мм). */
  const span = (a: number, b: number): [number, number] => [a === 0 ? 1 : col(a) + 1, col(b)];
  const sh = new Sheet(`КЖ ${d.stamp.code}`.trim(), colsMm, { margins: [5, 5, 5, 20] });
  const A = "Arial";
  const box: CellStyle = { font: A, h: "center", v: "center", wrap: true, border: { t: true, b: true, l: true, r: true } };
  const mm = (x: number) => (x * 72) / 25.4;
  let r = 0;
  const put = (row: number, a: number, b: number, text: string, s: CellStyle = {}, rows = 1, wMm = b - a, hMm = 7) => {
    const [c1, c2] = span(a, b);
    const size = s.size ?? (text ? fitFont(text, wMm - 1.4, hMm - 0.8, 7) : 7);
    sh.merge(row, c1, row + rows - 1, c2, text, { ...box, size, ...s });
  };
  const tcol = (i: number, n = 1): [number, number] => [tableB[i - 1] ?? 0, tableB[i + n - 1]];
  d.sheets.forEach((lines, si) => {
    // Шапка таблицы — 2 строки по 5,8 мм.
    const h1 = ++r, h2 = ++r;
    sh.height(h1, mm(5.8)); sh.height(h2, mm(5.8));
    const th = (row: number, i: number, n: number, text: string, rows = 1) => put(row, ...tcol(i, n), text, { size: 6.5 }, rows);
    th(h1, 0, 1, "Кабель, жгут, труба", 2); th(h1, 1, 2, "Направление"); th(h1, 3, 1, "Направление по планам расположения", 2);
    th(h1, 4, 2, "Кабель, провод"); th(h1, 6, 2, "Труба"); th(h1, 8, 1, "Примечание", 2);
    th(h2, 1, 1, "Откуда"); th(h2, 2, 1, "Куда"); th(h2, 4, 1, "Марка, число жил, сечение"); th(h2, 5, 1, "Длина, м"); th(h2, 6, 1, "Марка, диаметр"); th(h2, 7, 1, "Длина, м");
    for (let k = 0; k < JOURNAL_LINES_PER_SHEET; k++) {
      const row = ++r;
      sh.height(row, mm(7.1));
      const l: JournalLine | undefined = lines[k];
      const td = (i: number, n: number, text: string, s: CellStyle = {}) => put(row, ...tcol(i, n), text, s);
      if (!l) { for (let i = 0; i < 9; i++) td(i, 1, ""); continue; }
      if (l.kind === "group") { td(0, 9, l.title, { b: true }); continue; }
      if (l.kind === "total") {
        if (l.pipe) { td(0, 6, l.label, { h: "right" }); td(6, 1, l.mark); td(7, 1, l.length); td(8, 1, ""); }
        else { td(0, 4, l.label, { h: "right" }); td(4, 1, l.mark); td(5, 1, l.length); td(6, 1, ""); td(7, 1, ""); td(8, 1, ""); }
        continue;
      }
      const x = l.row;
      [x.designation, x.from, x.to, x.direction, x.cableMark, formatNumber(x.cableLength), x.pipeMark, formatNumber(x.pipeLength), x.note]
        .forEach((t, i) => td(i, 1, t));
    }
    // Основная надпись: слева 12 строк по 4,5 мм, справа — шифр, объект, раздел/стадия, наименование/организация.
    const s = d.stamp;
    const top = r + 1;
    for (let i = 0; i < 12; i++) sh.height(top + i, mm(4.5));
    const L6 = [0, 9, 18, 27, 39, 53, 65];
    const small: CellStyle = { size: 5.5, wrap: false, shrink: true };
    const leftRow = (row: number, cells: [number, number, string][]) => cells.forEach(([a, b, t]) => put(row, L6[a], L6[b], t, small));
    leftRow(top, [[0, 1, ""], [1, 2, ""], [2, 3, ""], [3, 4, ""], [4, 5, ""], [5, 6, ""]]);
    leftRow(top + 1, [[0, 1, "Изм."], [1, 2, "Кол.уч"], [2, 3, "Лист"], [3, 4, "№ док."], [4, 5, "Подпись"], [5, 6, "Дата"]]);
    for (let i = 0; i < 5; i++) {
      const p = s.signers[i];
      leftRow(top + 2 + i * 2, [[0, 2, p?.position ?? ""], [2, 4, p?.name ?? ""], [4, 5, ""], [5, 6, p ? s.date : ""]]);
      leftRow(top + 3 + i * 2, [[0, 6, p?.org ?? ""]]);
    }
    const thick: CellStyle = { borderStyle: "medium" };
    put(top, 65, 185, s.code, { ...thick, size: fitFont(s.code, 114, 11, 11) }, 3, 120, 13.5);
    put(top + 3, 65, 185, s.object, { ...thick, size: fitFont(s.object, 114, 12, 7) }, 3, 120, 13.5);
    put(top + 6, 65, 135, s.section, { size: fitFont(s.section, 66, 13, 9) }, 3, 70, 13.5);
    put(top + 6, 135, stampB[7], "Стадия", { size: 7 });
    put(top + 6, stampB[7], stampB[8], "Лист", { size: 7 });
    put(top + 6, stampB[8], 185, "Листов", { size: 7 });
    put(top + 7, 135, stampB[7], "ИД", { size: 7 }, 2);
    put(top + 7, stampB[7], stampB[8], String(si + 1), { size: 7 }, 2);
    put(top + 7, stampB[8], 185, String(d.sheets.length), { size: 7 }, 2);
    put(top + 9, 65, 135, "Кабельный журнал", { size: 9 }, 3, 70, 13.5);
    put(top + 9, 135, 185, s.org, { size: fitFont(s.org, 46, 13, 8) }, 3, 50, 13.5);
    r = top + 11;
    // Рамка чертежа и граница основной надписи — толстые линии.
    sh.outline(h1, 1, r, colsMm.length);
    sh.outline(top, 1, r, colsMm.length);
    if (si < d.sheets.length - 1) sh.breakAfter(r);
  });
  sh.titleRows = null;
  return sh;
}
