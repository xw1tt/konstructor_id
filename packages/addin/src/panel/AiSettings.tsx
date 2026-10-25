// План 19: «Настройки» → «Нейросети» — подключения (добавить, изменить, проверить, сделать активным, удалить) и расход.
import { useEffect, useState } from "react";
import { AI_KINDS, AI_KIND_LABELS, AI_DEFAULTS, GIGACHAT_SCOPES, type AiKind, type ProviderPublic } from "@idk/shared/ai/model";
import { aiApi, type UsageTotal } from "./aiApi.ts";

interface Form { id: string; name: string; kind: AiKind; baseUrl: string; model: string; key: string; folderId: string; scope: string; caFile: string; maskNames: "" | "yes" | "no"; hasKey: boolean }
const empty = (kind: AiKind = "yandex"): Form => ({ id: "new", name: AI_KIND_LABELS[kind], kind, baseUrl: "", model: "", key: "", folderId: "", scope: "", caFile: "", maskNames: "", hasKey: false });
const fromPublic = (p: ProviderPublic): Form => ({ ...empty(p.kind), ...p, key: "", maskNames: p.maskNames === null ? "" : p.maskNames ? "yes" : "no" });

const HELP: Record<AiKind, string> = {
  yandex: "Yandex AI Studio: создайте сервисный аккаунт с ролью ai.languageModels.user и API-ключ; ID каталога — в консоли Yandex Cloud.",
  gigachat: "GigaChat API: «Ключ авторизации» из личного кабинета Studio. Серверы Сбера работают на сертификате Минцифры — скачайте корневой сертификат (russian_trusted_root_ca) на Госуслугах и укажите путь к файлу.",
  local: "Ollama или vLLM на этом ПК или сервере компании; данные не уходят наружу. Модель с поддержкой инструментов, например qwen2.5:14b.",
  openai: "Любой сервис с OpenAI-совместимым API: адрес (…/v1), ключ и модель. Зарубежный сервис — ФИО по умолчанию не отправляются.",
};

export function AiSettings() {
  const [data, setData] = useState<{ active: string | null; providers: ProviderPublic[] } | null>(null);
  const [usage, setUsage] = useState<UsageTotal[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    void aiApi.providers().then(setData).catch((e) => setMsg({ ok: false, text: (e as Error).message }));
    void aiApi.usage().then((u) => setUsage(u.totals)).catch(() => undefined);
  };
  useEffect(load, []);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); load(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };
  const save = () => form && act(async () => {
    const saved = await aiApi.save(form.id, {
      name: form.name, kind: form.kind, baseUrl: form.baseUrl, model: form.model, key: form.key, folderId: form.folderId,
      scope: form.scope, caFile: form.caFile, maskNames: form.maskNames === "" ? null : form.maskNames === "yes",
    });
    setForm(fromPublic(saved));
  }, "Подключение сохранено");
  const test = (id: string) => act(async () => {
    const r = await aiApi.test(id);
    setMsg({ ok: true, text: `Ответ за ${(r.ms / 1000).toFixed(1)} с: «${r.text}»` });
  }, "");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const field = (label: string, k: "name" | "baseUrl" | "model" | "folderId" | "caFile", placeholder = "") => (
    <label className="field"><span className="field-label">{label}</span>
      <input value={form![k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} /></label>
  );

  return (
    <section className="ai-settings">
      <h3 className="tools-title">Нейросети</h3>
      {data && !data.providers.length && <p className="muted">Подключений нет. Добавьте нейросеть — она понадобится «Помощнику».</p>}
      <ul className="lib-list">
        {data?.providers.map((p) => (
          <li key={p.id} className="ai-row">
            <span><b>{p.name}</b> <span className="muted">— {AI_KIND_LABELS[p.kind]}{p.id === data.active ? ", активная" : ""}{p.kind !== "local" && !p.hasKey ? ", нет ключа" : ""}</span></span>
            <span className="row-actions">
              <button className="btn" disabled={busy} onClick={() => setForm(fromPublic(p))}>Изменить</button>
              <button className="btn" disabled={busy} onClick={() => void test(p.id)}>Проверить</button>
              {p.id !== data.active && <button className="btn" disabled={busy} onClick={() => void act(() => aiApi.setActive(p.id), "Активная нейросеть выбрана")}>Сделать активной</button>}
            </span>
          </li>
        ))}
      </ul>
      {!form && <button className="btn" onClick={() => setForm(empty())}>+ Подключение</button>}
      {form && (
        <div className="wiz-form ai-form">
          <label className="field"><span className="field-label">Вид</span>
            <select value={form.kind} disabled={form.id !== "new"} onChange={(e) => setForm({ ...empty(e.target.value as AiKind) })}>
              {AI_KINDS.map((k) => <option key={k} value={k}>{AI_KIND_LABELS[k]}</option>)}
            </select></label>
          <p className="muted">{HELP[form.kind]}</p>
          {field("Название", "name")}
          {(form.kind === "local" || form.kind === "openai") && field("Адрес API", "baseUrl", AI_DEFAULTS[form.kind].baseUrl || "https://…/v1")}
          {form.kind !== "local" && (
            <label className="field"><span className="field-label">{form.kind === "gigachat" ? "Ключ авторизации" : "Ключ API"}</span>
              <input type="password" autoComplete="off" value={form.key} placeholder={form.hasKey ? "сохранён — оставьте пустым, чтобы не менять" : ""} onChange={(e) => set("key", e.target.value)} /></label>
          )}
          {form.kind === "yandex" && field("ID каталога", "folderId", "b1g…")}
          {form.kind === "yandex" && form.folderId.trim() && !/^b1g/.test(form.folderId.trim()) && (
            <p className="error">Похоже, это не ID каталога: он начинается с «b1g» (консоль Yandex Cloud → каталог → «Обзор»). «aje…» — ID сервисного аккаунта или ключа.</p>
          )}
          {form.kind === "gigachat" && (
            <label className="field"><span className="field-label">Тип доступа</span>
              <select value={form.scope || GIGACHAT_SCOPES[0]} onChange={(e) => set("scope", e.target.value)}>
                {GIGACHAT_SCOPES.map((s) => <option key={s} value={s}>{s === "GIGACHAT_API_PERS" ? "Физлицо (PERS)" : s === "GIGACHAT_API_B2B" ? "Бизнес, предоплата (B2B)" : "Бизнес, постоплата (CORP)"}</option>)}
              </select></label>
          )}
          {field("Модель", "model", form.kind === "yandex" ? "по умолчанию — yandexgpt/latest каталога" : AI_DEFAULTS[form.kind].model || "например, qwen2.5:14b")}
          {(form.kind === "gigachat" || form.kind === "openai") && field("Файл корневого сертификата (необязательно)", "caFile", "C:\\…\\russian_trusted_root_ca.cer")}
          <label className="field"><span className="field-label">ФИО представителей в запросах</span>
            <select value={form.maskNames} onChange={(e) => set("maskNames", e.target.value as Form["maskNames"])}>
              <option value="">по умолчанию (не отправлять — только зарубежным)</option>
              <option value="yes">не отправлять</option>
              <option value="no">отправлять</option>
            </select></label>
          <div className="row-actions">
            <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>Сохранить</button>
            {form.id !== "new" && <button className="btn btn-danger" disabled={busy} onClick={() => void act(async () => { await aiApi.remove(form.id); setForm(null); }, "Подключение удалено")}>Удалить</button>}
            <button className="btn" onClick={() => setForm(null)}>Закрыть</button>
          </div>
        </div>
      )}
      {msg && msg.text && <p className={msg.ok ? "notice" : "error"} role={msg.ok ? undefined : "alert"}>{msg.text}</p>}
      {usage.length > 0 && (
        <>
          <h3 className="tools-title">Расход за месяц</h3>
          <table className="ai-usage"><thead><tr><th>Нейросеть</th><th>Запросов</th><th>Токенов</th></tr></thead>
            <tbody>{usage.map((u) => <tr key={u.provider}><td>{u.name}</td><td>{u.requests}</td><td>{(u.prompt + u.completion).toLocaleString("ru-RU")}</td></tr>)}</tbody></table>
        </>
      )}
    </section>
  );
}
