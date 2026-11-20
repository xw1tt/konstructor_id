// План 28: бланки набора «ТИ» в Excel — ВД, РМ, РП, кабельный журнал (как PDF).
import type { TiData, TiHeader } from "../tiData.ts";
import type { TiJournal, KamJournal } from "@idk/shared/acts/cableDocs";
import type { CellStyle } from "../../xlsx/book.ts";
import { Layout, wrapLines, lineHeight } from "../../xlsx/layout.ts";
import { PORTRAIT } from "./aosr.ts";
import { blankView, type BlankView } from "@idk/shared/blanks";
import { xlsxBlankTable } from "../blankTable.ts";
import { tiVdRows, tiRmRows, tiRpRows, tiKjRows, kamKjRows } from "../templates/ti.ts";
import { withNo } from "@idk/shared/acts/format";

const S = 8.5;
const N = 36;

/** Шапка ВД и КЖ: слева подрядчик и участок, справа город, заказчик, объект, дата — значение на линии, подпись под ним.
 *  Колонки идут строка в строку: пара «значение + подпись» слева и справа — в одних строках листа. */
export function tiHead(L: Layout, h: TiHeader) {
  const third = Math.round(L.cols * 0.36);
  const sides = [
    { c1: 1, c2: third },
    { c1: L.cols - third + 1, c2: L.cols },
  ];
  const left: [string, string][] = [
    [h.contractor, "(подрядная организация)"],
    [[h.sectionName, h.sectionCode].filter(Boolean).join("\n"), "(участок)"],
  ];
  const right: [string, string][] = [
    [h.city, "(город)"],
    [h.customer, "(заказчик)"],
    [h.object, "(объект)"],
    [h.day ? `"${h.day}" ${h.month} ${h.year}г.` : "", "(дата)"],
  ];
  const val: CellStyle = { b: true, size: 9, h: "center", shrink: true, border: { b: true } };
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const items = [left[i], right[i]];
    const lines = items.map((it, k) => (it ? (it[0] ? wrapLines(it[0], L.widthPt(sides[k].c1, sides[k].c2), 9, true) : [""]) : []));
    const n = Math.max(...lines.map((l) => l.length));
    for (let r = 0; r < n; r++) {
      const row = L.next();
      L.sheet.height(row, lineHeight(9) + 0.5);
      lines.forEach((ls, k) => {
        if (r < ls.length) L.sheet.merge(row, sides[k].c1, row, sides[k].c2, ls[r], val);
      });
    }
    const cap = L.next();
    L.sheet.height(cap, lineHeight(6) + 2);
    items.forEach((it, k) => {
      if (it) L.sheet.merge(cap, sides[k].c1, cap, sides[k].c2, it[1], { size: 6, h: "center", v: "top" });
    });
  }
  L.gap(6);
}

const title = (L: Layout, t: string, size = 10.5) => L.para(t, { b: true, h: "center", size });
const tiSigns = (L: Layout, d: TiData) => {
  L.gap(8);
  L.signs(d.signs, { labelBold: true, nameBold: false, capSize: 6, gap: 5 });
};

export function tiVdSheet(d: TiData, view: BlankView = blankView("vd:ti")): Layout {
  const L = new Layout(`ВД ${d.vdNumber}`, Array(N).fill(180 / N), PORTRAIT);
  tiHead(L, d.header);
  title(L, `ВЕДОМОСТЬ № ${d.vdNumber}`);
  title(L, "СМОНТИРОВАННОГО ЭЛЕКТРООБОРУДОВАНИЯ И МАТЕРИАЛОВ");
  L.gap(6);
  xlsxBlankTable(L, view, tiVdRows(d), { nums: true, size: S });
  tiSigns(L, d);
  return L;
}

function appendixHead(L: Layout, t1: string, t2: string, number: string, d: TiData) {
  title(L, t1);
  title(L, t2);
  title(L, `${withNo(String(number ?? ""))}`);
  L.para(`к АОСР ${d.aosrNumber} от ${d.actDate}г.`, { h: "center", size: 9 });
  L.gap(6);
}

/** РМ: документы материала (серые строки), затем материал — как PDF. */
export function tiRmSheet(d: TiData, view: BlankView = blankView("rim:ti")): Layout {
  const L = new Layout(`РМ ${d.rmNumber}`, Array(N).fill(180 / N), PORTRAIT);
  appendixHead(L, "РЕЕСТР", "применённых материалов", d.rmNumber, d);
  xlsxBlankTable(L, view, tiRmRows(d), { size: S });
  tiSigns(L, d);
  return L;
}

export function tiRpSheet(d: TiData, view: BlankView = blankView("rp:ti")): Layout {
  const L = new Layout(`РП ${d.rpNumber}`, Array(N).fill(180 / N), PORTRAIT);
  appendixHead(L, "РЕЕСТР", "документов, подтверждающих соответствие работ", d.rpNumber, d);
  xlsxBlankTable(L, view, tiRpRows(d), { size: S });
  tiSigns(L, d);
  return L;
}

export function tiKjSheet(d: { header: TiHeader; number: string; journal: TiJournal }, view: BlankView = blankView("kj:ti")): Layout {
  // Альбомный лист, поля 10/10/10/12 мм: 275 мм, сетка 55 столбцов по 5 мм.
  const L = new Layout(`КЖ ${d.number}`, Array(55).fill(5), { landscape: true, margins: [10, 10, 10, 12] });
  tiHead(L, d.header);
  title(L, `Кабельный журнал ${withNo(String(d.number ?? ""))}`, 12);
  L.gap(6);
  xlsxBlankTable(L, view, tiKjRows(d.journal, view), { size: 8 });
  // «Сдал:» / «Принял:» — надпись 20 мм, линия 70 мм, линия 40 мм («Подпись»), линия 30 мм («Дата»).
  if (view.shown("signs"))
    for (const label of ["Сдал:", "Принял:"]) {
      L.gap(10);
      L.line(
        [
          { c1: 1, c2: 4, text: label, style: { h: "left" } },
          { c1: 5, c2: 18, text: "", under: true },
          { c1: 21, c2: 28, text: "", under: true, caption: "Подпись" },
          { c1: 31, c2: 36, text: "", under: true, caption: "Дата" },
        ],
        9,
      );
    }
  return L;
}

// ---------- 0.46: набор «Камчатка» ----------

function kamHead(L: Layout, sub: string, d: TiData) {
  title(L, "РЕЕСТР");
  title(L, sub);
  title(L, `к АОСР ${d.aosrNumber} от ${d.actDate}г.`);
  L.gap(6);
}

export function kamRmSheet(d: TiData, view: BlankView = blankView("rim:kam")): Layout {
  const L = new Layout(`РПМ ${d.rmNumber}`, Array(N).fill(180 / N), PORTRAIT);
  kamHead(L, "примененных материалов", d);
  xlsxBlankTable(L, view, tiRmRows(d), { size: S });
  tiSigns(L, d);
  return L;
}

export function kamRpSheet(d: TiData, view: BlankView = blankView("rp:kam")): Layout {
  const L = new Layout(`РП ${d.rpNumber}`, Array(N).fill(180 / N), PORTRAIT);
  kamHead(L, "приложений", d);
  xlsxBlankTable(L, view, tiRpRows(d), { size: S });
  tiSigns(L, d);
  return L;
}

export function kamKjSheet(d: { header: TiHeader; number: string; journal: KamJournal }, view: BlankView = blankView("kj:kam")): Layout {
  const L = new Layout(`КЖ ${d.number}`, Array(55).fill(5), { landscape: true, margins: [10, 10, 10, 12] });
  tiHead(L, d.header);
  title(L, `Кабельный журнал ${withNo(String(d.number ?? ""))}`, 12);
  L.gap(6);
  xlsxBlankTable(L, view, kamKjRows(d.journal, view), { size: 8 });
  if (view.shown("signs")) {
    L.gap(10);
    L.line(
      [
        { c1: 1, c2: 4, text: "Сдал:", style: { h: "left" } },
        { c1: 5, c2: 18, text: "", under: true, caption: "(Ф.И.О.)" },
        { c1: 21, c2: 28, text: "", under: true, caption: "(подпись)" },
        { c1: 31, c2: 36, text: "", under: true, caption: "(дата)" },
      ],
      9,
    );
  }
  return L;
}
