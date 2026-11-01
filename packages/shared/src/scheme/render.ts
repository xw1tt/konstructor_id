// Отрисовка исполнительной схемы трассы в SVG. Единица — мм листа (viewBox в мм, width/height в мм),
// поэтому при печати через Edge в PDF масштаб соблюдается точно.
import {
  FORMATS, KIND_NAMES, SCALES, formatLevel, resolveNodes, routeTotals, segmentLength,
  type Point, type RouteScheme, type SegmentKind,
} from "./route.ts";

export interface RenderResult {
  svg: string;
  /** Применённый масштаб 1:N. */
  scale: number;
  /** Ширина и высота листа, мм. */
  width: number;
  height: number;
  warnings: string[];
}

const FONT = "ISOCPEUR, 'GOST type A', 'Arial Narrow', Arial, sans-serif";
const STAMP_W = 185, STAMP_H = 55;
/** Поля рамки по ГОСТ Р 21.101: слева 20, остальные 5. */
const FRAME = { l: 20, t: 5, r: 5, b: 5 };
/** Место под кружки осей и размерные цепочки (снизу и слева от изображения). */
const AXIS_ROOM = 20, PAD = 6;

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const n = (v: number) => (Math.round(v * 100) / 100).toString();
const fmtLen = (m: number) => m.toFixed(1).replace(".", ",");

/** Текст; size — высота шрифта, мм. */
function text(x: number, y: number, s: string, size: number, o: { anchor?: "start" | "middle" | "end"; rotate?: number; weight?: string } = {}) {
  const tr = o.rotate ? ` transform="rotate(${n(o.rotate)} ${n(x)} ${n(y)})"` : "";
  const w = o.weight ? ` font-weight="${o.weight}"` : "";
  return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" text-anchor="${o.anchor ?? "start"}"${w}${tr}>${esc(s)}</text>`;
}
const line = (a: Point, b: Point, cls: string) => `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" class="${cls}"/>`;
const rect = (x: number, y: number, w: number, h: number, cls = "thick") => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" class="${cls}"/>`;

/** Подогнать высоту шрифта, чтобы строка влезла в ширину (средняя ширина знака ≈ 0,55 высоты). */
const fit = (s: string, width: number, size: number) => Math.min(size, width / Math.max(1, s.length * 0.55));

/** Перенос по словам на строки шириной до maxChars. */
function wrap(s: string, maxChars: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + " " + w).length > maxChars) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** Условное обозначение участка по способу прокладки. */
function segmentShape(kind: SegmentKind, a: Point, b: Point, widthMm: number): string {
  if (kind === "tray") {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (-(b.y - a.y) / len) * (widthMm / 2), ny = ((b.x - a.x) / len) * (widthMm / 2);
    const pts = [[a.x + nx, a.y + ny], [b.x + nx, b.y + ny], [b.x - nx, b.y - ny], [a.x - nx, a.y - ny]];
    return `<polygon points="${pts.map(([x, y]) => `${n(x!)},${n(y!)}`).join(" ")}" class="tray"/>`;
  }
  return line(a, b, kind);
}

export function renderRouteSvg(s: RouteScheme): RenderResult {
  const warnings: string[] = [];
  const [short, long] = FORMATS[s.format];
  const W = s.orientation === "landscape" ? long : short, H = s.orientation === "landscape" ? short : long;
  const fx0 = FRAME.l, fy0 = FRAME.t, fx1 = W - FRAME.r, fy1 = H - FRAME.b;
  const stampX = fx1 - STAMP_W, stampY = fy1 - STAMP_H;

  const totals = routeTotals(s);
  const kinds = [...new Set(s.segments.map((g) => g.kind))];

  // Таблицы (ведомость + условные обозначения): слева от штампа, если там хватает места, иначе — над штампом.
  const ROW = 6;
  const tableW = 120, legendW = 70;
  const tablesH = Math.max((totals.length + 2) * ROW, (kinds.length + 1) * ROW);
  const besideStamp = stampX - fx0 >= tableW + legendW + 10;
  const tablesX = besideStamp ? fx0 + 5 : stampX;
  const tablesY = besideStamp ? fy1 - tablesH - 5 : stampY - tablesH - 5;
  // Примечания — над штампом, справа.
  const noteLines = s.notes.flatMap((t, i) => wrap(`${i + 1}. ${t}`, 120));
  const notesH = noteLines.length ? (noteLines.length + 1) * 4.5 + 3 : 0;
  const reservedBottom = besideStamp ? Math.max(STAMP_H, tablesH + 5) : STAMP_H + tablesH + 5;

  // Область изображения.
  const area = { x0: fx0 + AXIS_ROOM, y0: fy0 + 12, x1: fx1 - PAD, y1: fy1 - reservedBottom - notesH - AXIS_ROOM };

  // Охват трассы в мм здания: точки + оси.
  const pts = resolveNodes(s);
  const xs = [...[...pts.values()].map((p) => p.x), ...s.axes.x.map((a) => a.pos)];
  const ys = [...[...pts.values()].map((p) => p.y), ...s.axes.y.map((a) => a.pos)];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX, spanY = maxY - minY;
  const availW = area.x1 - area.x0 - 2 * PAD, availH = area.y1 - area.y0 - 2 * PAD;
  if (availW <= 0 || availH <= 0) warnings.push("На листе не осталось места под изображение — выберите формат крупнее");
  const need = Math.max(spanX / Math.max(availW, 1), spanY / Math.max(availH, 1));

  let scale = s.scale ?? SCALES.find((k) => k >= need) ?? SCALES[SCALES.length - 1];
  if (s.scale && s.scale < need) warnings.push(`В масштабе 1:${s.scale} трасса не помещается на лист ${s.format} — нужен 1:${Math.ceil(need)} или формат крупнее`);
  if (!s.scale && need > SCALES[SCALES.length - 1]) warnings.push(`Трасса не помещается даже в 1:${scale} — выберите формат крупнее`);

  // мм здания → мм листа (Y здания вверх, Y листа вниз); изображение по центру области.
  const ox = area.x0 + (area.x1 - area.x0 - spanX / scale) / 2;
  const oy = area.y0 + (area.y1 - area.y0 - spanY / scale) / 2;
  const P = (p: Point): Point => ({ x: ox + (p.x - minX) / scale, y: oy + (maxY - p.y) / scale });
  const top = oy - 4, bottom = oy + spanY / scale + 4, left = ox - 4, right = ox + spanX / scale + 4;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="${esc(FONT)}" font-style="italic">`,
    `<style>
  line,polygon,rect,circle,polyline,path{fill:none;stroke:#000;stroke-linecap:round;stroke-linejoin:round}
  .thin{stroke-width:.25}.thick{stroke-width:.6}
  .axis{stroke-width:.2;stroke-dasharray:8 1.5 1 1.5}
  .dim{stroke-width:.2}
  .tray{stroke-width:.35;fill:#d9d9d9}
  .pipe{stroke-width:.8}
  .corrugated{stroke-width:.6;stroke-dasharray:2.5 1.2}
  .cable{stroke-width:.3;stroke-dasharray:5 1 1 1}
  .node{fill:#000;stroke:none}
  text{fill:#000;stroke:none}
</style>`,
    `<rect x="0" y="0" width="${W}" height="${H}" style="fill:#fff;stroke:none"/>`,
    rect(fx0, fy0, fx1 - fx0, fy1 - fy0),
  );

  // Заголовок.
  out.push(text((fx0 + fx1) / 2, fy0 + 8, s.title, fit(s.title, fx1 - fx0 - 20, 5), { anchor: "middle" }));
  out.push(text((fx0 + fx1) / 2, fy0 + 12.5, `М 1:${scale}`, 3, { anchor: "middle" }));

  // Оси: штрихпунктир, кружки снизу и слева, размерные цепочки между осями.
  const R = 4;
  const sortedX = [...s.axes.x].sort((a, b) => a.pos - b.pos), sortedY = [...s.axes.y].sort((a, b) => a.pos - b.pos);
  for (const a of sortedX) {
    const x = P({ x: a.pos, y: minY }).x;
    out.push(line({ x, y: top }, { x, y: bottom + 10 }, "axis"));
    out.push(`<circle cx="${n(x)}" cy="${n(bottom + 10 + R)}" r="${R}" class="thin"/>`);
    out.push(text(x, bottom + 10 + R + 1.2, a.name, fit(a.name, 2 * R - 1.5, 3.5), { anchor: "middle" }));
  }
  for (const a of sortedY) {
    const y = P({ x: minX, y: a.pos }).y;
    out.push(line({ x: left - 10, y }, { x: right, y }, "axis"));
    out.push(`<circle cx="${n(left - 10 - R)}" cy="${n(y)}" r="${R}" class="thin"/>`);
    out.push(text(left - 10 - R, y + 1.2, a.name, fit(a.name, 2 * R - 1.5, 3.5), { anchor: "middle" }));
  }
  const tick = (p: Point) => line({ x: p.x - 1, y: p.y + 1 }, { x: p.x + 1, y: p.y - 1 }, "thin");
  for (let i = 1; i < sortedX.length; i++) {
    const x0 = P({ x: sortedX[i - 1]!.pos, y: 0 }).x, x1 = P({ x: sortedX[i]!.pos, y: 0 }).x, y = bottom + 5;
    out.push(line({ x: x0, y }, { x: x1, y }, "dim"), tick({ x: x0, y }), tick({ x: x1, y }));
    const v = String(Math.round(sortedX[i]!.pos - sortedX[i - 1]!.pos));
    out.push(text((x0 + x1) / 2, y - 0.8, v, fit(v, x1 - x0 - 1, 2.5), { anchor: "middle" }));
  }
  for (let i = 1; i < sortedY.length; i++) {
    const y0 = P({ x: 0, y: sortedY[i - 1]!.pos }).y, y1 = P({ x: 0, y: sortedY[i]!.pos }).y, x = left - 5;
    out.push(line({ x, y: y0 }, { x, y: y1 }, "dim"), tick({ x, y: y0 }), tick({ x, y: y1 }));
    const v = String(Math.round(sortedY[i]!.pos - sortedY[i - 1]!.pos));
    out.push(text(x - 0.8, (y0 + y1) / 2, v, fit(v, Math.abs(y0 - y1) - 1, 2.5), { anchor: "middle", rotate: -90 }));
  }

  // Участки трассы.
  for (const g of s.segments) {
    const a = P(pts.get(g.from)!), b = P(pts.get(g.to)!);
    const wMm = g.kind === "tray" ? Math.max((g.width ?? 100) / scale, 1.5) : 0;
    out.push(segmentShape(g.kind, a, b, wMm));
  }
  // Подписи участков — вдоль линии, «правильной» стороной вверх.
  for (const g of s.segments) {
    const a = P(pts.get(g.from)!), b = P(pts.get(g.to)!);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 8) continue;
    let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang <= -90) ang += 180;
    const rad = (ang * Math.PI) / 180;
    const off = (g.kind === "tray" ? Math.max((g.width ?? 100) / scale, 1.5) / 2 : 0) + 1.2;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // нормаль «вверх» относительно повёрнутого текста
    const ux = Math.sin(rad), uy = -Math.cos(rad);
    const label = [g.mark, `L=${fmtLen(segmentLength(s, g, pts))} м`].filter(Boolean).join(", ");
    out.push(text(mx + ux * off, my + uy * off, label, fit(label, len - 2, 2.5), { anchor: "middle", rotate: ang }));
    if (g.cables.length) {
      const c = `каб. ${g.cables.join(", ")}`;
      const size = fit(c, len - 2, 2.2);
      out.push(text(mx - ux * (off + size), my - uy * (off + size), c, size, { anchor: "middle", rotate: ang }));
    }
  }
  // Точки: узлы, отметки и подписи. Совпадающие в плане точки (стояк: низ и верх) — одна выноска.
  const groups = new Map<string, { p: Point; tags: string[] }>();
  for (const node of s.nodes) {
    const p = P(pts.get(node.id)!);
    const key = `${Math.round(p.x * 10)}:${Math.round(p.y * 10)}`;
    const g = groups.get(key) ?? { p, tags: [] };
    for (const t of [node.label, node.level != null ? formatLevel(node.level) : ""]) if (t && !g.tags.includes(t)) g.tags.push(t);
    groups.set(key, g);
  }
  for (const { p, tags } of groups.values()) {
    out.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r=".7" class="node"/>`);
    if (tags.length) {
      const lx = p.x + 3, ly = p.y - 4, tw = Math.max(...tags.map((t) => t.length)) * 2.5 * 0.55;
      out.push(`<polyline points="${n(p.x)},${n(p.y)} ${n(lx)},${n(ly)} ${n(lx + tw)},${n(ly)}" class="thin"/>`);
      tags.forEach((t, i) => out.push(text(lx + 0.5, ly - 0.8 - (tags.length - 1 - i) * 3.4, t, 2.5)));
    }
  }

  // Ведомость трасс.
  const tx = tablesX, ty = tablesY;
  const cols = [55, 40, 25];
  out.push(text(tx + tableW / 2, ty - 1.5, "Ведомость кабельных трасс", 3, { anchor: "middle" }));
  out.push(rect(tx, ty, tableW, (totals.length + 2) * ROW, "thick"));
  const head = ["Наименование", "Марка", "Длина, м"];
  let cx = tx;
  head.forEach((h, i) => { out.push(text(cx + cols[i]! / 2, ty + ROW - 1.8, h, 2.5, { anchor: "middle" })); cx += cols[i]!; });
  totals.forEach((t, r) => {
    const y = ty + (r + 2) * ROW - 1.8;
    out.push(
      text(tx + 1, y, KIND_NAMES[t.kind], fit(KIND_NAMES[t.kind], cols[0]! - 2, 2.5)),
      text(tx + cols[0]! + 1, y, t.mark || "—", fit(t.mark || "—", cols[1]! - 2, 2.5)),
      text(tx + tableW - 1.5, y, fmtLen(t.length), 2.5, { anchor: "end" }),
    );
  });
  for (let r = 1; r <= totals.length + 1; r++) out.push(line({ x: tx, y: ty + r * ROW }, { x: tx + tableW, y: ty + r * ROW }, r === 1 ? "thick" : "thin"));
  out.push(line({ x: tx + cols[0]!, y: ty }, { x: tx + cols[0]!, y: ty + (totals.length + 2) * ROW }, "thin"));
  out.push(line({ x: tx + cols[0]! + cols[1]!, y: ty }, { x: tx + cols[0]! + cols[1]!, y: ty + (totals.length + 2) * ROW }, "thin"));
  // Строка «Итого» по каждому способу не нужна при одном способе; общий итог — последней строкой.
  const total = totals.reduce((a, t) => a + t.length, 0);
  const lastY = ty + (totals.length + 2) * ROW - 1.8;
  out.push(text(tx + 1, lastY, "Итого трасс", 2.5), text(tx + tableW - 1.5, lastY, fmtLen(total), 2.5, { anchor: "end" }));

  // Условные обозначения.
  const lx = tx + tableW + 5, ly = ty;
  out.push(text(lx + legendW / 2, ly - 1.5, "Условные обозначения", 3, { anchor: "middle" }));
  kinds.forEach((k, i) => {
    const y = ly + i * ROW + ROW / 2;
    out.push(segmentShape(k, { x: lx + 1, y }, { x: lx + 16, y }, 2.5));
    out.push(text(lx + 19, y + 0.9, KIND_NAMES[k], fit(KIND_NAMES[k], legendW - 20, 2.5)));
  });
  const ay = ly + kinds.length * ROW + ROW / 2;
  out.push(`<circle cx="${n(lx + 8.5)}" cy="${n(ay)}" r="2.5" class="thin"/>`, text(lx + 8.5, ay + 0.9, "1", 2.5, { anchor: "middle" }));
  out.push(text(lx + 19, ay + 0.9, "Координационная ось", 2.5));

  // Примечания.
  if (noteLines.length) {
    const nx = stampX, ny = (besideStamp ? stampY : tablesY - 5) - notesH + 4;
    out.push(text(nx, ny, "Примечания:", 3));
    noteLines.forEach((l, i) => out.push(text(nx, ny + (i + 1) * 4.5, l, 2.5)));
  }

  out.push(stamp(s, stampX, stampY));
  out.push("</svg>");
  return { svg: out.join("\n"), scale, width: W, height: H, warnings };
}

/** Основная надпись (упрощённая форма 3 ГОСТ Р 21.101), 185×55. */
function stamp(s: RouteScheme, x: number, y: number): string {
  const st = s.stamp, o: string[] = [rect(x, y, STAMP_W, STAMP_H)];
  // Левая часть: 11 строк по 5 мм; графы изменений и подписи.
  const cw = [10, 10, 10, 10, 15, 10];
  for (let r = 1; r < 11; r++) o.push(line({ x, y: y + r * 5 }, { x: x + 65, y: y + r * 5 }, r === 5 || r === 6 ? "thick" : "thin"));
  let cx = x;
  cw.forEach((w, i) => {
    cx += w;
    // в зоне подписей «Изм.+Кол.уч.» — должность, «Лист+№док.» — фамилия: эти границы только до строки заголовков
    o.push(line({ x: cx, y }, { x: cx, y: y + (i <= 2 ? 30 : 55) }, "thick"));
  });
  ["Изм.", "Кол.уч", "Лист", "№док.", "Подп.", "Дата"].forEach((h, i) => {
    const x0 = x + cw.slice(0, i).reduce((a, b) => a + b, 0);
    o.push(text(x0 + cw[i]! / 2, y + 29, h, fit(h, cw[i]! - 1, 2.2), { anchor: "middle" }));
  });
  st.signers.slice(0, 5).forEach((p, i) => {
    const yy = y + 30 + (i + 1) * 5 - 1.4;
    o.push(text(x + 1, yy, p.role, fit(p.role, 19, 2.3)));
    o.push(text(x + 21, yy, p.name, fit(p.name, 19, 2.3)));
    o.push(text(x + 55 + 5, yy, p.date, fit(p.date, 9, 2.1), { anchor: "middle" }));
  });
  // Правая часть, 120 мм.
  const rx = x + 65;
  o.push(line({ x: rx, y }, { x: rx, y: y + 55 }, "thick"));
  o.push(line({ x: rx, y: y + 15 }, { x: x + STAMP_W, y: y + 15 }, "thick"));
  o.push(line({ x: rx, y: y + 30 }, { x: x + STAMP_W, y: y + 30 }, "thick"));
  o.push(line({ x: rx + 70, y: y + 30 }, { x: rx + 70, y: y + 55 }, "thick"));
  o.push(line({ x: rx + 70, y: y + 35 }, { x: x + STAMP_W, y: y + 35 }, "thin"));
  o.push(line({ x: rx + 70, y: y + 40 }, { x: x + STAMP_W, y: y + 40 }, "thick"));
  o.push(line({ x: rx + 85, y: y + 30 }, { x: rx + 85, y: y + 40 }, "thin"));
  o.push(line({ x: rx + 100, y: y + 30 }, { x: rx + 100, y: y + 40 }, "thin"));
  o.push(text(rx + 60, y + 9.5, st.code, fit(st.code, 116, 5), { anchor: "middle" }));
  wrap(st.object, 60).slice(0, 3).forEach((l, i, a) => o.push(text(rx + 60, y + 22.5 - (a.length - 1) * 2 + i * 4, l, fit(l, 116, 3.2), { anchor: "middle" })));
  const nm = wrap(st.sheetName || s.title, 34).slice(0, 4);
  nm.forEach((l, i) => o.push(text(rx + 35, y + 43 - (nm.length - 1) * 2 + i * 4, l, fit(l, 68, 3), { anchor: "middle" })));
  [["Стадия", rx + 77.5], ["Лист", rx + 92.5], ["Листов", rx + 110]].forEach(([h, cx2]) => o.push(text(cx2 as number, y + 33.8, h as string, 2.3, { anchor: "middle" })));
  o.push(text(rx + 77.5, y + 38.8, st.stage, 3, { anchor: "middle" }), text(rx + 92.5, y + 38.8, String(st.sheet), 3, { anchor: "middle" }), text(rx + 110, y + 38.8, String(st.sheets), 3, { anchor: "middle" }));
  wrap(st.org, 26).slice(0, 2).forEach((l, i, a) => o.push(text(rx + 95, y + 48.5 - (a.length - 1) * 2 + i * 4, l, fit(l, 48, 3.2), { anchor: "middle" })));
  return o.join("\n");
}
