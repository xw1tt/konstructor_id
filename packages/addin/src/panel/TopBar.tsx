// Верхняя строка панели: ⌂ (конструктор), «Норматив», «Помощник», «Шаблоны ▾», значки помощника.
import { useEffect, useRef, useState } from "react";
import { TEMPLATES, type TemplateCode } from "@idk/shared/templates";
import { ASSISTANT_ICONS, type ScreenId } from "./screens.ts";
import { AssistantIcon, ChevronIcon, GridIcon, HomeIcon } from "./icons.tsx";

export function TopBar({ screen, onScreen, template, onTemplate }: {
  screen: ScreenId; onScreen(s: ScreenId): void; template: TemplateCode; onTemplate(t: TemplateCode): void;
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
          onClick={() => onScreen("normativ")}>Норматив</button>
        <button className={`tb-btn tb-assistant${screen === "assistant" ? " tb-active" : ""}`} aria-current={screen === "assistant" ? "page" : undefined}
          onClick={() => onScreen("assistant")}><span>Помощник</span></button>
        <div className="tb-drop" ref={box}>
          <button className="tb-btn tb-templates" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <GridIcon /> Шаблоны <ChevronIcon />
          </button>
          {open && (
            <ul className="tb-menu" role="listbox" aria-label="Шаблон документов">
              {TEMPLATES.map((t) => (
                <li key={t.code} role="option" aria-selected={t.code === template}>
                  <button onClick={() => { onTemplate(t.code); setOpen(false); }}>
                    <span className="tb-check">{t.code === template ? "✓" : ""}</span>{t.label}
                  </button>
                </li>
              ))}
              <li role="option" aria-disabled="true" aria-selected={false}><button disabled><span className="tb-check" />Другие заказчики — позже</button></li>
            </ul>
          )}
        </div>
      </nav>
      <div className="topbar-icons" aria-label="Помощник">
        {ASSISTANT_ICONS.map((i) => (
          <button key={i.id} className="tb-icon" disabled aria-label={i.label} title={`${i.label} — скоро`}><AssistantIcon id={i.id} /></button>
        ))}
      </div>
    </header>
  );
}
