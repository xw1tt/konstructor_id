// Верхняя строка панели (0.32): «Книга», «Печать и сдача», «Помощник» и меню ⚙ — шаблон, редактор шаблонов, поля,
// «Норматив», «Библиотека», «Настройки». При узкой панели (< 400 px) — только значки с подсказкой (план 21).
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TemplateCode } from "@idk/shared/templates";
import type { UserTemplate } from "@idk/shared/forms/template";
import { MENU_SCREENS, type ScreenId } from "./screens.ts";
import { BookIcon, ChevronIcon, GearIcon, PrintIcon, SparkIcon, WindowIcon } from "./icons.tsx";

export function TopBar({
  screen,
  onScreen,
  template,
  templates,
  onTemplate,
  onWindow,
  compact = false,
  onCompact,
}: {
  screen: ScreenId;
  onScreen(s: ScreenId): void;
  template: TemplateCode;
  templates: UserTemplate[];
  onTemplate(t: TemplateCode): void;
  /** 0.36: «Открыть в окне» — тот же экран в отдельном окне программы. */
  onWindow?: () => void;
  /** 0.38: компактная панель — в верхней строке «Книга» и «Окно программы», остальное открывается в окне. */
  compact?: boolean;
  onCompact?: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const go = (s: ScreenId) => {
    onScreen(s);
    setOpen(false);
  };
  const tab = (id: ScreenId, label: string, icon: ReactNode, cls = "", title = label) => (
    <button
      className={`tb-btn${cls}${screen === id ? " tb-active" : ""}`}
      aria-current={screen === id ? "page" : undefined}
      title={title}
      onClick={() => go(id)}
    >
      {icon}
      <span className="tb-label">{label}</span>
    </button>
  );
  const inMenu = MENU_SCREENS.some((m) => m.id === screen);
  const current = templates.find((t) => t.id === template);

  return (
    <header className="topbar">
      <nav className="topbar-nav" aria-label="Экраны">
        {tab("home", "Книга", <BookIcon />, " tb-home", "Книга: листы, акты, карточки строк")}
        {!compact && tab("delivery", "Печать и сдача", <PrintIcon />, "", "Комплекты, реестр, ОЖР, проверка перед сдачей")}
        {!compact && tab("assistant", "Помощник", <SparkIcon />, " tb-assistant")}
        {compact && onWindow && (
          <button className="tb-btn tb-window-wide" title="Акты, печать и сдача, помощник, шаблоны — в большом окне программы" onClick={onWindow}>
            <WindowIcon />
            <span className="tb-label">Окно программы</span>
          </button>
        )}
        {!compact && onWindow && (
          <button className="tb-btn tb-window" title="Открыть в окне: тот же экран в отдельном большом окне программы" onClick={onWindow}>
            <WindowIcon />
            <span className="sr-only">Открыть в окне</span>
          </button>
        )}
        <div className="tb-drop tb-drop-end" ref={box}>
          <button
            className={`tb-btn tb-settings${inMenu ? " tb-active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={open}
            title={`Ещё: шаблон${current ? ` «${current.name}»` : ""}, норматив, библиотека, настройки`}
            onClick={() => setOpen((v) => !v)}
          >
            <GearIcon />
            <span className="tb-label">Ещё</span>
            <ChevronIcon />
          </button>
          {open && (
            <ul className="tb-menu" role="menu" aria-label="Шаблон, справочники и настройки">
              <li className="tb-menu-head" role="presentation">
                Шаблон
              </li>
              {templates.map((t) => (
                <li key={t.id} role="none">
                  <button
                    role="menuitemradio"
                    aria-checked={t.id === template}
                    onClick={() => {
                      onTemplate(t.id);
                      setOpen(false);
                    }}
                  >
                    <span className="tb-check">{t.id === template ? "✓" : ""}</span>
                    {t.name}
                  </button>
                </li>
              ))}
              <li className="tb-menu-sep" role="separator" />
              {compact && (
                <>
                  <li className="tb-menu-head" role="presentation">
                    В окне программы
                  </li>
                  {[
                    { id: "delivery" as ScreenId, label: "Печать и сдача" },
                    { id: "assistant" as ScreenId, label: "Помощник" },
                  ].map((m) => (
                    <li key={m.id} role="none">
                      <button role="menuitem" onClick={() => go(m.id)}>
                        <span className="tb-check" />
                        {m.label}
                      </button>
                    </li>
                  ))}
                </>
              )}
              {(compact ? MENU_SCREENS.filter((m) => m.id !== "settings") : MENU_SCREENS).map((m) => (
                <li key={m.id} role="none">
                  <button role="menuitem" aria-current={screen === m.id ? "page" : undefined} onClick={() => go(m.id)}>
                    <span className="tb-check">{screen === m.id ? "•" : ""}</span>
                    {m.label}
                  </button>
                </li>
              ))}
              {compact && (
                <>
                  <li className="tb-menu-sep" role="separator" />
                  <li role="none">
                    <button role="menuitem" aria-current={screen === "settings" ? "page" : undefined} onClick={() => go("settings")}>
                      <span className="tb-check">{screen === "settings" ? "•" : ""}</span>
                      Настройки
                    </button>
                  </li>
                </>
              )}
              {onCompact && (
                <>
                  <li className="tb-menu-sep" role="separator" />
                  <li role="none">
                    <button
                      role="menuitemcheckbox"
                      aria-checked={compact}
                      title="В панели — только книга и настройки; акты, печать и сдача, помощник, шаблоны — в окне программы"
                      onClick={() => {
                        onCompact(!compact);
                        setOpen(false);
                      }}
                    >
                      <span className="tb-check">{compact ? "✓" : ""}</span>
                      Компактная панель
                    </button>
                  </li>
                </>
              )}
            </ul>
          )}
        </div>
      </nav>
    </header>
  );
}
