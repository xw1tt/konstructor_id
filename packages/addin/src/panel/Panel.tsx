// Панель «Конструктор ИД»: разделы (листы книги), «Функционал листа», «Функционал таблицы», карточка строки.
import { useEffect, useState, type ReactNode } from "react";
import { loadTemplate, saveTemplate, DEFAULT_TEMPLATE, PrintOptions, type TemplateCode } from "@idk/shared/templates";
import { TABLE_NAMES, type TableName } from "@idk/shared/workbook/schema";
import type { ExcelPort } from "../book/excelPort.ts";
import { ServerDownContext } from "../server.tsx";
import { SECTIONS, sectionForSheet } from "./sections.ts";
import { useBook, type BookState } from "./useBook.ts";
import { SheetTools } from "./SheetTools.tsx";
import { TableTools } from "./TableTools.tsx";
import { TopBar } from "./TopBar.tsx";
import { NormativScreen } from "./NormativScreen.tsx";
import { AssistantScreen } from "./AssistantScreen.tsx";
import { SettingsScreen } from "./SettingsScreen.tsx";
import { TemplateContext, PrintOptionsContext, UserTemplateContext, type TemplatesState } from "./templateContext.ts";
import { TemplateEditor } from "./TemplateEditor.tsx";
import { FieldsScreen } from "./FieldsScreen.tsx";
import { listTemplates, resolveTemplate } from "./templatesApi.ts";
import { BUILTIN_SBD, type UserTemplate } from "@idk/shared/forms/template";
import type { ScreenId } from "./screens.ts";

/** Создание книги идёт в несколько шагов; пока оно идёт, панель не переключается на разделы,
 *  хотя таблицы уже появились (иначе экран с предложением переноса пропал бы). */
export interface CreateFlow { start(): void; finish(): void }

export interface PanelSlots {
  /** Экран создания книги (нет ни одной таблицы программы) и восстановления разметки. */
  create?: (state: BookState, missing: TableName[], flow: CreateFlow) => ReactNode;
  /** Карточка текущей строки. */
  card?: (state: BookState) => ReactNode;
  onRowsAdded?: (state: BookState, table: TableName, first: number, n: number) => Promise<void>;
}

export function Panel({ port, slots = {} }: { port: ExcelPort; slots?: PanelSlots }) {
  const host = port.host();
  if (host !== "ok") {
    return (
      <div className="app">
        <Header />
        <p className="banner" role="alert">
          {host === "old"
            ? "Нужен Excel 2019, 2021 или Microsoft 365. В этой версии Excel панель работать не может."
            : "Панель открыта вне Excel или не загрузилась библиотека Office.js (нужно подключение к интернету). Откройте панель в Excel."}
        </p>
      </div>
    );
  }
  return <Supported port={port} slots={slots} />;
}

function Header() {
  return (
    <header className="app-head">
      <h1 className="app-title">Конструктор ИД</h1>
    </header>
  );
}

function Supported({ port, slots }: { port: ExcelPort; slots: PanelSlots }) {
  const state = useBook(port);
  const [serverDown, setServerDown] = useState(false);
  const [creating, setCreating] = useState(false);
  const [screen, setScreen] = useState<ScreenId>("home");
  const [template, setTemplate] = useState<TemplateCode>(DEFAULT_TEMPLATE);
  useEffect(() => { void loadTemplate(port).then(setTemplate).catch(() => undefined); }, [port]);
  const [list, setList] = useState<UserTemplate[]>([BUILTIN_SBD]);
  const [listTick, setListTick] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // Шаблоны компьютера — с сервера; пока не загружены (сервер не запущен) — повтор каждые 15 с.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => listTemplates()
      .then((l) => { if (alive) { setList(l); setLoaded(true); } })
      .catch(() => { if (alive) { setLoaded(false); timer = setTimeout(load, 15_000); } });
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [listTick]);
  const resolved = resolveTemplate(list, template, loaded);
  const templates: TemplatesState = { ...resolved, list, reload: () => setListTick((n) => n + 1) };
  // Настройки печати встроенных документов (п.4 АОСР) — у шаблона книги.
  const options: PrintOptions = resolved.template.print ?? PrintOptions.parse({});
  const chooseTemplate = (t: TemplateCode) => {
    setTemplate(t);
    saveTemplate(port, t).catch(() => undefined);
  };
  const flow: CreateFlow = { start: () => setCreating(true), finish: () => { setCreating(false); state.refresh(); } };
  const { book, selection } = state;
  const active = selection ? sectionForSheet(selection.sheet) : null;
  const allMissing = !!book && book.missing.length === TABLE_NAMES.length;

  return (
    <ServerDownContext.Provider value={() => setServerDown(true)}>
      <TemplateContext.Provider value={template}>
      <UserTemplateContext.Provider value={templates}>
      <PrintOptionsContext.Provider value={options}>
        <div className="app">
          <TopBar screen={screen} onScreen={setScreen} template={template} templates={list} onTemplate={chooseTemplate} />
          {serverDown && (
            <div className="banner" role="alert">
              <p>Сервер не запущен: листы работают, печать и сканы недоступны. Запустите «Конструктор ИД» на компьютере.</p>
              <button className="btn" onClick={() => setServerDown(false)}>Скрыть</button>
            </div>
          )}
          {state.error && <p className="error" role="alert">{state.error}</p>}
          {screen === "templates" ? <TemplateEditor state={state} onChoose={chooseTemplate} />
            : screen === "fields" ? <FieldsScreen state={state} />
            : screen === "settings" ? <SettingsScreen /> : screen === "assistant" ? <AssistantScreen /> : screen === "normativ" ? (
            <NormativScreen port={port} />
          ) : !book ? <p className="notice">Читаю книгу…</p> : allMissing || creating ? slots.create?.(state, book.missing, flow) : (
            <>
              <nav className="stamp" role="tablist" aria-label="Разделы">
                {SECTIONS.map((s) => (
                  <button key={s.id} role="tab" aria-selected={s.id === active} onClick={() => void port.activateSheet(s.sheets[0])}>
                    {s.label}
                  </button>
                ))}
              </nav>
              {(book.missing.length > 0 || state.outdated) && slots.create?.(state, book.missing, flow)}
              <main className="content">
                <SheetTools port={port} state={state} onRowsAdded={slots.onRowsAdded && ((t, f, n) => slots.onRowsAdded!(state, t, f, n))} />
                <TableTools port={port} state={state} />
                {slots.card?.(state)}
              </main>
            </>
          )}
        </div>
      </PrintOptionsContext.Provider>
      </UserTemplateContext.Provider>
      </TemplateContext.Provider>
    </ServerDownContext.Provider>
  );
}
