// План 26: АОСР в Excel — как PDF: сетка 36 столбцов по 5 мм (книжный лист, поля 10/10/10/20 мм).
import type { AosrData } from "../data.ts";
import { AOSR_CAPS, CAP_ORG, CAP_REP } from "../templates/aosr.ts";
import { Layout, colsFor } from "../../xlsx/layout.ts";

export const PORTRAIT = { margins: [10, 10, 10, 20] as [number, number, number, number] };
const W = 180, N = 36, COL = W / N;

export function aosrSheet(d: AosrData): Layout {
  const L = new Layout(d.number || "АОСР", Array(N).fill(COL), PORTRAIT);
  const block = (label: string, value: string | string[], caption: string) => {
    L.gap(3);
    L.para(label);
    L.field(value, caption);
  };
  block("Объект капитального строительства:", d.objectName, AOSR_CAPS.object);
  block("Застройщик, технический заказчик, лицо, ответственное за эксплуатацию здания, сооружения, или региональный оператор:", d.developer, CAP_ORG);
  block("Лицо, осуществляющее строительство, реконструкцию, капитальный ремонт:", d.builder, CAP_ORG);
  block("Лицо, осуществляющее подготовку проектной документации:", d.designer, CAP_ORG);
  L.gap(9);
  L.para("АКТ", { b: true, h: "center" });
  L.para("освидетельствования скрытых работ", { b: true, h: "center" });
  L.gap(6);
  // Номер — 60 мм слева, дата — 45 мм справа; значения посередине линии.
  L.line([
    { c1: 1, c2: 12, text: d.number ? `№${d.number}` : "", under: true, caption: AOSR_CAPS.number },
    { c1: 28, c2: N, text: d.date, under: true, caption: AOSR_CAPS.date },
  ]);
  for (const r of d.reps) block(`${r.label}:`, r.lines, CAP_REP);
  block("произвели осмотр работ, выполненных:", d.performerOrg, AOSR_CAPS.performer);
  L.para("и составили настоящий акт о нижеследующем:");
  // Вторая страница всегда начинается с п.1.
  L.pageBreak();
  block("1. К освидетельствованию предъявлены следующие работы:", d.works, AOSR_CAPS.works);
  block("2. Работы выполнены по проектной документации:", d.p2, AOSR_CAPS.p2);
  block("3. При выполнении работ применены:", d.p3, AOSR_CAPS.p3);
  block("4. Предъявлены документы, подтверждающие соответствие работ предъявляемым к ним требованиям:", d.p4, AOSR_CAPS.p4);
  L.gap(3);
  L.para("5. Даты:");
  // Отступ 12 мм ≈ 2 столбца, надпись 30 мм, линия 45 мм.
  L.line([{ c1: 3, c2: 8, text: "начала работ" }, { c1: 9, c2: 17, text: d.dateStart, under: true }]);
  L.gap(2);
  L.line([{ c1: 3, c2: 8, text: "окончания работ" }, { c1: 9, c2: 17, text: d.dateEnd, under: true }]);
  block("6. Работы выполнены в соответствии с", d.normative, AOSR_CAPS.normative);
  block("7. Разрешается производство последующих работ:", d.nextWorks, AOSR_CAPS.nextWorks);
  L.gap(4);
  const extra = "Дополнительные сведения:";
  const ec = colsFor(extra, COL);
  L.line([{ c1: 1, c2: ec, text: extra }, { c1: ec + 1, c2: Math.max(ec + 6, ec + colsFor(d.extraInfo, COL, 10, true, true) + 1), text: d.extraInfo, under: true }]);
  L.gap(4);
  const made = "Акт составлен в";
  const mc = colsFor(made, COL);
  L.line([
    { c1: 1, c2: mc, text: made }, { c1: mc + 1, c2: mc + 6, text: String(d.copies), under: true },
    { c1: mc + 7, c2: N, text: "экземплярах (в случае заполнения акта на бумажном носителе)." },
  ]);
  block("Приложения:", d.attachments, AOSR_CAPS.attachments);
  L.gap(6);
  L.signs(d.signs.map((s) => ({ label: s.label, names: s.names })));
  return L;
}
