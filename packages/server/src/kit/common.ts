// Общий реестр исполнительной документации объекта: строки реестров всех комплектов подряд, по группам «Реестр №…»,
// сквозная нумерация, листы — по документам (как при сборке комплекта), страницы — внутри своего комплекта. PDF и Excel.
import { PDFDocument } from "pdf-lib";
import type { KitRequest } from "@idk/shared/kit/request";
import { orgFullForm } from "@idk/shared/rules";
import type { Organization } from "@idk/shared/schemas";
import { DEFAULT_TEMPLATE } from "@idk/shared/templates";
import { e, page } from "../print/templates/common.ts";
import { htmlToPdf } from "../print/browser.ts";
import { writeBook, type CellStyle } from "../xlsx/book.ts";
import { Layout, pctCols, type TCell } from "../xlsx/layout.ts";
import { bundleOf, pageRange, rowPdf, type KitDeps } from "./assemble.ts";
import { resolveScan, loadScan } from "./files.ts";
import type { RegistryLine } from "./templates.ts";

export interface CommonGroup { title: string; lines: RegistryLine[]; sheets: number }
export interface CommonRegistry {
  objectLine: string;
  parties: { label: string; value: string }[];
  groups: CommonGroup[];
  docs: number; sheets: number;
  /** Строки, листы которых не посчитаны (нет скана, ошибка печати): лист оставлен по графе «Листов» или пустым. */
  warnings: string[];
}

export const COMMON_TITLE = "ОБЩИЙ РЕЕСТР ИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ";
export const COMMON_NAME = "Общий реестр ИД";

/** Заголовок группы: «Реестр №1.<шифр> Том 1 Часть 2 — <раздел>». */
export function groupTitle(q: KitRequest): string {
  const k = q.kit;
  const head = `Реестр №${k.number}.${k.code}${k.volume ? ` Том ${k.volume}` : ""}${k.part ? ` Часть ${k.part}` : ""}`;
  const what = [k.sectionName, k.works].map((s) => s.trim()).filter(Boolean)[0] ?? "";
  return what ? `${head} — ${what}` : head;
}

/** Листы каждого документа — по его PDF (документ конструктора) или скану; не удалось — по графе «Листов». */
export async function commonRegistry(qs: KitRequest[], deps: KitDeps): Promise<CommonRegistry> {
  const warnings: string[] = [];
  const groups: CommonGroup[] = [];
  let n = 0;
  for (const q of qs) {
    const lines: RegistryLine[] = [];
    let next = 1;
    for (const row of q.rows) {
      let count: number | null = null;
      try {
        if (row.doc) {
          if (!bundleOf(q, row)) throw new Error(row.doc.proto ? `нет данных документа «${row.doc.proto}»` : `нет данных акта «${row.doc.act}»`);
          count = (await PDFDocument.load(await rowPdf(q, row, deps, q.template || DEFAULT_TEMPLATE))).getPageCount();
        } else {
          const r = resolveScan(row.file ?? { name: "", link: null }, { ...deps, scanFolder: q.scanFolder });
          if (!r.ok) throw new Error(r.message);
          count = (await loadScan(r)).getPageCount();
        }
      } catch (err) {
        // Браузер не найден — общая ошибка, а не строка реестра.
        if ((err as { status?: number }).status === 503) throw err;
        warnings.push(`Реестр №${q.kit.number}, строка ${row.row + 1} «${row.name || row.number}»: ${(err as Error).message}`);
      }
      const sheets = row.sheets ?? count ?? 0;
      lines.push({
        n: ++n, number: row.number, name: row.name, date: row.date, sheets, copies: row.copies, code: row.code,
        pages: count ? pageRange(next, count) : "",
      });
      next += count ?? row.sheets ?? 0;
    }
    groups.push({ title: groupTitle(q), lines, sheets: lines.reduce((s, l) => s + l.sheets, 0) });
  }
  const first = qs[0];
  const full = (o: Organization | null | undefined) => (o ? orgFullForm(o) : "");
  const building = first?.kit.building ?? "";
  return {
    objectLine: building ? `${building} в составе объекта ${first.object.name}` : first?.object.name ?? "",
    parties: first ? [
      { label: "Заказчик:", value: full(first.developer) },
      { label: "Разработчик рабочей документации:", value: full(first.designer) },
      { label: "Подрядчик:", value: full(first.contractor) },
      ...(first.object.contractNumber ? [{ label: "Основание для выполнения работ:", value: `Договор подряда №${first.object.contractNumber}` }] : []),
    ].filter((p) => p.value) : [],
    groups, docs: n, sheets: groups.reduce((s, g) => s + g.sheets, 0), warnings,
  };
}

const HEAD = ["№ п/п", "Номер документа",
  "Тип документа (акт, лабораторное заключение, исполнительная схема, сертификат) с указанием наименования работ, осей, отметок и т.д.",
  "Дата составления документа или период", "Количество листов (включая приложения), шт.", "Количество экземпляров, шт.",
  "Шифр чертежа с указанием листов", "Примечание (страницы в реестре комплекта)"];
const WIDTHS = [4, 15, 37, 10, 8, 7, 12, 7];

const STYLE = `<style>
@page { size: A4 landscape; margin: 8mm 8mm 12mm 12mm; }
body.creg { font-size: 8pt; }
.reg-title { text-align: center; font-weight: bold; font-size: 10pt; }
.reg-object { text-align: center; font-weight: bold; font-size: 9pt; margin: 0 25mm 6pt; }
.reg-parties { display: grid; grid-template-columns: 52mm 1fr; border-top: 0.6pt solid #000; margin-bottom: 4pt; }
.reg-parties > div { border-bottom: 0.6pt solid #000; padding: 1pt 2pt; }
table.grid.reg-t th { font-weight: normal; font-size: 7.5pt; }
table.grid.reg-t td { font-size: 7.5pt; }
table.grid.reg-t td.l { text-align: left; }
table.grid.reg-t tr.grp td { font-weight: bold; background: #eeeeee; }
table.grid.reg-t tr.tot td { font-weight: bold; }
.reg-sign { display: grid; grid-template-columns: 18mm 1fr 40mm 10mm 40mm; align-items: end; margin-top: 10pt; break-inside: avoid; }
.reg-sign .line { border-bottom: 0.6pt solid #000; height: 10pt; }
.reg-sign .cap { grid-column: 3; font-size: 5pt; text-align: center; }
.reg-sign .cap2 { grid-column: 5; font-size: 5pt; text-align: center; }
</style>`;

export function commonRegistryHtml(d: CommonRegistry): string {
  const row = (l: RegistryLine) =>
    `<tr class="row"><td class="c">${l.n}</td><td class="c">${e(l.number)}</td><td class="l">${e(l.name)}</td><td class="c">${e(l.date)}</td>` +
    `<td class="c">${l.sheets || ""}</td><td class="c">${l.copies}</td><td class="c">${e(l.code)}</td><td class="c">${e(l.pages)}</td></tr>`;
  const body = d.groups.map((g) => `<tbody class="grp"><tr class="grp"><td colspan="8">${e(g.title)} (документов ${g.lines.length}, листов ${g.sheets})</td></tr>${g.lines.map(row).join("")}</tbody>`).join("");
  const sign = (label: string) =>
    `<div class="reg-sign"><div>${label}</div><div></div><div class="line"></div><div></div><div class="line"></div>` +
    `<div class="cap">(подпись)</div><div class="cap2">(дата)</div></div>`;
  return page(COMMON_TITLE, `${STYLE}
    <div class="reg-title">${COMMON_TITLE}</div>
    <div class="reg-object">Объект: ${e(d.objectLine)}</div>
    <div class="reg-parties">${d.parties.map((p) => `<div>${e(p.label)}</div><div>${e(p.value)}</div>`).join("")}</div>
    <table class="grid reg-t">
      <colgroup>${WIDTHS.map((w) => `<col style="width:${w}%">`).join("")}</colgroup>
      <thead><tr>${HEAD.map((h) => `<th>${e(h)}</th>`).join("")}</tr>
      <tr class="nums">${HEAD.map((_, i) => `<td>${i + 1}</td>`).join("")}</tr></thead>
      ${body}
      <tbody><tr class="tot"><td colspan="4" class="l">Всего: комплектов ${d.groups.length}, документов ${d.docs}</td><td class="c">${d.sheets}</td><td colspan="3"></td></tr></tbody>
    </table>
    ${sign("Сдал:")}${sign("Принял:")}`, "creg");
}

/** Тот же реестр на листе Excel (альбомный, поля как в PDF). */
export function commonRegistrySheet(d: CommonRegistry): Layout {
  const L = new Layout(COMMON_NAME, pctCols(277, WIDTHS), { landscape: true, margins: [8, 8, 12, 12], pageNumbers: true });
  const S = 7.5;
  L.para(COMMON_TITLE, { b: true, h: "center", size: 10 });
  L.para(`Объект: ${d.objectLine}`, { b: true, h: "center", size: 9 });
  L.gap(4);
  for (const p of d.parties) L.line([{ c1: 1, c2: 2, text: p.label, style: { border: { b: true } } }, { c1: 3, c2: 8, text: p.value, style: { border: { b: true } } }], S);
  L.gap(4);
  const C: CellStyle = { h: "center" };
  const body: TCell[][] = [];
  for (const g of d.groups) {
    body.push([{ text: `${g.title} (документов ${g.lines.length}, листов ${g.sheets})`, span: 8, style: { b: true, fill: "EEEEEE" } }]);
    for (const l of g.lines) body.push([
      { text: l.n, style: C }, { text: l.number, style: C }, { text: l.name }, { text: l.date, style: C },
      { text: l.sheets || "", style: C }, { text: l.copies, style: C }, { text: l.code, style: C }, { text: l.pages, style: C },
    ]);
  }
  body.push([{ text: `Всего: комплектов ${d.groups.length}, документов ${d.docs}`, span: 4, style: { b: true } }, { text: d.sheets, style: { b: true, h: "center" } }, { text: "", span: 3 }]);
  L.table([HEAD.map((h) => ({ header: h })), HEAD.map((_, i) => ({ header: String(i + 1) }))], body, { size: S, headSize: 7 });
  for (const label of ["Сдал:", "Принял:"]) {
    L.gap(12);
    L.line([{ c1: 1, c2: 1, text: label }, { c1: 3, c2: 4, text: "", under: true, caption: "(подпись)" }, { c1: 6, c2: 7, text: "", under: true, caption: "(дата)" }], 8);
  }
  return L;
}

export async function commonRegistryFiles(d: CommonRegistry): Promise<{ pdf: Buffer; xlsx: Buffer }> {
  return { pdf: await htmlToPdf(commonRegistryHtml(d), { pageNumbers: true }), xlsx: writeBook([commonRegistrySheet(d).sheet]) };
}
