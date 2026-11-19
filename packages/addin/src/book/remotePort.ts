// 0.36: слой книги окна программы. Каждый метод — вызов через сервер к панели книги, открытой в Excel
// (см. bridgeLink.ts); события книги приходят потоком /api/book/events.
import type { BridgeMethod, BridgeStatus, WindowMessage } from "@idk/shared/bridge";
import type { TableName } from "@idk/shared/workbook/schema";
import type { CellValue } from "@idk/shared/workbook/values";
import type { Report, RowData, RowsTarget, TableData } from "@idk/shared/workbook/store";
import type { ImportantMap } from "@idk/shared/workbook/important";
import type { HostStatus } from "./host.ts";
import type { BookPort, ChangeEvent, MergeReport, Selection } from "./bookPort.ts";
import { ServerUnavailableError } from "../api.ts";

export type Caller = (method: BridgeMethod, args: unknown[]) => Promise<unknown>;

export const httpCaller: Caller = async (method, args) => {
  let res: Response;
  try {
    res = await fetch("/api/book/call", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, args }) });
  } catch {
    throw new ServerUnavailableError();
  }
  const data = (await res.json().catch(() => null)) as { value?: unknown; error?: string } | null;
  if (!res.ok) throw new Error(data?.error ?? `Ошибка сервера (${res.status})`);
  return data?.value ?? null;
};

/** Поток событий окна: состояние связи и события книги — подписчикам. */
export class WindowEvents {
  private source: EventSource | null = null;
  readonly status = new Set<(s: BridgeStatus) => void>();
  readonly change = new Set<(e: ChangeEvent) => void>();
  readonly selection = new Set<() => void>();
  /** Сервер недоступен (поток оборвался) — окно показывает это вместо экранов. */
  readonly down = new Set<(down: boolean) => void>();
  last: BridgeStatus | null = null;

  start(es: typeof EventSource = EventSource) {
    if (this.source) return;
    this.source = new es("/api/book/events");
    this.source.onmessage = (ev) => {
      let m: WindowMessage;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.down.forEach((f) => f(false));
      if (m.type === "status") {
        this.last = m.status;
        this.status.forEach((f) => f(m.status));
      } else if (m.type === "change") this.change.forEach((f) => f(m.payload as ChangeEvent));
      else this.selection.forEach((f) => f());
    };
    this.source.onerror = () => this.down.forEach((f) => f(true));
  }
  stop() {
    this.source?.close();
    this.source = null;
  }
}

export class RemotePort implements BookPort {
  lastMerge: MergeReport | null = null;

  constructor(
    private readonly events: WindowEvents,
    private readonly call: Caller = httpCaller,
  ) {}

  private c<T>(method: BridgeMethod, ...args: unknown[]): Promise<T> {
    return this.call(method, args) as Promise<T>;
  }

  host(): HostStatus {
    return "ok";
  }
  isSupported(): boolean {
    return true;
  }

  read(name: TableName) {
    return this.c<Awaited<ReturnType<BookPort["read"]>>>("read", name);
  }
  async readMany(names: readonly TableName[]) {
    const pairs = await this.c<[TableName, TableData | null][]>("readMany", names);
    return new Map(pairs);
  }
  write(name: TableName, row: number, values: Record<string, CellValue>, links: Record<string, string | null> = {}) {
    return this.c<void>("write", name, row, values, links);
  }
  insert(name: TableName, at: number, rows: Record<string, CellValue>[]) {
    return this.c<Awaited<ReturnType<BookPort["insert"]>>>("insert", name, at, rows);
  }
  remove(name: TableName, rows: number[]) {
    return this.c<void>("remove", name, rows);
  }
  isVirtual(name: TableName) {
    return this.c<boolean>("isVirtual", name);
  }
  physical(name: TableName, row: number, header: string | null) {
    return this.c<Awaited<ReturnType<BookPort["physical"]>>>("physical", name, row, header);
  }
  isFiltered(table: TableName) {
    return this.c<boolean>("isFiltered", table);
  }
  async clearFilters(table: TableName) {
    await this.c("clearFilters", table);
  }
  setting(key: string) {
    return this.c<string | null>("setting", key);
  }
  async setSetting(key: string, value: string) {
    await this.c("setSetting", key, value);
  }
  async writeReport(report: Report) {
    await this.c("writeReport", report);
  }

  sheetRows(sheet: string): RowsTarget {
    return {
      count: () => this.c<number>("rows.count", sheet),
      read: (row) => this.c<RowData>("rows.read", sheet, row),
      write: async (row, data) => void (await this.c("rows.write", sheet, row, data)),
      insertBlank: (at, n) => this.c<number>("rows.insertBlank", sheet, at, n),
      remove: async (rows) => void (await this.c("rows.remove", sheet, rows)),
    };
  }

  /** Чтение и запись активной ячейки Excel — двумя вызовами (fn выполняется в окне). */
  async writeActiveCell(fn: (current: CellValue) => CellValue | null): Promise<{ written: boolean }> {
    const cur = await this.c<CellValue>("activeCell");
    const next = fn(cur);
    if (next === null) return { written: false };
    return this.c<{ written: boolean }>("setActiveCell", next);
  }
  getSelection() {
    return this.c<Selection>("getSelection");
  }
  async selectCell(table: TableName, row: number | null, header: string) {
    await this.c("selectCell", table, row, header);
  }
  async selectSheetCell(sheet: string, row: number, col: number) {
    await this.c("selectSheetCell", sheet, row, col);
  }
  async setSheetsVisible(visible: readonly string[], hidden: readonly string[]) {
    await this.c("setSheetsVisible", visible, hidden);
  }
  async activateSheet(name: string) {
    await this.c("activateSheet", name);
  }
  async filterBy(table: TableName, header: string, value: string) {
    await this.c("filterBy", table, header, value);
  }
  tableSheetOffset(table: TableName) {
    return this.c<number>("tableSheetOffset", table);
  }
  tableStartColumn(table: TableName) {
    return this.c<number>("tableStartColumn", table).catch(() => -1);
  }

  async onSelection(cb: () => void) {
    this.events.selection.add(cb);
    return async () => void this.events.selection.delete(cb);
  }
  async onChange(cb: (e: ChangeEvent) => void) {
    this.events.change.add(cb);
    return async () => void this.events.change.delete(cb);
  }

  async ensureBook(important: ImportantMap) {
    const r = await this.c<{ created: TableName[]; merge: MergeReport | null }>("ensureBook", important);
    if (r.merge) this.lastMerge = r.merge;
    return r.created;
  }
  async writeWorkList(names: string[]) {
    await this.c("writeWorkList", names);
  }
  async applyImportant(map: ImportantMap) {
    await this.c("applyImportant", map);
  }
}
