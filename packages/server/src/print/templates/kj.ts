// Кабельный журнал: листы А4 в рамке чертежа с основной надписью (форма 3), как стр. 19 образца СБД.
import type { KjData } from "../cableData.ts";
import type { JournalLine } from "@idk/shared/acts/cableDocs";
import { JOURNAL_LINES_PER_SHEET } from "@idk/shared/acts/cableDocs";
import { e, page } from "./common.ts";
import { formatNumber } from "@idk/shared/acts/format";

const STYLE = `<style>
@page { size: A4 portrait; margin: 0; }
body.kj { font-family: Arial, "Liberation Sans", sans-serif; font-size: 7pt; }
.sheet { position: relative; width: 210mm; height: 297mm; page-break-after: always; overflow: hidden; }
.sheet:last-child { page-break-after: auto; }
.frame { position: absolute; left: 20mm; top: 5mm; width: 185mm; height: 287mm; border: 0.7mm solid #000; }
.side { position: absolute; left: 8mm; bottom: 5mm; width: 12mm; border: 0.5mm solid #000; border-right: 0; }
.side div { height: 25mm; border-bottom: 0.3mm solid #000; display: flex; }
.side div:last-child { border-bottom: 0; }
.side span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 6pt; width: 5mm; border-right: 0.3mm solid #000; text-align: center; }
table.kj-t { width: 100%; border-collapse: collapse; table-layout: fixed; }
table.kj-t th, table.kj-t td { border: 0.3mm solid #000; padding: 0 1mm; text-align: center; overflow: hidden; }
table.kj-t th { font-weight: normal; height: 5.8mm; font-size: 6.5pt; white-space: normal; line-height: 1.05; }
table.kj-t td { height: 7.1mm; padding: 0 0.7mm; }
.fit { overflow: hidden; display: flex; align-items: center; justify-content: center; white-space: normal; line-height: 1.12; word-break: break-word; }
table.kj-t tr.grp td { font-weight: bold; }
table.kj-t tr.tot td.lbl { text-align: right; padding-right: 2mm; }
.stamp { position: absolute; left: 0; right: 0; bottom: 0; height: 55mm; border-top: 0.7mm solid #000; display: flex; }
.st-left { width: 65mm; border-right: 0.7mm solid #000; }
.st-left table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.st-left td { border: 0.3mm solid #000; height: 4.5mm; padding: 0 0.5mm; font-size: 5.5pt; line-height: 1; overflow: hidden; white-space: nowrap; }
.st-right { flex: 1; display: grid; grid-template-rows: 12mm 13mm 15mm 15mm; }
.st-right > div { border-bottom: 0.3mm solid #000; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 2mm; }
.st-right > div:last-child { border-bottom: 0; }
.st-code { font-size: 11pt; }
.st-right > div > .fit, .st-row > div > .fit { width: 100%; }
.st-obj { font-size: 6pt; line-height: 1.15; }
.st-row { display: flex; padding: 0 !important; align-items: stretch !important; }
.st-row > div { display: flex; align-items: center; justify-content: center; text-align: center; border-right: 0.3mm solid #000; padding: 0 1.5mm; }
.st-row > div:last-child { border-right: 0; }
.st-name { flex: 1; font-size: 9pt; }
.st-meta { width: 50mm; display: grid !important; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 5mm 1fr; padding: 0 !important; }
.st-meta span { border-right: 0.3mm solid #000; border-bottom: 0.3mm solid #000; display: flex; align-items: center; justify-content: center; }
.st-meta span:nth-child(3n) { border-right: 0; }
.st-meta span:nth-child(n+4) { border-bottom: 0; }
.st-org { width: 50mm; font-size: 8pt; }
</style>`;

const COLS = [22, 18, 18, 22, 38, 13, 20, 12, 22];
/** Ширина рабочего поля рамки, мм (185 мм минус линии рамки). */
const INNER = 183.6;
const ROW_H = 7.1;

/** Кегль, при котором текст помещается в блок ширины w и высоты h (мм): строки не раздвигаются. */
export function fitFont(text: string, w: number, h: number, maxPt: number, minPt = 3): number {
  const len = Math.max(1, text.length);
  for (let pt = maxPt; pt > minPt; pt -= 0.25) {
    const charW = pt * 0.3528 * 0.62;   // средняя ширина знака Arial (кириллица), с запасом
    const lineH = pt * 0.3528 * 1.18;
    const perLine = Math.max(1, Math.floor(w / charW));
    if (Math.ceil(len / perLine) * lineH <= h) return Math.round(pt * 100) / 100;
  }
  return minPt;
}

/** Текст в блоке фиксированного размера: кегль подбирается, лишнее обрезается — строка не растёт. */
function fit(text: string, w: number, h: number, maxPt: number, align = "center"): string {
  const pt = fitFont(text, w, h, maxPt);
  const justify = align === "right" ? "flex-end" : align === "left" ? "flex-start" : "center";
  return `<div class="fit" style="height:${h}mm;font-size:${pt}pt;text-align:${align};justify-content:${justify}">${e(text)}</div>`;
}
const colW = (i: number, span = 1) => COLS.slice(i, i + span).reduce((a, b) => a + b, 0) * INNER / 185 - 1.4;
const cell = (text: string, i: number, span = 1, align = "center") =>
  `<td${span > 1 ? ` colspan="${span}"` : ""}>${fit(text, colW(i, span), ROW_H - 0.8, 7, align)}</td>`;

function line(l: JournalLine | undefined): string {
  if (!l) return `<tr>${COLS.map(() => "<td></td>").join("")}</tr>`;
  if (l.kind === "group") return `<tr class="grp">${cell(l.title, 0, 9)}</tr>`;
  if (l.kind === "total") {
    return l.pipe
      ? `<tr class="tot">${cell(l.label, 0, 6, "right")}${cell(l.mark, 6)}${cell(l.length, 7)}<td></td></tr>`
      : `<tr class="tot">${cell(l.label, 0, 4, "right")}${cell(l.mark, 4)}${cell(l.length, 5)}<td></td><td></td><td></td></tr>`;
  }
  const r = l.row;
  return `<tr>${cell(r.designation, 0)}${cell(r.from, 1)}${cell(r.to, 2)}${cell(r.direction, 3)}${cell(r.cableMark, 4)}` +
    `${cell(formatNumber(r.cableLength), 5)}${cell(r.pipeMark, 6)}${cell(formatNumber(r.pipeLength), 7)}${cell(r.note, 8)}</tr>`;
}

function stamp(d: KjData, no: number, total: number): string {
  const s = d.stamp;
  const signRows = Array.from({ length: 5 }, (_, i) => s.signers[i]);
  const rows = [
    `<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>`,
    `<tr><td>Изм.</td><td>Кол.уч</td><td>Лист</td><td>№ док.</td><td>Подпись</td><td>Дата</td></tr>`,
    ...signRows.flatMap((p) => [
      `<tr><td colspan="2">${e(p?.position ?? "")}</td><td colspan="2">${e(p?.name ?? "")}</td><td></td><td>${p ? e(s.date) : ""}</td></tr>`,
      `<tr><td colspan="6">${e(p?.org ?? "")}</td></tr>`,
    ]),
  ].join("");
  return `<div class="stamp">
    <div class="st-left"><table><colgroup><col style="width:9mm"><col style="width:9mm"><col style="width:9mm"><col style="width:12mm"><col style="width:14mm"><col style="width:12mm"></colgroup>${rows}</table></div>
    <div class="st-right">
      <div class="st-code">${fit(s.code, 114, 11, 11)}</div>
      <div class="st-obj">${fit(s.object, 114, 12, 7)}</div>
      <div class="st-row"><div class="st-name">${fit(s.section, 66, 14, 9)}</div><div class="st-meta"><span>Стадия</span><span>Лист</span><span>Листов</span><span>ИД</span><span>${no}</span><span>${total}</span></div></div>
      <div class="st-row"><div class="st-name">${fit("Кабельный журнал", 66, 14, 9)}</div><div class="st-org">${fit(s.org, 46, 14, 8)}</div></div>
    </div>
  </div>`;
}

export function kjHtml(d: KjData): string {
  const head = `<thead>
    <tr><th rowspan="2">Кабель, жгут, труба</th><th colspan="2">Направление</th><th rowspan="2">Направление по планам расположения</th>
      <th colspan="2">Кабель, провод</th><th colspan="2">Труба</th><th rowspan="2">Примечание</th></tr>
    <tr><th>Откуда</th><th>Куда</th><th>Марка, число жил, сечение</th><th>Длина, м</th><th>Марка, диаметр</th><th>Длина, м</th></tr></thead>`;
  const sheets = d.sheets.map((lines, i) => `<section class="sheet">
    <div class="side"><div><span>Взам. инв. №</span></div><div><span>Подп. и дата</span></div><div><span>Инв. № подл.</span></div></div>
    <div class="frame">
      <table class="kj-t"><colgroup>${COLS.map((w) => `<col style="width:${(w / 185 * 100).toFixed(2)}%">`).join("")}</colgroup>${head}
        <tbody>${Array.from({ length: JOURNAL_LINES_PER_SHEET }, (_, k) => line(lines[k])).join("")}</tbody></table>
      ${stamp(d, i + 1, d.sheets.length)}
    </div></section>`).join("");
  return page(`Кабельный журнал ${d.stamp.code}`, STYLE + sheets, "kj");
}
