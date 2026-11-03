// Экран «Настройки»: нейросети помощника (план 19), папка библиотеки компании (план 16). Выбор п.4 АОСР — в «Редакторе шаблонов».
import { ReportProblem } from "./ReportProblem.tsx";
import type { BookState } from "./useBook.ts";
import type { AssistantSession } from "./assistant.ts";
import { useEffect, useState } from "react";
import { librarySettings, setLibraryDir } from "./libraryApi.ts";
import { widthSupport, widthSupportText } from "./panelWidth.ts";
import { apiGet } from "../api.ts";

declare const Office: unknown;
/** Версия панели (из манифеста при сборке); в тестах и при запуске без сборки — нет. */
declare const __PANEL_VERSION__: string | undefined;
const panelVersion = typeof __PANEL_VERSION__ === "string" ? __PANEL_VERSION__ : "";

/** Установленная версия (сервер) и версия панели, которую показывает Excel: разные — Excel держит старую из кэша. */
function VersionInfo() {
  const [installed, setInstalled] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { void apiGet<{ version: string }>("/api/version").then((r) => setInstalled(r.version)).catch(() => setFailed(true)); }, []);
  const stale = !!installed && !!panelVersion && installed !== "разработка" && installed !== panelVersion;
  return (
    <div className="version-info">
      <p><b>Версия программы:</b> {installed ?? (failed ? "сервер не отвечает" : "…")}
        {panelVersion && (stale || failed) && <span className="muted"> · панель {panelVersion}</span>}</p>
      {stale && (
        <p className="warn" role="status">Excel показывает панель прежней версии ({panelVersion}), а установлена {installed}. Закройте Excel полностью
          и откройте снова. Если не поможет — закройте Excel и удалите содержимое папки <code>%LOCALAPPDATA%\Microsoft\Office\16.0\Wef</code> (кэш надстроек).</p>
      )}
    </div>
  );
}
import { AiSettings } from "./AiSettings.tsx";

export function SettingsScreen({ state = null, assistant = null }: { state?: BookState | null; assistant?: AssistantSession | null } = {}) {
  const [dir, setDir] = useState("");
  const [cur, setCur] = useState<{ dir: string; isDefault: boolean } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void librarySettings().then((s) => { setCur(s); setDir(s.isDefault ? "" : s.dir); }).catch((e) => setMsg({ ok: false, text: (e as Error).message }));
  }, []);
  const save = async (value: string | null) => {
    setMsg(null);
    try {
      const s = await setLibraryDir(value);
      setCur(s);
      setDir(s.isDefault ? "" : s.dir);
      setMsg({ ok: true, text: s.isDefault ? "Библиотека — на этом компьютере." : "Папка библиотеки сохранена." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <main className="content settings">
      <h2 className="app-title">Настройки</h2>
      <VersionInfo />
      <AiSettings />
      <h3 className="tools-title">Папка библиотеки компании</h3>
      <p className="muted">Чтобы у всех инженеров была одна библиотека, укажите общую сетевую папку, например
        <code> \\server\ИД\Библиотека</code>, на каждом компьютере. Пусто — библиотека на этом компьютере.</p>
      {cur && <p className="muted">Сейчас: {cur.dir}{cur.isDefault ? " (на этом компьютере)" : ""}</p>}
      <div className="row-actions">
        <input type="text" aria-label="Папка библиотеки" style={{ flex: 1, minWidth: "12em" }} value={dir} placeholder="\\server\ИД\Библиотека"
          onChange={(e) => setDir(e.target.value)} />
        <button className="btn btn-primary" onClick={() => void save(dir.trim() || null)}>Сохранить</button>
      </div>
      {msg && <p className={msg.ok ? "notice" : "error"} role={msg.ok ? undefined : "alert"}>{msg.text}</p>}
      <h3 className="tools-title">Панель</h3>
      <p className="muted">{widthSupportText(widthSupport(typeof Office !== "undefined" ? Office : undefined))}</p>
      <p className="muted">«Исполнительная схема» в п.4 АОСР настраивается в шаблоне: «Шаблоны ▾» → «Редактор шаблонов», рядом с документом АОСР.</p>
      <ReportProblem state={state} assistant={assistant} />
    </main>
  );
}
