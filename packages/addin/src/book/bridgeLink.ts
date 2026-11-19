// 0.36: панель — исполнитель вызовов окна программы. Держит поток /api/book/link, выполняет вызовы в Excel
// и отправляет ответы; пока открыто окно и эта книга в нём активна — пересылает события книги.
import type { BridgeMethod, PanelMessage } from "@idk/shared/bridge";
import type { CellValue } from "@idk/shared/workbook/values";
import type { ExcelPort } from "./excelPort.ts";

declare const Excel: any;

/** Номер этой панели (новый при каждой загрузке панели). */
export const PANEL_ID = (() => {
  try {
    return crypto.randomUUID();
  } catch {
    return "p" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
})();

async function bookName(): Promise<string> {
  try {
    return await Excel.run(async (ctx: any) => {
      ctx.workbook.load("name");
      await ctx.sync();
      return String(ctx.workbook.name ?? "");
    });
  } catch {
    return "";
  }
}

type Exec = (...args: any[]) => Promise<unknown>;

export function executor(port: ExcelPort): Record<BridgeMethod, Exec> {
  const rows = (sheet: string) => port.sheetRows(sheet);
  return {
    read: (n) => port.read(n),
    // Map в JSON не переходит — парами [таблица, данные].
    readMany: async (n) => [...(await port.readMany(n)).entries()],
    write: (n, r, v, l) => port.write(n, r, v, l ?? {}),
    insert: (n, at, r) => port.insert(n, at, r),
    remove: (n, r) => port.remove(n, r),
    setting: (k) => port.setting(k),
    setSetting: (k, v) => port.setSetting(k, v),
    writeReport: (r) => port.writeReport(r),
    isFiltered: (t) => port.isFiltered(t),
    clearFilters: (t) => port.clearFilters(t),
    getSelection: () => port.getSelection(),
    selectCell: (t, r, h) => port.selectCell(t, r, h),
    selectSheetCell: (s, r, c) => port.selectSheetCell(s, r, c),
    activateSheet: (s) => port.activateSheet(s),
    filterBy: (t, h, v) => port.filterBy(t, h, v),
    tableSheetOffset: (t) => port.tableSheetOffset(t),
    tableStartColumn: (t) => port.tableStartColumn(t),
    setSheetsVisible: (v, h) => port.setSheetsVisible(v, h),
    physical: (n, r, h) => port.physical(n, r, h),
    isVirtual: (n) => port.isVirtual(n),
    ensureBook: async (imp) => {
      const created = await port.ensureBook(imp);
      const merge = port.lastMerge;
      port.lastMerge = null;
      return { created, merge };
    },
    writeWorkList: (names) => port.writeWorkList(names),
    applyImportant: (m) => port.applyImportant(m),
    activeCell: async () => {
      let cur: CellValue = null;
      await port.writeActiveCell((c) => {
        cur = c;
        return null;
      });
      return cur;
    },
    setActiveCell: (v) => port.writeActiveCell(() => v),
    "rows.count": (s) => rows(s).count(),
    "rows.read": (s, r) => rows(s).read(r),
    "rows.write": (s, r, d) => rows(s).write(r, d),
    "rows.insertBlank": (s, at, n) => rows(s).insertBlank(at, n),
    "rows.remove": (s, r) => rows(s).remove(r),
  };
}

const post = (path: string, body: unknown) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);

/** Ошибка для окна: текст, а не объект (у ошибок Office.js текст — в message). */
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)) || "Ошибка Excel";

export interface BridgeLink {
  stop(): void;
}

/** Подключает панель к серверу. Без EventSource (старый Excel) окно просто не увидит эту книгу. */
export function startBridgeLink(port: ExcelPort, es: typeof EventSource | undefined = globalThis.EventSource): BridgeLink {
  if (!es) return { stop() {} };
  const exec = executor(port);
  let source: EventSource | null = null;
  let stopped = false;
  let forwarding = false;
  let subscribed = false;

  const subscribe = async () => {
    if (subscribed) return;
    subscribed = true;
    try {
      await port.onChange((e) => forwarding && void post("/api/book/event", { panel: PANEL_ID, kind: "change", payload: e }));
      await port.onSelection(() => forwarding && void post("/api/book/event", { panel: PANEL_ID, kind: "selection" }));
    } catch {
      subscribed = false;
    }
  };

  const onMessage = async (ev: MessageEvent) => {
    let m: PanelMessage;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.type === "windows") {
      forwarding = m.count > 0 && m.active;
      if (forwarding) void subscribe();
      return;
    }
    if (m.type !== "call") return;
    const fn = exec[m.method];
    try {
      if (!fn) throw new Error(`Неизвестный вызов: ${m.method}`);
      const value = await fn(...m.args);
      await post("/api/book/result", { id: m.id, ok: true, value: value === undefined ? null : value });
    } catch (e) {
      await post("/api/book/result", { id: m.id, ok: false, error: errorText(e).slice(0, 5000) });
    }
  };

  void bookName().then((name) => {
    if (stopped) return;
    source = new es(`/api/book/link?panel=${encodeURIComponent(PANEL_ID)}&book=${encodeURIComponent(name)}`);
    source.onmessage = (ev) => void onMessage(ev);
  });
  return {
    stop() {
      stopped = true;
      source?.close();
    },
  };
}

/** Кнопка «Открыть в окне»: книга этой панели — в окне, экран — тот же, что в панели. */
export function openInWindow(screen?: string) {
  return fetch("/api/window/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ panel: PANEL_ID, ...(screen ? { screen } : {}) }),
  }).then(async (r) => {
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `Ошибка сервера (${r.status})`);
  });
}
