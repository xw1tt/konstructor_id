// Панель «Конструктор ИД»: разделы (листы книги), «Функционал листа», «Функционал таблицы», карточка строки.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SectionIcon } from "./icons.tsx";
import { catalogKit, catalogApi, FormKit, templateKit } from "./kits.ts";
import { FormAttach } from "./FormAttach.tsx";
import { NEEDED_SHEETS_SETTING, neededSheetsOn, sheetPlan } from "@idk/shared/workbook/sheets";
import { loadTemplate, saveTemplate, DEFAULT_TEMPLATE, PrintOptions, type TemplateCode } from "@idk/shared/templates";
import { TABLE_NAMES, type TableName } from "@idk/shared/workbook/schema";
import type { ExcelPort } from "../book/excelPort.ts";
import { ServerDownContext } from "../server.tsx";
import { SECTIONS, sectionForSheet } from "./sections.ts";
import { useBook, type BookState } from "./useBook.ts";
import { SheetTools } from "./SheetTools.tsx";
import { MergeNote } from "./CreateBook.tsx";
import { TableTools } from "./TableTools.tsx";
import { TopBar } from "./TopBar.tsx";
import { NormativScreen } from "./NormativScreen.tsx";
import { AssistantScreen } from "./AssistantScreen.tsx";
import { SettingsScreen } from "./SettingsScreen.tsx";
import { TemplateContext, PrintOptionsContext, UserTemplateContext, type TemplatesState } from "./templateContext.ts";
import { TemplateEditor } from "./TemplateEditor.tsx";
import { FieldsScreen } from "./FieldsScreen.tsx";
import { LibraryScreen } from "./LibraryScreen.tsx";
import { WizardScreen } from "./WizardScreen.tsx";
import { AssistantSession } from "./assistant.ts";
import { aiApi } from "./aiApi.ts";
import { listTemplates, resolveTemplate, saveTemplateDocs, createTemplate, deleteTemplate } from "./templatesApi.ts";
import { BUILTIN_SBD, type UserTemplate } from "@idk/shared/forms/template";
import type { ScreenId } from "./screens.ts";
import type { Catalog } from "@idk/shared/catalog/model";
import { CatalogContext, loadCatalog, workListNames } from "./catalogApi.ts";

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
  // Итог переноса книги до 0.27 (план 31) — пока пользователь не закроет.
  const [, setMergeShown] = useState(0);
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
  // Справочник документов — с сервера, повтор каждые 15 с, пока сервер не ответит.
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => loadCatalog()
      .then((r) => { if (alive) setCatalog(r.catalog); })
      .catch(() => { if (alive) timer = setTimeout(load, 15_000); });
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
  // План 17: «Только нужные листы» — настройка книги; пересчёт при включении и при смене шаблона книги.
  // План 19: разговор с помощником переживает переход между экранами.
  // План 20: помощник дополняет справочник — после применения и отмены справочник перечитывается.
  // План 20: формы заказчика — разметка помощником по акту под курсором, в шаблоне книги.
  const tplRef = useRef(resolved.template.id);
  tplRef.current = resolved.template.id;
  const actRef = useRef<string | null>(null);
  actRef.current = state.lastAct;
  const [formKit] = useState(() => new FormKit({ templateId: () => tplRef.current, act: () => actRef.current }));
  // Бланки и настройки печати шаблона: применение сохраняет шаблон (встроенный — копией, выбранной для книги).
  const chooseRef = useRef(chooseTemplate);
  chooseRef.current = chooseTemplate;
  const [tplKit] = useState(() => templateKit({
    list: listTemplates, save: saveTemplateDocs, create: createTemplate, remove: deleteTemplate,
    choose: async (id) => { chooseRef.current(id); },
  }, () => setListTick((n) => n + 1)));
  const [assistant] = useState(() => new AssistantSession({ store: port, chat: aiApi.chat, kits: [catalogKit(catalogApi, () => setListTick((n) => n + 1)), formKit, tplKit] }));
  // «Только нужные листы» включено по умолчанию: листы — по документам шаблона книги.
  const [neededOn, setNeededOn] = useState(false);
  useEffect(() => { void port.setting(NEEDED_SHEETS_SETTING).then((v) => setNeededOn(neededSheetsOn(v))).catch(() => undefined); }, [port]);
  const applySheets = async (on: boolean) => {
    if (!state.book) return;
    const p = sheetPlan(resolved.template, state.book, on);
    await port.setSheetsVisible(p.visible, p.hidden);
  };
  const needed = { on: neededOn, set: async (v: boolean) => { await port.setSetting(NEEDED_SHEETS_SETTING, v ? "1" : "0"); setNeededOn(v); await applySheets(v); } };
  // Пересчёт листов при смене шаблона или его документов.
  const tplKey = `${resolved.template.id}:${resolved.template.docs.map((d) => (d.kind === "builtin" ? d.doc : d.code)).join(",")}`;
  useEffect(() => { if (neededOn && state.book) void applySheets(true).catch(() => undefined); }, [tplKey, neededOn, !!state.book]); // eslint-disable-line react-hooks/exhaustive-deps
  const flow: CreateFlow = { start: () => setCreating(true), finish: () => { setCreating(false); state.refresh(); } };
  const { book, selection } = state;
  const active = selection ? sectionForSheet(selection.sheet) : null;
  const allMissing = !!book && book.missing.length === TABLE_NAMES.length;
  // Список «ВидыРабот» на листе «Списки»: при загрузке справочника, смене шаблона и после «Обновить разметку».
  const hasActs = !!book && !book.missing.includes("Акты");
  const names = catalog ? workListNames(catalog, resolved.template) : null;
  const listKey = names && hasActs && !state.outdated ? names.join("\n") : null;
  useEffect(() => {
    if (listKey === null) return;
    void port.writeWorkList(listKey.split("\n").filter(Boolean)).catch(() => undefined);
  }, [port, listKey]);

  return (
    <ServerDownContext.Provider value={() => setServerDown(true)}>
      <TemplateContext.Provider value={template}>
      <UserTemplateContext.Provider value={templates}>
      <PrintOptionsContext.Provider value={options}>
      <CatalogContext.Provider value={catalog}>
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
            : screen === "library" ? <LibraryScreen port={port} state={state} />
            : screen === "wizard" ? <WizardScreen port={port} state={state} onClose={() => setScreen("home")} />
            : screen === "settings" ? <SettingsScreen state={state} assistant={assistant} /> : screen === "assistant" ? <AssistantScreen port={port} state={state} session={assistant} onSettings={() => setScreen("settings")} extra={<FormAttach kit={formKit} onChoose={chooseTemplate} />} /> : screen === "normativ" ? (
            <NormativScreen port={port} />
          ) : !book ? <p className="notice">Читаю книгу…</p> : allMissing || creating ? slots.create?.(state, book.missing, flow) : (
            <>
              <nav className="stamp" role="tablist" aria-label="Разделы">
                {SECTIONS.map((s) => (
                  <button key={s.id} role="tab" aria-selected={s.id === active} title={s.label} aria-label={s.label} onClick={() => void port.activateSheet(s.sheets[0])}>
                    <SectionIcon id={s.id} /><span className="st-label">{s.label}</span>
                  </button>
                ))}
              </nav>
              {(book.missing.length > 0 || state.outdated) && slots.create?.(state, book.missing, flow)}
              {port.lastMerge && <MergeNote merge={port.lastMerge} onClose={() => { port.lastMerge = null; setMergeShown((n) => n + 1); }} />}
              <main className="content">
                {/* Мастер первого акта (план 17): в книге без актов и на листе «База актов». */}
                {((book.tables["Акты"]?.length ?? 0) === 0 || selection?.sheet === "База актов") && !book.missing.includes("Акты") && (
                  <div className={(book.tables["Акты"]?.length ?? 0) === 0 ? "banner wiz-banner" : "row-actions"}>
                    {(book.tables["Акты"]?.length ?? 0) === 0 && <p>В книге ещё нет актов. Мастер проведёт от объекта до печати АОСР за 5 шагов.</p>}
                    <button className="btn btn-primary" onClick={() => setScreen("wizard")}>Мастер первого акта</button>
                  </div>
                )}
                <SheetTools port={port} state={state} needed={needed} onRowsAdded={slots.onRowsAdded && ((t, f, n) => slots.onRowsAdded!(state, t, f, n))} />
                <TableTools port={port} state={state} />
                {slots.card?.(state)}
              </main>
            </>
          )}
        </div>
      </CatalogContext.Provider>
      </PrintOptionsContext.Provider>
      </UserTemplateContext.Provider>
      </TemplateContext.Provider>
    </ServerDownContext.Provider>
  );
}
