// План 13: образец .docx с метками протокола или акта — из описания документа (protocols/defs.ts). Пользователь правит его
// в Word и загружает как форму документа шаблона; метки заполняет formData (protocols/form.ts).
import { PROTO_DEFS, type ProtoKind } from "@idk/shared/protocols/defs";
import { writeZip } from "../zip/zip.ts";
import { xmlEscape } from "./docx.ts";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';

interface POpts { bold?: boolean; center?: boolean; size?: number }
const run = (text: string, o: POpts = {}) =>
  `<w:r><w:rPr>${FONT}${o.bold ? "<w:b/>" : ""}<w:sz w:val="${(o.size ?? 10) * 2}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
const p = (text: string, o: POpts = {}) =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="60"/>${o.center ? '<w:jc w:val="center"/>' : ""}</w:pPr>${text ? run(text, o) : ""}</w:p>`;

const BORDERS = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join("")}</w:tblBorders>`;

/** Таблица: ширины столбцов в долях, строки — тексты ячеек; head — строки шапки (повторяются на страницах). */
function table(widths: number[], rows: string[][], o: { head?: number; borders?: boolean; size?: number; total: number }): string {
  const sum = widths.reduce((s, x) => s + x, 0);
  const tw = widths.map((x) => Math.round((x / sum) * o.total));
  const grid = `<w:tblGrid>${tw.map((x) => `<w:gridCol w:w="${x}"/>`).join("")}</w:tblGrid>`;
  const tr = (cells: string[], i: number) => `<w:tr>${i < (o.head ?? 0) ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.map((c, j) =>
    `<w:tc><w:tcPr><w:tcW w:w="${tw[j]}" w:type="dxa"/></w:tcPr>${p(c, { size: o.size ?? 9, center: i < (o.head ?? 0), bold: i < (o.head ?? 0) && i === 0 })}</w:tc>`).join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${o.total}" w:type="dxa"/>${o.borders === false ? "" : BORDERS}<w:tblLayout w:type="fixed"/></w:tblPr>${grid}${rows.map(tr).join("")}</w:tbl>` + p("");
}

/** Строка-повтор списка: {#Список} в первой ячейке, {/Список} в последней. */
const repeat = (list: string, cells: string[]) => cells.map((c, i) => `${i === 0 ? `{#${list}}` : ""}${c}${i === cells.length - 1 ? `{/${list}}` : ""}`);

export function protoSampleDocx(kind: ProtoKind): Buffer {
  const def = PROTO_DEFS[kind];
  const landscape = def.signer === "lab" || def.columns.length > 6;
  const total = landscape ? 15300 : 9600;
  const sub = def.name.replace(/^(Протокол|Акт)\s+/, "");
  const cols = def.columns;
  const results = table([7, ...cols.map((c) => c.width ?? 8)], [
    ["№ п/п", ...cols.map((c) => c.header)],
    Array.from({ length: cols.length + 1 }, (_, i) => String(i + 1)),
    repeat("Строки", ["{Строка.№}", ...cols.map((c) => `{Строка.${c.header}}`)]),
  ], { head: 2, total });

  const body: string[] = [];
  if (def.signer === "lab") {
    body.push(
      table([1, 1], [["{Лаборатория.Наименование} {Лаборатория.Свидетельство}",
        "Заказчик: {Объект.Застройщик}. Объект: {Объект.Наименование}. Проектная документация: {Объект.Шифр РД}. Дата проведения измерений: {Документ.Период}"]], { total }),
      p("Протокол №{Документ.Номер}", { bold: true, center: true, size: 12 }),
      p(sub, { bold: true, center: true }),
      p(def.climate === "temp"
        ? "Климатические условия при проведении измерений: температура воздуха {Документ.Температура} °C."
        : "Климатические условия при проведении измерений: температура воздуха {Документ.Температура} °C, влажность воздуха {Документ.Влажность} %, атмосферное давление {Документ.Давление} мм рт. ст."),
      p("Цель измерений (испытаний): {Документ.Цель}"),
      p("Нормативные и технические документы, на соответствие требованиям которых проведены измерения (испытания): {Документ.Нормативы}"),
      p("Предмет: {Документ.Предмет}"),
      p("Результаты измерений:", { bold: true }),
      results,
      p("Заключение: {Документ.Заключение}"),
      p("Перечень используемых средств измерений."),
      table([14, 10, 10, 8, 9, 12, 8, 8, 21], [
        ["Наименование СИ", "Тип", "Диапазон измерений", "Точность", "Заводской номер", "№ свидетельства о поверке", "Дата поверки", "Очередная поверка", "Орган поверки"],
        repeat("Приборы", ["{Прибор.Наименование}", "{Прибор.Тип}", "{Прибор.Диапазон}", "{Прибор.Точность}", "{Прибор.Заводской №}",
          "{Прибор.Свидетельство}", "{Прибор.Поверка}", "{Прибор.Очередная поверка}", "{Прибор.Орган поверки}"]),
      ], { head: 1, total, size: 8 }),
      table([3, 2, 3], [["Руководитель электролаборатории:", "____________", "{Лаборатория.Руководитель}"],
        ["Испытания провел:", "____________", "{Лаборатория.Испытатель}"]], { total, borders: false, size: 10 }),
    );
  } else {
    body.push(
      p("АКТ №{Документ.Номер}", { bold: true, center: true, size: 12 }),
      p(sub, { bold: true, center: true }),
      table([1, 1], [["г. {Документ.Город}", "{Документ.Период}"]], { total, borders: false, size: 10 }),
      p("Объект: {Объект.Наименование}"),
      p("Предмет: {Документ.Предмет}"),
      p("Комиссия в составе:", { bold: true }),
      table([2, 5], [repeat("Комиссия", ["{Член.Роль}:", "{Член.Должность} {Член.Организация} {Член.ФИО}"])], { total, borders: false, size: 10 }),
      p(def.intro ?? ""),
      results,
      p("Заключение: {Документ.Заключение}"),
      p("Нормативы: {Документ.Нормативы}"),
      p("Подписи членов комиссии:", { bold: true }),
      table([4, 2, 2], [repeat("Комиссия", ["{Член.Должность} {Член.Организация}", "____________", "{Член.ФИО}"])], { total, borders: false, size: 10 }),
    );
  }
  const size = landscape ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
  const margins = landscape
    ? '<w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" w:header="0" w:footer="0" w:gutter="0"/>'
    : '<w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/>';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body.join("")}<w:sectPr>${size}${margins}</w:sectPr></w:body></w:document>`;
  return writeZip([
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ["word/document.xml", doc],
  ]);
}
