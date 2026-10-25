// Верхняя строка панели: ⌂ (конструктор), «Норматив», «Библиотека», «Помощник», «Шаблоны ▾», «Настройки» — значок и
// подпись; при узкой панели (< 400 px) — только значки с подсказкой (план 21).
import { useEffect, useRef, useState } from "react";
import type { TemplateCode } from "@idk/shared/templates";
import type { UserTemplate } from "@idk/shared/forms/template";
import type { ScreenId } from "./screens.ts";
import { ChevronIcon, GearIcon, GridIcon, HomeIcon, LibraryIcon, NormIcon, SparkIcon } from "./icons.tsx";

export function TopBar({ screen, onScreen, template, templates, onTemplate }: {
  screen: ScreenId; onScreen(s: ScreenId): void; template: TemplateCode; templates: UserTemplate[]; onTemplate(t: TemplateCode): void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <header className="topbar">
      <nav className="topbar-nav" aria-label="Экраны">
        <button className={`tb-btn tb-home${screen === "home" ? " tb-active" : ""}`} aria-label="Конструктор ИД"
          aria-current={screen === "home" ? "page" : undefined} title="Конструктор ИД" onClick={() => onScreen("home")}><HomeIcon /></button>
        <button className={`tb-btn${screen === "normativ" ? " tb-active" : ""}`} aria-current={screen === "normativ" ? "page" : undefined}
          title="Норматив" onClick={() => onScreen("normativ")}><NormIcon /><span className="tb-label">Норматив</span></button>
        <button className={`tb-btn${screen === "library" ? " tb-active" : ""}`} aria-current={screen === "library" ? "page" : undefined}
          title="Библиотека компании" onClick={() => onScreen("library")}><LibraryIcon /><span className="tb-label">Библиотека</span></button>
        <button className={`tb-btn tb-assistant${screen === "assistant" ? " tb-active" : ""}`} aria-current={screen === "assistant" ? "page" : undefined}
          title="Помощник" onClick={() => onScreen("assistant")}><SparkIcon /><span className="tb-label">Помощник</span></button>
        <div className="tb-drop" ref={box}>
          <button className="tb-btn tb-templates" aria-haspopup="listbox" aria-expanded={open} title="Шаблоны" onClick={() => setOpen((v) => !v)}>
            <GridIcon /><span className="tb-label">Шаблоны</span><ChevronIcon />
          </button>
          {open && (
            <ul className="tb-menu" role="menu" aria-label="Шаблон и настройки печати">
              {templates.map((t) => (
                <li key={t.id} role="none">
                  <button role="menuitemradio" aria-checked={t.id === template} onClick={() => { onTemplate(t.id); setOpen(false); }}>
                    <span className="tb-check">{t.id === template ? "✓" : ""}</span>{t.name}
                  </button>
                </li>
              ))}
              <li role="none"><button role="menuitem" onClick={() => { onScreen("templates"); setOpen(false); }}><span className="tb-check" />Редактор шаблонов…</button></li>
              <li role="none"><button role="menuitem" onClick={() => { onScreen("fields"); setOpen(false); }}><span className="tb-check" />Поля для шаблона…</button></li>
            </ul>
          )}
        </div>
        <button className={`tb-btn tb-settings${screen === "settings" ? " tb-active" : ""}`} aria-current={screen === "settings" ? "page" : undefined}
          title="Настройки" onClick={() => onScreen("settings")}><GearIcon /><span className="tb-label">Настройки</span></button>
      </nav>
    </header>
  );
}
