// 0.36: связь окна «Конструктор ИД» с книгой в Excel. Панель каждой открытой книги держит поток /api/book/link
// и выполняет приходящие вызовы; окно шлёт вызовы в /api/book/call и слушает /api/book/events (состояние связи
// и события книги). Данные книги на сервере не хранятся — только пересылаются.
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { BridgeCall, BridgeEvent, BridgeResult, WindowOpen, type BridgeStatus, type PanelMessage, type WindowMessage } from "@idk/shared/bridge";
import { HttpError, type Router } from "../http/router.ts";

export const BRIDGE_JSON_LIMIT = 64 * 1024 * 1024;
const KEEPALIVE_MS = 20_000;

export interface BridgeDeps {
  /** Сколько ждать ответа панели (по умолчанию 60 с: чтение большой книги и разметка бывают долгими). */
  timeoutMs?: number;
  /** Запуск окна (на Windows — KonstruktorID.exe из папки установки); null — окно недоступно. */
  openWindow?: ((screen: string | undefined) => Promise<void>) | null;
}

interface PanelLink {
  id: string;
  name: string;
  res: ServerResponse;
  at: number;
}

const sse = (res: ServerResponse) => {
  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "x-accel-buffering": "no" });
  res.flushHeaders?.();
};
const send = (res: ServerResponse, o: unknown) => {
  if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(o)}\n\n`);
};

export class Bridge {
  readonly panels = new Map<string, PanelLink>();
  readonly windows = new Set<ServerResponse>();
  private chosen: string | null = null;
  private readonly waiting = new Map<string, { resolve: (r: BridgeResult) => void; panel: string; timer: ReturnType<typeof setTimeout> }>();

  constructor(private readonly timeoutMs = 60_000) {}

  /** Книга, с которой работает окно: выбранная (кнопкой «Открыть в окне» или в окне), иначе последняя подключённая. */
  active(): PanelLink | null {
    if (this.chosen && this.panels.has(this.chosen)) return this.panels.get(this.chosen)!;
    let last: PanelLink | null = null;
    for (const p of this.panels.values()) if (!last || p.at >= last.at) last = p;
    return last;
  }
  status(): BridgeStatus {
    return { books: [...this.panels.values()].map((p) => ({ panel: p.id, name: p.name })), active: this.active()?.id ?? null };
  }
  choose(panel: string) {
    if (!this.panels.has(panel)) throw new HttpError(404, "Эта книга уже закрыта в Excel");
    this.chosen = panel;
    this.notify();
  }

  /** Окнам — состояние связи, панелям — сколько окон открыто и активна ли книга (иначе события не пересылаются). */
  notify() {
    const status = this.status();
    for (const w of this.windows) send(w, { type: "status", status } satisfies WindowMessage);
    for (const p of this.panels.values()) send(p.res, { type: "windows", count: this.windows.size, active: status.active === p.id } satisfies PanelMessage);
  }

  addPanel(id: string, name: string, res: ServerResponse) {
    const old = this.panels.get(id);
    if (old && old.res !== res) old.res.end();
    this.panels.set(id, { id, name, res, at: Date.now() });
    this.notify();
  }
  dropPanel(id: string, res: ServerResponse) {
    if (this.panels.get(id)?.res !== res) return;
    this.panels.delete(id);
    for (const [cid, w] of this.waiting)
      if (w.panel === id) w.resolve({ id: cid, ok: false, error: "Книга закрыта в Excel или панель перезагружена — повторите действие" });
    this.notify();
  }

  call(method: BridgeCall["method"], args: unknown[]): Promise<BridgeResult> {
    const p = this.active();
    if (!p) throw new HttpError(409, "Книга не открыта: откройте книгу объекта в Excel и панель «Конструктор ИД» в ней");
    const id = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(
        () =>
          done({ id, ok: false, error: "Excel не ответил за отведённое время. Проверьте, не открыт ли в Excel диалог или режим правки ячейки, и повторите" }),
        this.timeoutMs,
      );
      const done = (r: BridgeResult) => {
        clearTimeout(timer);
        this.waiting.delete(id);
        resolve(r);
      };
      this.waiting.set(id, { resolve: done, panel: p.id, timer });
      send(p.res, { type: "call", id, method, args } satisfies PanelMessage);
    });
  }
  result(r: BridgeResult) {
    this.waiting.get(r.id)?.resolve(r);
  }
  event(e: BridgeEvent) {
    if (this.active()?.id !== e.panel) return;
    for (const w of this.windows) send(w, { type: e.kind, payload: e.payload } satisfies WindowMessage);
  }
}

export function bridgeRoutes(r: Router, deps: BridgeDeps = {}): Bridge {
  const b = new Bridge(deps.timeoutMs);

  // Панель книги: поток вызовов. Имя книги — для выбора в окне, если открыто несколько.
  r.get("/api/book/link", async (c) => {
    const id = c.query.get("panel") ?? "";
    if (!/^[\w-]{1,100}$/.test(id)) throw new HttpError(400, "Нет номера панели");
    const name = (c.query.get("book") ?? "").slice(0, 200) || "Книга";
    const res = c.res;
    sse(res);
    b.addPanel(id, name, res);
    const keep = setInterval(() => res.write(": keep\n\n"), KEEPALIVE_MS);
    res.on("close", () => {
      clearInterval(keep);
      b.dropPanel(id, res);
    });
  });
  r.post("/api/book/result", async (c) => {
    b.result(await c.body(BridgeResult, BRIDGE_JSON_LIMIT));
  });
  r.post("/api/book/event", async (c) => {
    b.event(await c.body(BridgeEvent, 1024 * 1024));
  });

  // Окно: состояние связи и события книги.
  r.get("/api/book/events", async (c) => {
    const res = c.res;
    sse(res);
    b.windows.add(res);
    b.notify();
    const keep = setInterval(() => res.write(": keep\n\n"), KEEPALIVE_MS);
    res.on("close", () => {
      clearInterval(keep);
      b.windows.delete(res);
      b.notify();
    });
  });
  r.get("/api/book/status", async () => b.status());
  r.post("/api/book/active", async (c) => {
    const { panel } = await c.body(WindowOpen);
    if (!panel) throw new HttpError(400, "Не указана книга");
    b.choose(panel);
    return b.status();
  });
  r.post("/api/book/call", async (c) => {
    const q = await c.body(BridgeCall, BRIDGE_JSON_LIMIT);
    const out = await b.call(q.method, q.args);
    if (!out.ok) throw new HttpError(502, out.error ?? "Ошибка Excel");
    return { value: out.value ?? null };
  });

  // Кнопка «Открыть в окне» в панели: книга этой панели становится активной, окно запускается (или выходит вперёд).
  r.post("/api/window/open", async (c) => {
    const q = await c.body(WindowOpen);
    if (q.panel && b.panels.has(q.panel)) b.choose(q.panel);
    if (!deps.openWindow) throw new HttpError(501, "Окно программы есть только в установленной версии для Windows");
    await deps.openWindow(q.screen);
  });
  return b;
}
