// Схема трассы из книги (лист «Схемы трасс»): строки схемы, осей, точек и участков → RouteScheme.
// Ошибки — по ячейкам книги (таблица, строка, столбец), как у проверки актов: панель ведёт к ячейке.
import { ROUTE_KIND_LABELS, ROLE_BOOK_LABELS, column, type TableName } from "../workbook/schema.ts";
import { cellText, parseDateCell, parseNumberCell, type CellValue } from "../workbook/values.ts";
import type { Book, BookRow } from "../workbook/records.ts";
import type { Issue } from "../workbook/bundle.ts";
import { monthYear } from "../acts/cableDocs.ts";
import { withNo } from "../acts/format.ts";
import { SEGMENT_KINDS, parseRoute, type RouteInput, type RouteScheme } from "./route.ts";

export interface RouteBuild {
  /** null — есть ошибки, схему не нарисовать. */
  scheme: RouteScheme | null;
  issues: Issue[];
}

const H = (t: TableName, key: string) => column(t, key).header;
const txt = (v: CellValue | undefined) => cellText(v ?? null);
const rowsOf = (book: Book, t: TableName, scheme: string) =>
  (book.tables[t] ?? []).filter((r) => txt(r.v.scheme) === scheme);

/** Цифровая ось (1, 2, 10а) — по X; буквенная (А, Б, Аа) — по Y. */
export const isXAxis = (name: string) => /^\d/.test(name.trim());

/** Номера схем на листе «Схемы трасс» по порядку строк. */
export function routeNumbers(book: Book): string[] {
  return [...new Set((book.tables["Трассы"] ?? []).map((r) => txt(r.v.number)).filter(Boolean))];
}

/** Номер схемы строки любой таблицы листа «Схемы трасс». */
export function routeOfRow(table: TableName, v: Record<string, CellValue>): string {
  return table === "Трассы" ? txt(v.number) : txt(v.scheme);
}

/** Представитель по подписи роли в книге: первый по «Порядку». */
function repByRole(book: Book, label: string): string {
  const reps = (book.tables["Представители"] ?? []).filter((r) => txt(r.v.role) === label);
  reps.sort((a, b) => (Number(a.v.sortOrder) || 1) - (Number(b.v.sortOrder) || 1));
  return reps.length ? txt(reps[0]!.v.fullName) : "";
}

export function routeFromBook(book: Book, number: string): RouteBuild {
  const issues: Issue[] = [];
  const push = (table: TableName, r: BookRow | null, key: string, message: string) =>
    issues.push({ table, row: r?.row ?? null, column: H(table, key), message });

  const head = (book.tables["Трассы"] ?? []).find((r) => txt(r.v.number) === number);
  if (!head) {
    push("Трассы", null, "number", `Схема «${number}» не найдена в таблице «Схемы» листа «Схемы трасс»`);
    return { scheme: null, issues };
  }
  const num = (t: TableName, r: BookRow, key: string): number | null => {
    const p = parseNumberCell(r.v[key] ?? null);
    if (!p.ok) { push(t, r, key, p.message); return null; }
    return p.value;
  };

  // Оси.
  const axes = { x: [] as { name: string; pos: number }[], y: [] as { name: string; pos: number }[] };
  for (const r of rowsOf(book, "ТрассыОси", number)) {
    const name = txt(r.v.name);
    if (!name) { push("ТрассыОси", r, "name", "Укажите имя оси"); continue; }
    const pos = num("ТрассыОси", r, "pos");
    if (pos === null) { if (txt(r.v.pos) === "") push("ТрассыОси", r, "pos", `Укажите координату оси «${name}», мм`); continue; }
    const list = isXAxis(name) ? axes.x : axes.y;
    if (list.some((a) => a.name === name)) { push("ТрассыОси", r, "name", `Ось «${name}» указана дважды`); continue; }
    list.push({ name, pos });
  }

  // Точки.
  const nodes: NonNullable<RouteInput["nodes"]> = [];
  const pointIds = new Set<string>();
  for (const r of rowsOf(book, "ТрассыТочки", number)) {
    const id = txt(r.v.point);
    if (!id) { push("ТрассыТочки", r, "point", "Укажите имя точки"); continue; }
    if (pointIds.has(id)) { push("ТрассыТочки", r, "point", `Точка «${id}» указана дважды`); continue; }
    pointIds.add(id);
    const coord = (dir: "x" | "y") => {
      const axisKey = dir === "x" ? "axisX" : "axisY", offKey = dir === "x" ? "dx" : "dy";
      const axis = txt(r.v[axisKey]);
      const off = num("ТрассыТочки", r, offKey);
      if (!axis) {
        if (off === null) { push("ТрассыТочки", r, axisKey, `Точка «${id}»: укажите ось ${dir.toUpperCase()} или смещение от нуля`); return null; }
        return off;
      }
      if (!axes[dir].some((a) => a.name === axis)) {
        const other = axes[dir === "x" ? "y" : "x"].some((a) => a.name === axis);
        push("ТрассыТочки", r, axisKey, other
          ? `Ось «${axis}» — ${dir === "x" ? "буквенная, её место в «Ось Y»" : "цифровая, её место в «Ось X»"}`
          : `Нет оси «${axis}» в таблице «Оси» схемы «${number}»`);
        return null;
      }
      return { axis, offset: off ?? 0 };
    };
    const x = coord("x"), y = coord("y");
    const level = num("ТрассыТочки", r, "level");
    if (x === null || y === null) continue;
    nodes.push({ id, x, y, level, label: txt(r.v.label) });
  }

  // Участки.
  const segments: NonNullable<RouteInput["segments"]> = [];
  for (const r of rowsOf(book, "ТрассыУчастки", number)) {
    const from = txt(r.v.from), to = txt(r.v.to);
    let ok = true;
    for (const [key, id] of [["from", from], ["to", to]] as const) {
      if (!id) { push("ТрассыУчастки", r, key, "Укажите точку"); ok = false; }
      else if (!pointIds.has(id)) { push("ТрассыУчастки", r, key, `Нет точки «${id}» в схеме «${number}»`); ok = false; }
    }
    if (ok && from === to) { push("ТрассыУчастки", r, "to", "Начало и конец участка совпадают"); ok = false; }
    const ki = (ROUTE_KIND_LABELS as string[]).indexOf(txt(r.v.kind));
    if (ki < 0) { push("ТрассыУчастки", r, "kind", txt(r.v.kind) ? `Способ «${txt(r.v.kind)}» — выберите из списка` : "Выберите способ прокладки"); ok = false; }
    const width = num("ТрассыУчастки", r, "width");
    if (width !== null && width <= 0) { push("ТрассыУчастки", r, "width", "Ширина должна быть больше нуля"); ok = false; }
    if (!ok) continue;
    const cables = txt(r.v.cables).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    segments.push({ from, to, kind: SEGMENT_KINDS[ki]!, mark: txt(r.v.mark), width, cables });
  }

  if (pointIds.size < 2) push("Трассы", head, "number", `В схеме «${number}» меньше двух точек — заполните таблицу «Точки трассы»`);
  if (!segments.length && !issues.some((i) => i.table === "ТрассыУчастки")) push("Трассы", head, "number", `В схеме «${number}» нет участков — заполните таблицу «Участки трассы»`);

  // Лист и штамп.
  const scale = num("Трассы", head, "scale");
  if (scale !== null && (scale <= 0 || !Number.isInteger(scale))) push("Трассы", head, "scale", "Масштаб — целое число, например 100");
  const date = parseDateCell(head.v.date ?? null);
  if (!date.ok) push("Трассы", head, "date", date.message);
  if (issues.length) return { scheme: null, issues };

  const actNo = txt(head.v.act);
  const act = actNo ? (book.tables["Акты"] ?? []).find((r) => txt(r.v.baseNumber) === actNo) : undefined;
  if (actNo && !act) push("Трассы", head, "act", `Акт «${actNo}» не найден на листе «База актов»`);
  const signers = [
    { role: "Составил", name: repByRole(book, ROLE_BOOK_LABELS.performer) },
    { role: "Проверил", name: repByRole(book, ROLE_BOOK_LABELS.builder_control) },
  ].filter((s) => s.name).map((s) => ({ ...s, date: monthYear(date.ok ? date.value : null) }));
  const name = txt(head.v.name);
  const notes = txt(head.v.notes).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const input: RouteInput = {
    title: name ? `Исполнительная схема ${withNo(number)}. ${name}` : `Исполнительная схема ${withNo(number)}`,
    format: (txt(head.v.format) || "A3") as RouteInput["format"],
    orientation: txt(head.v.orientation) === "книжная" ? "portrait" : "landscape",
    scale: scale ?? null,
    axes, nodes, segments, notes,
    stamp: {
      code: txt(head.v.code) || txt(act?.v.section),
      object: txt(book.object.name),
      sheetName: name || `Исполнительная схема ${withNo(number)}`,
      org: txt(act?.v.performerOrg) || txt(book.object.performer),
      signers,
    },
  };
  const parsed = parseRoute(input);
  if (!parsed.ok) {
    for (const e of parsed.errors) push("Трассы", head, "number", e);
    return { scheme: null, issues };
  }
  return { scheme: parsed.scheme, issues };
}

/** Строка таблицы «Схемы» (лист «Исполнительные схемы») для схемы трассы: акт, вид, номер, наименование, дата. */
export function registerRecord(book: Book, number: string): Record<string, CellValue> | null {
  const head = (book.tables["Трассы"] ?? []).find((r) => txt(r.v.number) === number);
  if (!head) return null;
  return {
    [H("Схемы", "act")]: txt(head.v.act),
    [H("Схемы", "kind")]: "Схема",
    [H("Схемы", "number")]: number,
    [H("Схемы", "name")]: txt(head.v.name) || `Исполнительная схема ${withNo(number)}`,
    [H("Схемы", "date")]: head.v.date ?? null,
  };
}

/** Строка «Схем» с этим номером (и актом схемы, если указан) — чтобы не плодить дубли при повторном сохранении. */
export function registerRowIndex(book: Book, number: string): number | null {
  const head = (book.tables["Трассы"] ?? []).find((r) => txt(r.v.number) === number);
  const act = txt(head?.v.act);
  const r = (book.tables["Схемы"] ?? []).find((x) => withNo(txt(x.v.number)) === withNo(number) && (!act || txt(x.v.act) === act));
  return r ? r.row : null;
}
