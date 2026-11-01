// Исполнительная схема кабельной трассы: модель данных (JSON), проверка и расчёт длин.
// Координаты — в мм в системе координат осей здания: X — вдоль цифровых осей (слева направо),
// Y — вдоль буквенных (снизу вверх). Точку можно задать числом или привязкой к оси со смещением.
import { z } from "zod";

/** Стандартные масштабы (знаменатель 1:N), по возрастанию. */
export const SCALES = [20, 25, 50, 75, 100, 200, 250, 400, 500, 1000] as const;

/** Форматы листов, мм: [короткая сторона, длинная]. */
export const FORMATS = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841] } as const;
export type SheetFormat = keyof typeof FORMATS;

/** Способы прокладки. */
export const SEGMENT_KINDS = ["tray", "pipe", "corrugated", "cable"] as const;
export type SegmentKind = (typeof SEGMENT_KINDS)[number];
export const KIND_NAMES: Record<SegmentKind, string> = {
  tray: "Лоток кабельный",
  pipe: "Труба гладкая",
  corrugated: "Труба гофрированная",
  cable: "Кабель открыто",
};

const Axis = z.object({ name: z.string().min(1), pos: z.number() });

/** Координата: число (мм) или привязка к оси: { axis: "3", offset: 500 }. */
const Coord = z.union([z.number(), z.object({ axis: z.string().min(1), offset: z.number().default(0) })]);
export type Coord = z.infer<typeof Coord>;

const Node = z.object({
  id: z.string().min(1),
  x: Coord,
  y: Coord,
  /** Отметка, м (например 3.2 → «+3,200»). */
  level: z.number().nullable().default(null),
  label: z.string().default(""),
});

const Segment = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum(SEGMENT_KINDS),
  /** Марка: «ЛМ 200×50», «ПВХ 25», «ПНД 20». */
  mark: z.string().default(""),
  /** Ширина лотка / диаметр трубы, мм — для толщины на чертеже. */
  width: z.number().positive().nullable().default(null),
  /** Обозначения кабелей из кабельного журнала, проложенных по участку. */
  cables: z.array(z.string()).default([]),
});

const Signer = z.object({ role: z.string().default(""), name: z.string().default(""), date: z.string().default("") });

const Stamp = z.object({
  code: z.string().default(""),
  object: z.string().default(""),
  sheetName: z.string().default(""),
  stage: z.string().default("ИД"),
  sheet: z.number().int().positive().default(1),
  sheets: z.number().int().positive().default(1),
  org: z.string().default(""),
  signers: z.array(Signer).default([]),
});

const RouteBase = z.object({
  title: z.string().default("Исполнительная схема прокладки кабельных трасс"),
  format: z.enum(["A4", "A3", "A2", "A1"]).default("A3"),
  orientation: z.enum(["landscape", "portrait"]).default("landscape"),
  /** Знаменатель масштаба; null — подобрать по размеру трассы. */
  scale: z.number().int().positive().nullable().default(null),
  axes: z.object({ x: z.array(Axis).default([]), y: z.array(Axis).default([]) }).default({}),
  nodes: z.array(Node).min(2, "Нужно хотя бы две точки трассы"),
  segments: z.array(Segment).min(1, "Нужен хотя бы один участок трассы"),
  notes: z.array(z.string()).default([]),
  stamp: Stamp.default({}),
});

export const RouteScheme = RouteBase.superRefine((s, ctx) => {
  const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  const dup = (names: string[]) => names.filter((n, i) => names.indexOf(n) !== i);
  for (const d of new Set(dup(s.axes.x.map((a) => a.name)))) issue(`Ось «${d}» указана дважды`, ["axes", "x"]);
  for (const d of new Set(dup(s.axes.y.map((a) => a.name)))) issue(`Ось «${d}» указана дважды`, ["axes", "y"]);
  for (const d of new Set(dup(s.nodes.map((n) => n.id)))) issue(`Точка «${d}» указана дважды`, ["nodes"]);
  const ax = { x: new Set(s.axes.x.map((a) => a.name)), y: new Set(s.axes.y.map((a) => a.name)) };
  s.nodes.forEach((n, i) => {
    for (const k of ["x", "y"] as const) {
      const c = n[k];
      if (typeof c !== "number" && !ax[k].has(c.axis)) issue(`Точка «${n.id}»: нет оси «${c.axis}» по ${k.toUpperCase()}`, ["nodes", i, k]);
    }
  });
  const ids = new Set(s.nodes.map((n) => n.id));
  s.segments.forEach((g, i) => {
    for (const k of ["from", "to"] as const) if (!ids.has(g[k])) issue(`Участок ${i + 1}: нет точки «${g[k]}»`, ["segments", i, k]);
    if (g.from === g.to) issue(`Участок ${i + 1}: начало и конец совпадают`, ["segments", i]);
  });
});
export type RouteScheme = z.infer<typeof RouteScheme>;
export type RouteInput = z.input<typeof RouteScheme>;
export type RouteNode = RouteScheme["nodes"][number];
export type RouteSegment = RouteScheme["segments"][number];

/** Разбор JSON (от пользователя или ИИ) с понятными ошибками на русском. */
export function parseRoute(input: unknown): { ok: true; scheme: RouteScheme } | { ok: false; errors: string[] } {
  const r = RouteScheme.safeParse(input);
  if (r.success) return { ok: true, scheme: r.data };
  return { ok: false, errors: r.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)) };
}

export interface Point { x: number; y: number }

/** Координаты точек в мм (привязки к осям раскрыты). */
export function resolveNodes(s: RouteScheme): Map<string, Point> {
  const pos = (k: "x" | "y", c: Coord) => {
    if (typeof c === "number") return c;
    const a = s.axes[k].find((a) => a.name === c.axis);
    if (!a) throw new Error(`Нет оси «${c.axis}»`);
    return a.pos + c.offset;
  };
  return new Map(s.nodes.map((n) => [n.id, { x: pos("x", n.x), y: pos("y", n.y) }]));
}

/**
 * Длина участка, м: по плану плюс перепад отметок (подъём/опуск — отдельный вертикальный участок).
 * Если отметка задана только у одного конца, перепад не учитывается.
 */
export function segmentLength(s: RouteScheme, g: RouteSegment, pts = resolveNodes(s)): number {
  const a = pts.get(g.from)!, b = pts.get(g.to)!;
  const plan = Math.hypot(b.x - a.x, b.y - a.y) / 1000;
  const la = s.nodes.find((n) => n.id === g.from)!.level, lb = s.nodes.find((n) => n.id === g.to)!.level;
  const rise = la != null && lb != null ? Math.abs(lb - la) : 0;
  return plan + rise;
}

export interface RouteTotal { kind: SegmentKind; mark: string; length: number }

/** Ведомость: суммарная длина по способу прокладки и марке, м (округление до 0,1). */
export function routeTotals(s: RouteScheme): RouteTotal[] {
  const pts = resolveNodes(s);
  const acc = new Map<string, RouteTotal>();
  for (const g of s.segments) {
    const key = `${g.kind}\u0000${g.mark}`;
    const t = acc.get(key) ?? { kind: g.kind, mark: g.mark, length: 0 };
    t.length += segmentLength(s, g, pts);
    acc.set(key, t);
  }
  return [...acc.values()]
    .map((t) => ({ ...t, length: Math.round(t.length * 10) / 10 }))
    .sort((a, b) => SEGMENT_KINDS.indexOf(a.kind) - SEGMENT_KINDS.indexOf(b.kind) || a.mark.localeCompare(b.mark, "ru"));
}

/** Длина по кабелям, м: сколько трассы проходит каждый кабель (для сверки с кабельным журналом). */
export function cableRouteLengths(s: RouteScheme): Map<string, number> {
  const pts = resolveNodes(s);
  const out = new Map<string, number>();
  for (const g of s.segments) for (const c of g.cables) out.set(c, (out.get(c) ?? 0) + segmentLength(s, g, pts));
  for (const [k, v] of out) out.set(k, Math.round(v * 10) / 10);
  return out;
}

/** «+3,200» / «-0,450» / «±0,000». */
export function formatLevel(m: number): string {
  const v = Math.abs(m).toFixed(3).replace(".", ",");
  if (Math.abs(m) < 0.0005) return `±${v}`;
  return `${m > 0 ? "+" : "-"}${v}`;
}
