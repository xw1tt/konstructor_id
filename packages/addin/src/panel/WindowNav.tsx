// 0.36: боковая панель окна программы (вместо верхней строки панели Excel): экраны, шаблон книги и книга,
// с которой окно работает (если в Excel открыто несколько книг с панелью — выбор).
import type { ReactNode } from "react";
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

export function WindowNav({
  screen,
  onScreen,
  template,
  templates,
  onTemplate,
  link,
  onBook,
  file,
}: {
  screen: ScreenId;
  onScreen(s: ScreenId): void;
  template: TemplateCode;
  templates: UserTemplate[];
  onTemplate(t: TemplateCode): void;
  link?: BridgeStatus | null;
  onBook?: (panel: string) => void;
  file?: { name: string; close(): void } | null;
}) {
  const item = (i: (typeof ITEMS)[number]) => (
    <button
      key={i.id}
      className={`wn-item${screen === i.id ? " wn-active" : ""}`}
      aria-current={screen === i.id ? "page" : undefined}
      onClick={() => onScreen(i.id)}
    >
      {i.icon}
      <span>{i.label}</span>
    </button>
  );
  const books = link?.books ?? [];
  const activeBook = books.find((b) => b.panel === link?.active);
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
      <label className="wn-tpl">
        <span className="wn-cap">Шаблон книги</span>
        <select value={template} onChange={(e) => onTemplate(e.target.value as TemplateCode)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
    </aside>
  );
}
