// 0.36: боковая панель окна программы (вместо верхней строки панели Excel): экраны, шаблон книги и книга,
// с которой окно работает (если в Excel открыто несколько книг с панелью — выбор).
import { useEffect, useState, type ReactNode } from "react";
import { statusText, type ActOverview } from "@idk/shared/acts/overview";
import type { TemplateCode } from "@idk/shared/templates";
import type { UserTemplate } from "@idk/shared/forms/template";
import type { BridgeStatus } from "@idk/shared/bridge";
import type { ScreenId } from "./screens.ts";
import { ActsIcon, BookIcon, HomeIcon, FieldsIcon, GearIcon, LibraryIcon, NormIcon, PrintIcon, SparkIcon, TemplateIcon } from "./icons.tsx";

const ITEMS: { id: ScreenId; label: string; icon: ReactNode; group: "work" | "setup" }[] = [
  { id: "overview", label: "Объект", icon: <HomeIcon />, group: "work" },
  { id: "home", label: "Книга", icon: <BookIcon />, group: "work" },
  { id: "acts", label: "Акты", icon: <ActsIcon />, group: "work" },
  { id: "delivery", label: "Печать и сдача", icon: <PrintIcon />, group: "work" },
  { id: "assistant", label: "Помощник", icon: <SparkIcon />, group: "work" },
  { id: "templates", label: "Шаблоны", icon: <TemplateIcon />, group: "setup" },
  { id: "fields", label: "Поля для шаблона", icon: <FieldsIcon />, group: "setup" },
  { id: "normativ", label: "Норматив", icon: <NormIcon />, group: "setup" },
  { id: "library", label: "Библиотека", icon: <LibraryIcon />, group: "setup" },
  { id: "settings", label: "Настройки", icon: <GearIcon />, group: "setup" },
];

export interface NavSummary {
  acts: ActOverview[];
  kits: number;
}

/** 0.40: мозаика готовности — квадрат на акт по порядку (цвет — статус). */
export function ReadinessMosaic({ acts, onAct }: { acts: ActOverview[]; onAct?: (a: ActOverview) => void }) {
  return (
    <div className="mosaic" role="list">
      {acts.map((a) => (
        <span
          key={a.number}
          role="listitem"
          className={`mosaic-cell mosaic-${a.status}`}
          title={`№ ${a.number} · ${statusText(a)}`}
          onClick={onAct ? () => onAct(a) : undefined}
        />
      ))}
    </div>
  );
}

export function WindowNav({
  screen,
  onScreen,
  link,
  onBook,
  file,
  summary,
}: {
  screen: ScreenId;
  onScreen(s: ScreenId): void;
  link?: BridgeStatus | null;
  onBook?: (panel: string) => void;
  file?: { name: string; close(): void } | null;
  summary?: NavSummary | null;
}) {
  const count = (id: ScreenId) => (id === "acts" ? summary?.acts.length : id === "delivery" ? summary?.kits : undefined);
  const item = (i: (typeof ITEMS)[number]) => {
    const n = count(i.id);
    return (
      <button
        key={i.id}
        className={`wn-item${screen === i.id ? " wn-active" : ""}`}
        aria-current={screen === i.id ? "page" : undefined}
        onClick={() => onScreen(i.id)}
      >
        {i.icon}
        <span>{i.label}</span>
        {n !== undefined && n > 0 && (
          <>
            <span className="wn-lead" aria-hidden="true" />
            <span className="wn-count">{n}</span>
          </>
        )}
      </button>
    );
  };
  const books = link?.books ?? [];
  const activeBook = books.find((b) => b.panel === link?.active);
  const ready = summary?.acts.filter((a) => a.status === "ready").length ?? 0;
  return (
    <aside className="wn" aria-label="Разделы программы">
      <div className="wn-brand">
        <span className="wn-logo" aria-hidden="true">
          ИД
        </span>
        <span className="wn-name">Конструктор ИД</span>
      </div>
      <div className="wn-book">
        <span className="wn-cap">Книга объекта</span>
        {books.length > 1 && onBook ? (
          <select aria-label="Книга объекта" value={link?.active ?? ""} onChange={(e) => onBook(e.target.value)}>
            {books.map((b) => (
              <option key={b.panel} value={b.panel}>
                {b.name}
              </option>
            ))}
          </select>
        ) : (
          <strong title={activeBook?.name}>{activeBook?.name ?? "—"}</strong>
        )}
        {file ? (
          <>
            <span className="wn-file">только просмотр и печать (файл, без Excel)</span>
            <button className="btn btn-link wn-close" onClick={file.close}>
              Закрыть файл
            </button>
          </>
        ) : (
          <span className="wn-linked">
            <span className="wn-dot" aria-hidden="true" /> связь с Excel
          </span>
        )}
      </div>
      <nav className="wn-nav" aria-label="Экраны">
        {ITEMS.filter((i) => i.group === "work" && !(file && i.id === "home")).map(item)}
        <span className="wn-cap wn-sep">Настройка</span>
        {ITEMS.filter((i) => i.group === "setup").map(item)}
      </nav>
      {summary && summary.acts.length > 0 && (
        <button className="wn-ready" onClick={() => onScreen("acts")} title="Готовность актов к печати — открыть «Акты»">
          <span className="wn-ready-head">
            <span className="wn-cap">Готовность</span>
            <span className="mono">
              {ready} / {summary.acts.length}
            </span>
          </span>
          <ReadinessMosaic acts={summary.acts} />
        </button>
      )}
    </aside>
  );
}

/** 0.40: нижняя строка окна — книга, объект, шифр, шаблон книги, сервер, версия. */
export function WindowStatus({
  book,
  object,
  code,
  template,
  templates,
  onTemplate,
  serverDown,
}: {
  book: string;
  object: string;
  code: string;
  template: TemplateCode;
  templates: UserTemplate[];
  onTemplate(t: TemplateCode): void;
  serverDown: boolean;
}) {
  const [version, setVersion] = useState("");
  useEffect(() => {
    fetch("/api/version")
      .then((r) => r.json())
      .then((j: { version?: string }) => setVersion(j.version ?? ""))
      .catch(() => undefined);
  }, []);
  return (
    <footer className="ws" aria-label="Состояние">
      <div className="ws-cell ws-book">
        <span className="wn-cap">Книга</span>
        <span>
          <span className="wn-dot" aria-hidden="true" /> {book || "—"}
        </span>
      </div>
      <div className="ws-cell ws-grow">
        <span className="wn-cap">Объект</span>
        <span title={object}>{object || "—"}</span>
      </div>
      <div className="ws-cell">
        <span className="wn-cap">Шифр</span>
        <span className="mono">{code || "—"}</span>
      </div>
      <label className="ws-cell">
        <span className="wn-cap">Шаблон книги</span>
        <select value={template} onChange={(e) => onTemplate(e.target.value as TemplateCode)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="ws-cell">
        <span className="wn-cap">Сервер</span>
        <span>
          <span className={serverDown ? "wn-dot wn-dot-off" : "wn-dot"} aria-hidden="true" /> {serverDown ? "не отвечает" : "работает"}
        </span>
      </div>
      <div className="ws-cell">
        <span className="wn-cap">Версия</span>
        <span className="mono">{version || "—"}</span>
      </div>
    </footer>
  );
}
