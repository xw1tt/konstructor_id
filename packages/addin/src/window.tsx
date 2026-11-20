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
import { setPreviewHook } from "./panel/print.ts";
import { editableLink } from "./previewLinks.ts";
import { FilePort, type BookSnapshot } from "./book/filePort.ts";

declare global {
  interface Window {
    /** Заголовок окна Windows (функция программы KonstruktorID.exe; в обычном браузере её нет). */
    idkSetTitle?: (title: string) => Promise<void>;
  }
}

const events = new WindowEvents();

function screenFromUrl(search: string): ScreenId {
  const s = new URLSearchParams(search).get("screen");
  return (WINDOW_SCREENS as readonly string[]).includes(s ?? "") ? (s as ScreenId) : "overview";
}

function setTitle(book: string | null) {
  const t = book ? `${book} — Конструктор ИД` : "Конструктор ИД";
  document.title = t;
  void window.idkSetTitle?.(t).catch(() => undefined);
}

/** 0.39: сохранённая книга без Excel — файл на сервер, обратно — таблицы книги. */
async function loadBookFile(f: File): Promise<BookSnapshot> {
  const r = await fetch("/api/book-file", { method: "POST", headers: { "x-file-name": encodeURIComponent(f.name) }, body: f });
  const j = (await r.json().catch(() => null)) as (BookSnapshot & { error?: string }) | null;
  if (!r.ok || !j) throw new Error(j?.error ?? `Ошибка сервера (${r.status})`);
  return j;
}

function OpenFile({ onOpen }: { onOpen(b: BookSnapshot): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="win-file">
      <label className={`btn${busy ? " btn-disabled" : ""}`}>
        {busy ? "Читаю книгу…" : "Открыть сохранённую книгу (.xlsx)…"}
        <input
          type="file"
          accept=".xlsx,.xlsm"
          hidden
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            setError("");
            loadBookFile(f)
              .then(onOpen)
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false));
          }}
        />
      </label>
      <p className="hint">Без Excel: обзор, акты, проверка, печать и сборка комплектов. Изменить книгу — в Excel.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Waiting({ down, onFile }: { down: boolean; onFile(b: BookSnapshot): void }) {
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
            <OpenFile onOpen={onFile} />
          </>
        )}
      </div>
    </div>
  );
}

/** 0.37: предпросмотр документа — поверх окна программы; «Отдельным окном» — как раньше. */
function Preview() {
  const [url, setUrl] = useState<string | null>(null);
  /** Своя форма: Word или Excel — по заголовку ответа (задание формы хранится готовым, повторный запрос дешёвый). */
  const [formType, setFormType] = useState<string | null>(null);
  useEffect(() => {
    setPreviewHook(setUrl);
    return () => setPreviewHook(null);
  }, []);
  useEffect(() => {
    setFormType(null);
    if (!url) return;
    const { src } = previewParts(url);
    if (!/^\/api\/form-jobs\//.test(src)) return;
    let alive = true;
    void fetch(src)
      .then((r) => {
        void r.body?.cancel();
        if (alive) setFormType(r.headers.get("x-source-type"));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [url]);
  useEffect(() => {
    if (!url) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setUrl(null);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [url]);
  if (!url) return null;
  const direct = previewParts(url);
  const edit = formType && direct.edit && /form-jobs/.test(direct.src) ? editableLink(direct.src, formType) : direct.edit;
  return (
    <div className="win-preview" role="dialog" aria-label="Предпросмотр документа">
      <div className="win-preview-bar">
        <strong>Предпросмотр</strong>
        <a className="btn" href={direct.pdf} download>
          Скачать PDF
        </a>
        {edit && (
          <a className="btn" href={edit.href} download={edit.file || true}>
            {edit.label}
          </a>
        )}
        <span className="hint">напечатать — кнопкой печати над документом</span>
        <button className="btn" onClick={() => window.open(url, "_blank", "noopener")}>
          Отдельным окном
        </button>
        <button className="btn btn-primary" onClick={() => setUrl(null)}>
          Закрыть
        </button>
      </div>
      {/* 0.46.3: документ — прямо в рамке окна (без вложенной страницы предпросмотра: в окне программы PDF во второй
          вложенной рамке не показывался). */}
      <iframe key={direct.src} title="Документ" src={direct.src} />
    </div>
  );
}

/** Адрес документа из адреса страницы предпросмотра (…/preview.html?src=/api/…) и ссылки «Скачать». */
export function previewParts(url: string): { src: string; pdf: string; edit: ReturnType<typeof editableLink> } {
  let src = url;
  try {
    const u = new URL(url, location.origin);
    if (u.pathname.endsWith("/preview.html")) src = u.searchParams.get("src") ?? url;
  } catch {
    /* адрес как есть */
  }
  const kit = /^\/api\/(kit-jobs|common-registry-jobs|form-jobs)\//.test(src);
  // Документ печати: Excel или Word («Камчатка») — какой, решает сервер по тому же адресу (имя файла — его).
  return { src, pdf: kit ? `${src}?download=1` : src, edit: editableLink(src, /^\/api\/print-jobs\//.test(src) ? "any" : null) };
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
  const [file, setFile] = useState<BookSnapshot | null>(null);
  const active = status?.active ?? null;
  const book = file ? file.name : (status?.books.find((b) => b.panel === active)?.name ?? null);
  useEffect(() => setTitle(book), [book]);
  // Новая книга — новый слой книги (кэши экранов не переносятся между книгами).
  const port = useMemo(() => (active ? new RemotePort(events) : null), [active]);
  const slots = useMemo(() => (port ? bookSlots(port) : null), [port]);
  const filePort = useMemo(() => (file ? new FilePort(file) : null), [file]);
  const fileSlots = useMemo(() => (filePort ? bookSlots(filePort) : null), [filePort]);
  if (file && filePort && fileSlots)
    return (
      <>
        <Preview />
        <Panel
          key={"file:" + file.name}
          port={filePort}
          slots={fileSlots}
          shell={{
            layout: "window",
            initialScreen: screen === "home" ? "overview" : screen,
            link: { books: [{ panel: "file", name: file.name }], active: "file" },
            file: { name: file.name, close: () => setFile(null) },
          }}
        />
      </>
    );
  if (!status || !port || !slots)
    return (
      <>
        <Waiting down={down} onFile={setFile} />
        <Preview />
      </>
    );
  const choose = (panel: string) =>
    void fetch("/api/book/active", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ panel }) }).catch(() => undefined);
  return (
    <>
      <Preview />
      <Panel key={active!} port={port} slots={slots} shell={{ layout: "window", initialScreen: screen, link: status, onBook: choose }} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <PanelGuard>
    <WindowApp />
  </PanelGuard>,
);
