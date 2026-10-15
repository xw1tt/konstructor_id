import { useCallback, useEffect, useState } from "react";
import { apiGet, ServerUnavailableError } from "./api.ts";
import { ServerDownContext } from "./server.tsx";
import { Placeholder } from "./tabs/Placeholder.tsx";
import type { ObjectInfo } from "@idk/shared/schemas";

export const TABS = ["Объект", "Материалы", "Входной контроль", "Кабели", "АОСР", "Комплект и печать"] as const;
type Tab = (typeof TABS)[number];

export type TabRenderers = Partial<Record<Tab, () => JSX.Element>>;

export function App({ tabs = {} }: { tabs?: TabRenderers }) {
  const [tab, setTab] = useState<Tab>("Объект");
  const [down, setDown] = useState(false);
  const [objectName, setObjectName] = useState("");
  const [epoch, setEpoch] = useState(0);

  const check = useCallback(async () => {
    try {
      const o = await apiGet<ObjectInfo>("/api/object");
      setObjectName(o.name);
      setDown(false);
      setEpoch((e) => e + 1);
    } catch (e) {
      if (e instanceof ServerUnavailableError) setDown(true);
    }
  }, []);
  useEffect(() => { void check(); }, [check]);

  const render = tabs[tab];
  return (
    <ServerDownContext.Provider value={() => setDown(true)}>
      <div className="app">
        <header className="app-head">
          <h1 className="app-title">Конструктор ИД</h1>
          <p className="app-sub" title={objectName}>{objectName || "Объект не заполнен"}</p>
        </header>
        <nav className="stamp" role="tablist" aria-label="Разделы">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={t === tab} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        {down && (
          <div className="banner" role="alert">
            <p>Сервер не запущен. Запустите «Конструктор ИД» на компьютере.</p>
            <button className="btn" onClick={() => void check()}>Повторить</button>
          </div>
        )}
        <main className="content" key={epoch}>
          {render ? render() : <Placeholder title={tab} />}
        </main>
      </div>
    </ServerDownContext.Provider>
  );
}
