// Тексты экрана «Спецификация»: итог загрузки РКЦ, карточка позиции, строка подбора № п/п.
import type { SpecDiff } from "@idk/shared/spec/merge";
import type { SpecPosition } from "@idk/shared/spec/closed";
import type { SpecMatch } from "@idk/shared/spec/match";
import { formatNumber } from "@idk/shared/acts/format";

export function diffText(d: SpecDiff): string {
  const miss = d.missing.length ? `${d.missing.length} (${d.missing.join(", ")})` : "0";
  return `Новых позиций: ${d.added.length}. Изменено: ${d.changed.length}. Нет в РКЦ: ${miss}. Без изменений: ${d.same}.`;
}

const q = (n: number, unit: string) => `${n < 0 ? "−" + formatNumber(-n) : formatNumber(n)}${unit ? " " + unit : ""}`;

export function positionLines(p: SpecPosition): string[] {
  return [
    `По проекту: ${q(p.quantity, p.unit)}`,
    `Закрыто: ${q(p.closed, p.unit)}`,
    `Остаток: ${q(p.rest, p.unit)}${p.rest < 0 ? " — закрыто больше, чем по проекту" : ""}`,
    ...p.byAct.map((a) => `Акт №${a.act} — ${formatNumber(a.qty)}`),
    p.materials.length ? `Материалы: ${p.materials.join("; ")}` : "Материалы не привязаны",
  ];
}

export const matchLine = (m: SpecMatch) => `${m.material} → ${m.number} · ${m.name} · ${m.score} %`;
