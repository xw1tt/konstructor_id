// Экран «Настройки»: параметры программы — папка библиотеки компании (план 16). Выбор п.4 АОСР — в «Редакторе шаблонов».
import { useEffect, useState } from "react";
import { librarySettings, setLibraryDir } from "./libraryApi.ts";

export function SettingsScreen() {
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
      <p className="muted">«Исполнительная схема» в п.4 АОСР настраивается в шаблоне: «Шаблоны ▾» → «Редактор шаблонов», рядом с документом АОСР.</p>
    </main>
  );
}
