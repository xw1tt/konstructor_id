// 0.36: окно программы «Конструктор ИД» (KonstruktorID.exe открывает эту страницу). Экраны — те же, что в панели,
// книга — та, что открыта в Excel: вызовы идут через панель этой книги (book/remotePort.ts).
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { WINDOW_SCREENS, type BridgeStatus } from "@idk/shared/bridge";
import { Panel } from "./panel/Panel.tsx";
import { bookSlots } from "./panel/slots.tsx";
import { PanelGuard } from "./panel/PanelGuard.tsx";
import { RemotePort, WindowEvents } from "./book/remotePort.ts";
import type { ScreenId } from "./panel/screens.ts";

declare global {
  interface Window {
    /** Заголовок окна Windows (функция программы KonstruktorID.exe; в обычном браузере её нет). */
    idkSetTitle?: (title: string) => Promise<void>;
  }
}

const events = new WindowEvents();

function screenFromUrl(search: string): ScreenId {
  const s = new URLSearchParams(search).get("screen");
  return (WINDOW_SCREENS as readonly string[]).includes(s ?? "") ? (s as ScreenId) : "home";
}

function setTitle(book: string | null) {
  const t = book ? `${book} — Конструктор ИД` : "Конструктор ИД";
  document.title = t;
  void window.idkSetTitle?.(t).catch(() => undefined);
}

function Waiting({ down }: { down: boolean }) {
  return (
    <div className="win-wait">
      <div className="win-wait-card">
        <span className="wn-logo" aria-hidden="true">
          ИД
        </span>
        <h1>Конструктор ИД</h1>
        {down ? (
          <p role="alert">Сервер программы не отвечает. Окно подключится само, как только сервер запустится (ярлык «Конструктор ИД» запускает его).</p>
        ) : (
          <>
            <p>Откройте книгу объекта в Excel и панель «Конструктор ИД» в ней (вкладка «Главная» → «Конструктор ИД»).</p>
            <p className="hint">Окно работает с книгой, открытой в Excel: данные остаются в книге, правки видны в Excel сразу.</p>
          </>
        )}
      </div>
    </div>
  );
}

function WindowApp() {
  const [status, setStatus] = useState<BridgeStatus | null>(events.last);
  const [down, setDown] = useState(false);
  const [screen] = useState(() => screenFromUrl(location.search));
  useEffect(() => {
    const s = (st: BridgeStatus) => setStatus(st);
    const d = (v: boolean) => setDown(v);
    events.status.add(s);
    events.down.add(d);
    events.start();
    return () => {
      events.status.delete(s);
      events.down.delete(d);
    };
  }, []);
  const active = status?.active ?? null;
  const book = status?.books.find((b) => b.panel === active)?.name ?? null;
  useEffect(() => setTitle(book), [book]);
  // Новая книга — новый слой книги (кэши экранов не переносятся между книгами).
  const port = useMemo(() => (active ? new RemotePort(events) : null), [active]);
  const slots = useMemo(() => (port ? bookSlots(port) : null), [port]);
  if (!status || !port || !slots) return <Waiting down={down} />;
  const choose = (panel: string) =>
    void fetch("/api/book/active", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ panel }) }).catch(() => undefined);
  return <Panel key={active!} port={port} slots={slots} shell={{ layout: "window", initialScreen: screen, link: status, onBook: choose }} />;
}

createRoot(document.getElementById("root")!).render(
  <PanelGuard>
    <WindowApp />
  </PanelGuard>,
);
