// План 25: облако в панели — состояние, вход, строка статуса, раздел «Облако» в настройках.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { blockReason, checkCloud, CHECK_MS, cloudLogin, emptyCache, loadCache, normUrl, saveCache, withHealth, type CloudCache, type CloudMode } from "./cloud.ts";
import { setAccessBlock } from "./access.ts";

const storage = (() => { try { return window.localStorage; } catch { return null; } })();
/** Запрос к облаку не дольше 15 секунд: неверный адрес не должен «подвешивать» вход. */
const fetchT = (url: string, init?: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
const money = (r: number | undefined) => (r === undefined ? "" : `${r.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`);

export interface CloudCtl {
  mode: CloudMode; cache: CloudCache; busy: boolean;
  setUrl(url: string): Promise<void>; login(email: string, pw: string): Promise<void>; logout(): Promise<void>; refresh(): Promise<void>;
}

export function useCloud(): CloudCtl {
  const [cache, setCache] = useState<CloudCache>(() => loadCache(storage));
  const [mode, setMode] = useState<CloudMode>(() => (loadCache(storage).url ? { kind: "login" } : { kind: "off" }));
  const [busy, setBusy] = useState(false);
  const ref = useRef(cache);
  const apply = useCallback((r: { mode: CloudMode; cache: CloudCache }) => {
    ref.current = r.cache; setCache(r.cache); saveCache(storage, r.cache); setMode(r.mode); setAccessBlock(blockReason(r.mode));
  }, []);
  const refresh = useCallback(async () => apply(await checkCloud(ref.current, fetchT, Date.now())), [apply]);
  useEffect(() => {
    // До ответа облака — по последнему известному статусу (сутки), чтобы панель не мигала экраном входа.
    const c = ref.current;
    if (c.url && c.token && c.me && c.checkedAt !== null && Date.now() - c.checkedAt < 86400_000) {
      const a = c.me.tenant?.access ?? "active";
      const m: CloudMode = { kind: a === "active" ? "ok" : a, me: c.me, offline: true };
      setMode(m); setAccessBlock(blockReason(m));
    } else setAccessBlock(blockReason(mode));
    void refresh();
    const t = setInterval(() => void refresh(), CHECK_MS);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    mode, cache, busy, refresh,
    setUrl: async (url) => {
      setBusy(true);
      try {
        const u = url.trim() ? normUrl(url) : "";
        // Адрес сразу проверяется: опечатка или адрес-пример не должны выглядеть как «вход завис».
        apply(await withHealth(await checkCloud({ ...emptyCache(), url: u }, fetchT, Date.now()), fetchT));
      } finally { setBusy(false); }
    },
    login: async (email, pw) => { setBusy(true); try { apply(await cloudLogin(ref.current, email.trim(), pw, fetchT, Date.now())); } finally { setBusy(false); } },
    logout: async () => {
      const c = ref.current;
      try { if (c.token) await fetch(`${c.url}/api/auth/logout`, { method: "POST", headers: { authorization: `Bearer ${c.token}` } }); } catch { /* нет связи — выходим на ПК */ }
      apply({ mode: c.url ? { kind: "login" } : { kind: "off" }, cache: { ...c, token: "", me: null, checkedAt: null } });
    },
  };
}

export const CloudContext = createContext<CloudCtl | null>(null);

export function CloudLogin({ cloud }: { cloud: CloudCtl }) {
  const [email, setEmail] = useState(cloud.cache.me?.user.email ?? ""), [pw, setPw] = useState("");
  const m = cloud.mode;
  return (
    <main className="content">
      <h2 className="app-title">Вход в облако</h2>
      <p className="muted">{cloud.cache.url}</p>
      <form className="cloud-login" onSubmit={(e) => { e.preventDefault(); void cloud.login(email, pw); }}>
        <label className="field"><span className="field-label">Почта</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span className="field-label">Пароль</span><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        <button className="btn btn-primary" disabled={cloud.busy}>Войти</button>
      </form>
      {m.kind === "login" && m.error && <p className="error" role="alert">{m.error}</p>}
      <p className="muted">Пароль задаётся по ссылке-приглашению от администратора компании. Адрес облака — в «Настройках».</p>
    </main>
  );
}

/** Строка под верхней: компания и баланс; при ограничении — причина. */
export function CloudStatus({ cloud, onSettings }: { cloud: CloudCtl; onSettings(): void }) {
  const m = cloud.mode;
  if (m.kind === "off" || m.kind === "login") return null;
  const t = m.me?.tenant;
  const reason = blockReason(m);
  return (
    <div className={`cloud-line${reason ? " cloud-warn" : ""}`}>
      <button className="cloud-link" onClick={onSettings} title="Облако — настройки">
        {t ? <>{t.name}{t.balanceRub !== undefined && <> · <b>{money(t.balanceRub)}</b></>}</> : m.me?.user.email ?? ""}
        {"offline" in m && m.offline && <span className="muted"> · нет связи</span>}
      </button>
      {reason && <span className="cloud-reason">{reason}</span>}
    </div>
  );
}

/** «Настройки» → «Облако». */
export function CloudSettings() {
  const cloud = useContext(CloudContext);
  const [url, setUrl] = useState(cloud?.cache.url ?? "");
  if (!cloud) return null;
  const m = cloud.mode;
  return (
    <section>
      <h3 className="tools-title">Облако</h3>
      <p className="muted">Адрес облачного сервера «Конструктора ИД», например <code>https://id.example.ru</code>. Пусто — работа без облака.</p>
      <div className="row-actions">
        <input type="text" aria-label="Адрес облака" style={{ flex: 1, minWidth: "12em" }} value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
        <button className="btn btn-primary" disabled={cloud.busy} onClick={() => void cloud.setUrl(url)}>Сохранить</button>
      </div>
      {m.kind !== "off" && m.kind !== "login" && m.me && (
        <p className="muted">Вход выполнен: {m.me.user.name || m.me.user.email}{m.me.tenant ? `, ${m.me.tenant.name}` : ""}. {m.me.tenant?.accessLabel ? `Доступ: ${m.me.tenant.accessLabel}.` : ""}{" "}
          <button className="btn" onClick={() => void cloud.logout()}>Выйти</button></p>
      )}
      {m.kind === "login" && <p className="notice">Нужно войти — откройте «⌂».</p>}
    </section>
  );
}
