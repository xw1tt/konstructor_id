// Небольшая модель Excel для тестов ExcelPort: листы-сетки, таблицы (позиция и размер), диапазоны со значениями
// и ссылками, вставка/удаление со сдвигом ячеек и таблиц. Оформление, проверка данных и правила — без действия.

type Cell = { v: unknown; link: string | null };
const BIG = 16384;

/** Любые цепочки свойств и вызовов оформления — без действия. */
function noop(): any {
  const f: any = new Proxy(function () { /* noop */ }, {
    get: (_t, k) => (k === "then" ? undefined : f),
    set: () => true,
    apply: () => f,
  });
  return f;
}

export class FakeSheet {
  cells = new Map<string, Cell>();
  visibility = "Visible";
  deleted = false;
  constructor(public wb: FakeWorkbook, public name: string) {}
  get(r: number, c: number): Cell { return this.cells.get(`${r}:${c}`) ?? { v: "", link: null }; }
  put(r: number, c: number, cell: Cell) {
    if ((cell.v === "" || cell.v === null) && !cell.link) this.cells.delete(`${r}:${c}`);
    else this.cells.set(`${r}:${c}`, cell);
  }
  tablesHere() { return this.wb.tables.filter((t) => t.sheet === this); }
  /** Сдвиг вниз ячеек столбцов c1..c2 начиная со строки r на n (n < 0 — вверх, строки r..r-n-1 удаляются). */
  shift(r: number, c1: number, c2: number, n: number) {
    const moved = new Map<string, Cell>();
    for (const [k, cell] of this.cells) {
      const [rr, cc] = k.split(":").map(Number);
      if (cc < c1 || cc > c2 || rr < r) { moved.set(k, cell); continue; }
      if (n < 0 && rr < r - n) continue;
      moved.set(`${rr + n}:${cc}`, cell);
    }
    this.cells = moved;
    for (const t of this.tablesHere()) {
      const tc2 = t.left + t.cols - 1;
      if (tc2 < c1 || t.left > c2) continue;
      if (t.left < c1 || tc2 > c2) throw new Error("Недопустимая операция: попытка переместить ячейки таблицы");
      const bodyTop = t.top + 1, bodyEnd = t.top + t.rows;
      if (r > bodyEnd) continue;
      if (r <= t.top) { t.top += n; continue; }
      // Внутри тела таблицы: таблица растёт / уменьшается.
      t.rows = Math.max(1, t.rows + n);
      void bodyTop;
    }
  }
  used(): { r1: number; c1: number; r2: number; c2: number } | null {
    let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
    for (const k of this.cells.keys()) {
      const [r, c] = k.split(":").map(Number);
      r1 = Math.min(r1, r); c1 = Math.min(c1, c); r2 = Math.max(r2, r); c2 = Math.max(c2, c);
    }
    return r2 < 0 ? null : { r1, c1, r2, c2 };
  }
}

export class FakeTable {
  name: string;
  constructor(public wb: FakeWorkbook, public sheet: FakeSheet, name: string, public top: number, public left: number, public cols: number, public rows: number) {
    this.name = name;
  }
  headers(): string[] { return Array.from({ length: this.cols }, (_, i) => String(this.sheet.get(this.top, this.left + i).v)); }
}

export class FakeWorkbook {
  sheets: FakeSheet[] = [];
  tables: FakeTable[] = [];
  names = new Map<string, string>();
  settings = new Map<string, unknown>();
  active = "";
  sheet(name: string) {
    const s = this.sheets.find((x) => x.name === name && !x.deleted);
    if (!s) throw new Error(`Нет листа ${name}`);
    return s;
  }
  addSheet(name: string) { const s = new FakeSheet(this, name); this.sheets.push(s); if (!this.active) this.active = name; return s; }
  /** Таблица с заголовками и строками на листе (для подготовки книги прежней версии). */
  addTable(sheet: string, name: string, top: number, left: number, headers: string[], rows: unknown[][]) {
    const s = this.sheets.find((x) => x.name === sheet) ?? this.addSheet(sheet);
    headers.forEach((h, i) => s.put(top, left + i, { v: h, link: null }));
    rows.forEach((r, ri) => r.forEach((v, ci) => s.put(top + 1 + ri, left + ci, { v: v ?? "", link: null })));
    const t = new FakeTable(this, s, name, top, left, headers.length, Math.max(1, rows.length));
    this.tables.push(t);
    return t;
  }
  table(name: string) { return this.tables.find((t) => t.name === name); }
  /** Значения таблицы по заголовкам. */
  rowsOf(name: string): Record<string, unknown>[] {
    const t = this.table(name)!;
    const h = t.headers();
    return Array.from({ length: t.rows }, (_, r) => Object.fromEntries(h.map((x, i) => [x, t.sheet.get(t.top + 1 + r, t.left + i).v])));
  }
}

function range(wb: FakeWorkbook, s: FakeSheet, r: number, c: number, nr: number, nc: number): any {
  const self: any = {
    get rowIndex() { return r; }, get columnIndex() { return c; }, get rowCount() { return nr; }, get columnCount() { return nc; },
    isNullObject: false,
    get address() { return `'${s.name}'!R${r + 1}C${c + 1}:R${r + nr}C${c + nc}`; },
    get values() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => s.get(r + i, c + j).v)); },
    set values(v: unknown[][]) { v.forEach((row, i) => row.forEach((x, j) => s.put(r + i, c + j, { ...s.get(r + i, c + j), v: x ?? "" }))); },
    get formulas() { return self.values; },
    set formulas(v: unknown[][]) { self.values = v; },
    get hyperlink() { const l = s.get(r, c).link; return l ? { address: l } : null; },
    set hyperlink(h: { address: string; textToDisplay?: string }) {
      const cur = s.get(r, c);
      s.put(r, c, { v: h.textToDisplay ?? cur.v, link: h.address });
    },
    set numberFormat(_v: unknown) { /* формат */ },
    format: noop(), dataValidation: noop(), conditionalFormats: noop(),
    load() { return self; },
    getCell: (i: number, j: number) => range(wb, s, r + i, c + j, 1, 1),
    getColumn: (j: number) => range(wb, s, r, c + j, nr, 1),
    getEntireRow: () => range(wb, s, r, 0, nr, BIG),
    getEntireColumn: () => range(wb, s, 0, c, BIG, nc),
    insert: (_dir: string) => { s.shift(r, c, c + nc - 1, nr); return self; },
    delete: (_dir: string) => { s.shift(r, c, c + nc - 1, -nr); },
    clear: (what = "All") => {
      for (let i = 0; i < Math.min(nr, 10000); i++) for (let j = 0; j < Math.min(nc, 500); j++) {
        const cur = s.get(r + i, c + j);
        if (what === "Hyperlinks") s.put(r + i, c + j, { ...cur, link: null });
        else if (what === "Contents") s.put(r + i, c + j, { ...cur, v: "" });
        else s.put(r + i, c + j, { v: "", link: null });
      }
    },
    copyFrom: (src: any) => {
      for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) s.put(r + i, c + j, { ...src.__sheet.get(src.rowIndex + i, src.columnIndex + j) });
    },
    select() { /* выделение */ },
    __sheet: s,
  };
  return self;
}

function tableApi(wb: FakeWorkbook, t: FakeTable): any {
  const api: any = {
    get name() { return t.name; },
    set name(v: string) { t.name = v; },
    set style(_v: string) { /* стиль */ },
    get worksheet() { return sheetApi(wb, t.sheet); },
    load() { return api; },
    isNullObject: false,
    getHeaderRowRange: () => range(wb, t.sheet, t.top, t.left, 1, t.cols),
    getDataBodyRange: () => range(wb, t.sheet, t.top + 1, t.left, t.rows, t.cols),
    getRange: () => range(wb, t.sheet, t.top, t.left, t.rows + 1, t.cols),
    rows: { get count() { return t.rows; }, load() { return this; } },
    columns: {
      add: (_i: unknown, _v: unknown, header: string) => { t.sheet.put(t.top, t.left + t.cols, { v: header, link: null }); t.cols++; },
      getItemAt: (i: number) => ({ getDataBodyRange: () => range(wb, t.sheet, t.top + 1, t.left + i, t.rows, 1), filter: noop() }),
      getItem: (h: string) => ({ filter: noop(), getDataBodyRange: () => range(wb, t.sheet, t.top + 1, t.left + t.headers().indexOf(h), t.rows, 1) }),
    },
    autoFilter: noop(),
    clearFilters() { /* фильтры */ },
    delete: () => { wb.tables = wb.tables.filter((x) => x !== t); },
  };
  return api;
}

function sheetApi(wb: FakeWorkbook, s: FakeSheet): any {
  const api: any = {
    get name() { return s.name; },
    get visibility() { return s.visibility; },
    set visibility(v: string) { s.visibility = v; },
    load() { return api; },
    isNullObject: false,
    tables: {
      get items() { return s.tablesHere().map((t) => tableApi(wb, t)); },
      get count() { return s.tablesHere().length; },
      load() { return this; },
      add: (rg: any, _h: boolean) => {
        const t = new FakeTable(wb, s, `Таблица${wb.tables.length + 1}`, rg.rowIndex, rg.columnIndex, rg.columnCount, rg.rowCount - 1);
        for (const o of s.tablesHere()) {
          const overlap = !(rg.rowIndex > o.top + o.rows || rg.rowIndex + rg.rowCount - 1 < o.top || rg.columnIndex > o.left + o.cols - 1 || rg.columnIndex + rg.columnCount - 1 < o.left);
          if (overlap) throw new Error(`Таблица накладывается на ${o.name}`);
        }
        wb.tables.push(t);
        return tableApi(wb, t);
      },
    },
    getRangeByIndexes: (r: number, c: number, nr: number, nc: number) => range(wb, s, r, c, nr, nc),
    getCell: (r: number, c: number) => range(wb, s, r, c, 1, 1),
    getUsedRangeOrNullObject: () => {
      const u = s.used();
      return u ? range(wb, s, u.r1, u.c1, u.r2 - u.r1 + 1, u.c2 - u.c1 + 1) : { isNullObject: true, load() { return this; } };
    },
    freezePanes: noop(),
    activate: () => { wb.active = s.name; },
    delete: () => { s.deleted = true; },
  };
  return api;
}

/** Ставит глобальные Excel и Office на модель книги. */
export function installFakeExcel(wb = new FakeWorkbook()): FakeWorkbook {
  const live = () => wb.sheets.filter((s) => !s.deleted);
  const workbook: any = {
    tables: {
      get items() { return wb.tables.map((t) => tableApi(wb, t)); },
      load() { return this; },
      getItem: (n: string) => { const t = wb.table(n); if (!t) throw new Error(`Нет таблицы ${n}`); return tableApi(wb, t); },
      getItemOrNullObject: (n: string) => { const t = wb.table(n); return t ? tableApi(wb, t) : { isNullObject: true, load() { return this; } }; },
    },
    worksheets: {
      get items() { return live().map((s) => sheetApi(wb, s)); },
      load() { return this; },
      getItem: (n: string) => sheetApi(wb, wb.sheet(n)),
      getItemOrNullObject: (n: string) => { const s = live().find((x) => x.name === n); return s ? sheetApi(wb, s) : { isNullObject: true, load() { return this; } }; },
      add: (n: string) => sheetApi(wb, wb.addSheet(n)),
      getActiveWorksheet: () => sheetApi(wb, wb.sheet(wb.active || live()[0].name)),
      onSelectionChanged: noop(),
    },
    names: {
      get items() { return [...wb.names.keys()].map((name) => ({ name })); },
      load() { return this; },
      add: (n: string, rg: any) => { wb.names.set(n, rg.address); },
      getItem: (n: string) => ({ set formula(v: string) { wb.names.set(n, v); } }),
    },
  };
  (globalThis as any).Excel = { run: async (fn: (ctx: any) => Promise<unknown>) => fn({ workbook, sync: async () => undefined }) };
  (globalThis as any).Office = {
    context: { document: { settings: {
      get: (k: string) => wb.settings.get(k) ?? null, set: (k: string, v: unknown) => wb.settings.set(k, v),
      saveAsync: (cb: (r: { status: string }) => void) => cb({ status: "succeeded" }),
    } } },
  };
  return wb;
}
