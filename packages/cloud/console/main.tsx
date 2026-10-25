// Этап 1, план 24: консоль владельца сервиса и администратора компании (браузер, /console).
import { createRoot } from "react-dom/client";
import { useEffect, useState, type ReactNode } from "react";
import { api, AuthError, dt, getToken, KIND, money, ROLE, setToken } from "./api.ts";

type Me = { user: { id: string; email: string; name: string; role: string }; tenant: any };
const hash = () => location.hash.replace(/^#\/?/, "");

function useHash() {
  const [h, setH] = useState(hash());
  useEffect(() => { const f = () => setH(hash()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return h;
}

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  return m ? <p className={m.ok ? "ok" : "err"} role={m.ok ? "status" : "alert"}>{m.text}</p> : null;
}

function Login({ onIn }: { onIn(): void }) {
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState("");
  return (
    <form className="card narrow" onSubmit={async (e) => {
      e.preventDefault(); setErr("");
      try { const r = await api("POST", "/api/auth/login", { email, password: pw, client: "console" }); setToken(r.token); onIn(); } catch (x) { setErr((x as Error).message); }
    }}>
      <h1>Конструктор ИД</h1>
      <p className="muted">Консоль управления</p>
      <label>Почта<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Пароль<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
      <button className="primary">Войти</button>
      {err && <p className="err">{err}</p>}
    </form>
  );
}

function Invite({ token, onIn }: { token: string; onIn(): void }) {
  const [info, setInfo] = useState<any>(null), [err, setErr] = useState(""), [name, setName] = useState(""), [pw, setPw] = useState(""), [pw2, setPw2] = useState("");
  useEffect(() => { api("GET", `/api/invites/${token}`).then((i) => { setInfo(i); setName(i.name); }).catch((x) => setErr(x.message)); }, [token]);
  if (err && !info) return <div className="card narrow"><h1>Приглашение</h1><p className="err">{err}</p><a href="#/">Ко входу</a></div>;
  if (!info) return <p className="muted">Загрузка…</p>;
  return (
    <form className="card narrow" onSubmit={async (e) => {
      e.preventDefault(); setErr("");
      if (pw !== pw2) { setErr("Пароли не совпадают"); return; }
      try { const r = await api("POST", `/api/invites/${token}`, { name, password: pw, client: "console" }); setToken(r.token); location.hash = "#/"; onIn(); } catch (x) { setErr((x as Error).message); }
    }}>
      <h1>{info.existing ? "Новый пароль" : "Приглашение"}</h1>
      <p>{info.email} — {ROLE[info.role]}{info.tenant ? `, ${info.tenant}` : ""}</p>
      {!info.existing && <label>Имя<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Фамилия И.О." /></label>}
      <label>Пароль (не короче 8 символов)<input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
      <label>Ещё раз<input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></label>
      <button className="primary">Сохранить и войти</button>
      {err && <p className="err">{err}</p>}
      {info.role !== "owner" && <p className="muted">Дальше войдите этой почтой и паролем в панели «Конструктора ИД» в Excel: «Настройки» → «Облако».</p>}
    </form>
  );
}

const Badge = ({ access, label }: { access: string; label?: string }) => <span className={`badge b-${access}`} title={label}>{access === "active" ? "активен" : access === "readonly" ? "только чтение" : "приостановлен"}</span>;

function LinkBox({ link }: { link: string }) {
  return (
    <div className="linkbox">
      <p>Ссылка для приглашения (действует 7 дней) — отправьте её сотруднику:</p>
      <input readOnly value={link} onFocus={(e) => e.target.select()} />
      <button onClick={() => void navigator.clipboard?.writeText(link)}>Копировать</button>
    </div>
  );
}

function InviteForm({ path, roles }: { path: string; roles: string[] }) {
  const [email, setEmail] = useState(""), [role, setRole] = useState(roles[0]), [link, setLink] = useState(""), [m, setM] = useState<any>(null);
  return (
    <div>
      <form className="row" onSubmit={async (e) => {
        e.preventDefault(); setM(null); setLink("");
        try { const r = await api("POST", path, { email, role }); setLink(r.link); setEmail(""); } catch (x) { setM({ ok: false, text: (x as Error).message }); }
      }}>
        <input type="email" placeholder="почта сотрудника" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <select value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</select>
        <button>Пригласить</button>
      </form>
      {link && <LinkBox link={link} />}
      <Msg m={m} />
    </div>
  );
}

function Ledger({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="muted">Операций нет.</p>;
  return (
    <table><thead><tr><th>Дата</th><th>Операция</th><th className="num">Сумма</th><th>Основание</th><th>Кто</th></tr></thead>
      <tbody>{rows.map((l) => <tr key={l.id}><td>{dt(l.at)}</td><td>{KIND[l.kind] ?? l.kind}</td><td className={`num ${l.amountRub < 0 ? "neg" : "pos"}`}>{money(l.amountRub)}</td><td>{l.reason}</td><td>{l.author ?? "—"}</td></tr>)}</tbody>
    </table>
  );
}

function Users({ rows, onToggle, onReset }: { rows: any[]; onToggle(u: any): void; onReset?(u: any): void }) {
  return (
    <table><thead><tr><th>Имя</th><th>Почта</th><th>Роль</th><th>Последний вход</th><th>Статус</th><th /></tr></thead>
      <tbody>{rows.map((u) => (
        <tr key={u.id} className={u.status === "blocked" ? "dim" : ""}>
          <td>{u.name || "—"}</td><td>{u.email}</td><td>{ROLE[u.role]}</td><td>{dt(u.last_seen)}</td><td>{u.status === "blocked" ? "заблокирован" : "активен"}</td>
          <td className="actions">
            <button onClick={() => onToggle(u)}>{u.status === "blocked" ? "Разблокировать" : "Заблокировать"}</button>
            {onReset && <button onClick={() => onReset(u)}>Ссылка для пароля</button>}
          </td>
        </tr>))}</tbody>
    </table>
  );
}

function Money({ tid, onDone }: { tid: string; onDone(): void }) {
  const [kind, setKind] = useState("topup"), [sum, setSum] = useState(""), [reason, setReason] = useState(""), [m, setM] = useState<any>(null);
  return (
    <form className="row" onSubmit={async (e) => {
      e.preventDefault(); setM(null);
      try {
        const r = await api("POST", `/api/owner/tenants/${tid}/ledger`, { kind, amountRub: Number(sum.replace(",", ".").replace(/\s/g, "")), reason });
        setSum(""); setReason(""); setM({ ok: true, text: `Готово. Баланс: ${money(r.balanceRub)}` }); onDone();
      } catch (x) { setM({ ok: false, text: (x as Error).message }); }
    }}>
      <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="topup">Пополнить</option><option value="adjust">Корректировка (±)</option></select>
      <input inputMode="decimal" placeholder={kind === "topup" ? "сумма, ₽" : "± сумма, ₽"} value={sum} onChange={(e) => setSum(e.target.value)} required style={{ width: "9em" }} />
      <input placeholder="основание: счёт №, причина" value={reason} onChange={(e) => setReason(e.target.value)} required style={{ flex: 1 }} />
      <button className="primary">Провести</button>
      <Msg m={m} />
    </form>
  );
}

function Tenant({ tid, tariffs }: { tid: string; tariffs: any[] }) {
  const [d, setD] = useState<any>(null), [m, setM] = useState<any>(null), [edit, setEdit] = useState<any>(null), [link, setLink] = useState("");
  const load = () => api("GET", `/api/owner/tenants/${tid}`).then((x) => { setD(x); setEdit({ name: x.tenant.name, inn: x.tenant.inn, seats: x.tenant.seats, tariffId: x.tenant.tariffId ?? "", creditRub: x.tenant.creditRub }); }).catch((x) => setM({ ok: false, text: x.message }));
  useEffect(() => { void load(); }, [tid]);
  if (!d) return <p className="muted">Загрузка…</p>;
  const run = async (fn: () => Promise<unknown>, ok: string) => { setM(null); try { await fn(); setM({ ok: true, text: ok }); await load(); } catch (x) { setM({ ok: false, text: (x as Error).message }); } };
  const s = d.state;
  return (
    <div>
      <p><a href="#/">← Компании</a></p>
      <h2>{d.tenant.name} <Badge access={s.access} label={s.accessLabel} /></h2>
      <div className="stats">
        <div><b>{money(s.balanceRub)}</b><span>баланс</span></div>
        <div><b>{d.tenant.seats}</b><span>рабочих мест</span></div>
        <div><b>{s.tariff ?? "без тарифа"}</b><span>{s.seatMonthRub ? `${money(s.seatMonthRub)} за место в месяц` : "бесплатно"}</span></div>
        <div><b>{money(s.creditRub)}</b><span>кредитный лимит</span></div>
      </div>
      <Msg m={m} />
      <h3>Баланс</h3>
      <Money tid={tid} onDone={() => void load()} />
      <h3>Доступ</h3>
      <div className="row">
        {d.tenant.status === "active"
          ? <button className="danger" onClick={() => { const reason = prompt("Причина приостановки") ?? ""; void run(() => api("POST", `/api/owner/tenants/${tid}/suspend`, { reason }), "Доступ приостановлен"); }}>Приостановить доступ</button>
          : <button className="primary" onClick={() => void run(() => api("POST", `/api/owner/tenants/${tid}/resume`, {}), "Доступ возобновлён")}>Возобновить доступ</button>}
        <span className="muted">{s.accessLabel}</span>
      </div>
      <h3>Реквизиты и условия</h3>
      <form className="grid2" onSubmit={(e) => { e.preventDefault(); void run(() => api("PUT", `/api/owner/tenants/${tid}`, { ...edit, seats: Number(edit.seats), creditRub: Number(String(edit.creditRub).replace(",", ".")), tariffId: edit.tariffId || null }), "Сохранено"); }}>
        <label>Название<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
        <label>ИНН<input value={edit.inn} onChange={(e) => setEdit({ ...edit, inn: e.target.value })} /></label>
        <label>Рабочих мест<input type="number" min={0} value={edit.seats} onChange={(e) => setEdit({ ...edit, seats: e.target.value })} /></label>
        <label>Тариф<select value={edit.tariffId} onChange={(e) => setEdit({ ...edit, tariffId: e.target.value })}><option value="">без тарифа (бесплатно)</option>{tariffs.map((t) => <option key={t.id} value={t.id}>{t.name} — {money(t.seatMonthRub)}/место</option>)}</select></label>
        <label>Кредитный лимит, ₽<input inputMode="decimal" value={edit.creditRub} onChange={(e) => setEdit({ ...edit, creditRub: e.target.value })} /></label>
        <div><button className="primary">Сохранить</button></div>
      </form>
      <h3>Сотрудники</h3>
      <InviteForm path={`/api/owner/tenants/${tid}/invites`} roles={["admin", "engineer", "reviewer"]} />
      {link && <LinkBox link={link} />}
      <Users rows={d.users} onToggle={(u) => void run(() => api("PUT", `/api/owner/users/${u.id}`, { status: u.status === "blocked" ? "active" : "blocked" }), "Сохранено")}
        onReset={(u) => void api("POST", `/api/owner/users/${u.id}/reset`).then((r) => setLink(r.link)).catch((x) => setM({ ok: false, text: x.message }))} />
      <h3>Операции</h3>
      <Ledger rows={d.ledger} />
    </div>
  );
}

function Tenants() {
  const [list, setList] = useState<any[] | null>(null), [form, setForm] = useState({ name: "", inn: "", seats: "1" }), [m, setM] = useState<any>(null);
  const load = () => api("GET", "/api/owner/tenants").then(setList).catch((x) => setM({ ok: false, text: x.message }));
  useEffect(() => { void load(); }, []);
  return (
    <div>
      <h2>Компании</h2>
      <form className="row" onSubmit={async (e) => {
        e.preventDefault(); setM(null);
        try { const r = await api("POST", "/api/owner/tenants", { name: form.name, inn: form.inn, seats: Number(form.seats) }); location.hash = `#/tenant/${r.id}`; } catch (x) { setM({ ok: false, text: (x as Error).message }); }
      }}>
        <input placeholder="Название компании" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={{ flex: 1 }} />
        <input placeholder="ИНН" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} style={{ width: "10em" }} />
        <input type="number" min={0} title="Рабочих мест" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} style={{ width: "5em" }} />
        <button className="primary">Добавить компанию</button>
      </form>
      <Msg m={m} />
      {!list ? <p className="muted">Загрузка…</p> : !list.length ? <p className="muted">Компаний пока нет.</p> : (
        <table><thead><tr><th>Компания</th><th>Доступ</th><th className="num">Баланс</th><th>Тариф</th><th className="num">Мест / пользователей</th></tr></thead>
          <tbody>{list.map((t) => (
            <tr key={t.id} className="click" onClick={() => { location.hash = `#/tenant/${t.id}`; }}>
              <td><a href={`#/tenant/${t.id}`}>{t.name}</a>{t.inn && <span className="muted"> ИНН {t.inn}</span>}</td><td><Badge access={t.access} label={t.accessLabel} /></td>
              <td className={`num ${t.balanceRub < 0 ? "neg" : ""}`}>{money(t.balanceRub)}</td><td>{t.tariff ?? "—"}</td><td className="num">{t.seats} / {t.users}</td>
            </tr>))}</tbody>
        </table>)}
    </div>
  );
}

function Tariffs({ list, reload }: { list: any[]; reload(): void }) {
  const empty = { id: "", name: "", seatMonthRub: "", aiPer1kRub: "0", reviewerFree: true };
  const [f, setF] = useState<any>(empty), [m, setM] = useState<any>(null);
  return (
    <div>
      <h2>Тарифы</h2>
      <table><thead><tr><th>Тариф</th><th className="num">За место в месяц</th><th className="num">Нейросеть, за 1000 токенов</th><th>Проверяющие</th><th /></tr></thead>
        <tbody>{list.map((t) => <tr key={t.id}><td>{t.name}</td><td className="num">{money(t.seatMonthRub)}</td><td className="num">{money(t.aiPer1kRub)}</td><td>{t.reviewerFree ? "бесплатно" : "платно"}</td>
          <td><button onClick={() => setF({ ...t, seatMonthRub: String(t.seatMonthRub), aiPer1kRub: String(t.aiPer1kRub) })}>Изменить</button></td></tr>)}</tbody>
      </table>
      <h3>{f.id ? `Тариф «${f.name}»` : "Новый тариф"}</h3>
      <form className="row" onSubmit={async (e) => {
        e.preventDefault(); setM(null);
        const body = { name: f.name, seatMonthRub: Number(String(f.seatMonthRub).replace(",", ".")), aiPer1kRub: Number(String(f.aiPer1kRub).replace(",", ".")), reviewerFree: f.reviewerFree };
        try { await api(f.id ? "PUT" : "POST", f.id ? `/api/owner/tariffs/${f.id}` : "/api/owner/tariffs", body); setF(empty); setM({ ok: true, text: "Сохранено" }); reload(); } catch (x) { setM({ ok: false, text: (x as Error).message }); }
      }}>
        <input placeholder="Название" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input inputMode="decimal" placeholder="₽ за место в месяц" value={f.seatMonthRub} onChange={(e) => setF({ ...f, seatMonthRub: e.target.value })} required />
        <input inputMode="decimal" placeholder="₽ за 1000 токенов" value={f.aiPer1kRub} onChange={(e) => setF({ ...f, aiPer1kRub: e.target.value })} />
        <label className="check"><input type="checkbox" checked={f.reviewerFree} onChange={(e) => setF({ ...f, reviewerFree: e.target.checked })} /> проверяющие бесплатно</label>
        <button className="primary">Сохранить</button>
        {f.id && <button type="button" onClick={() => setF(empty)}>Отмена</button>}
      </form>
      <Msg m={m} />
    </div>
  );
}

function Audit() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { void api("GET", "/api/owner/audit?limit=300").then(setRows); }, []);
  return (
    <div>
      <h2>Журнал действий</h2>
      {!rows ? <p className="muted">Загрузка…</p> : (
        <table><thead><tr><th>Когда</th><th>Кто</th><th>Компания</th><th>Действие</th><th>Над чем</th><th>Подробности</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}><td>{dt(r.at)}</td><td>{r.who ?? "система"}</td><td>{r.tenant ?? "—"}</td><td>{r.action}</td><td>{r.target}</td><td className="small">{JSON.stringify(r.details)}</td></tr>)}</tbody>
        </table>)}
    </div>
  );
}

function Company() {
  const [d, setD] = useState<any>(null), [m, setM] = useState<any>(null);
  const load = () => api("GET", "/api/company").then(setD).catch((x) => setM({ ok: false, text: x.message }));
  useEffect(() => { void load(); }, []);
  if (!d) return <><Msg m={m} /><p className="muted">Загрузка…</p></>;
  const s = d.state;
  return (
    <div>
      <h2>{d.tenant.name} <Badge access={s.access} label={s.accessLabel} /></h2>
      <div className="stats">
        <div><b>{money(s.balanceRub)}</b><span>баланс</span></div>
        <div><b>{d.seatsUsed} из {d.tenant.seats}</b><span>рабочих мест занято</span></div>
        <div><b>{s.tariff ?? "без тарифа"}</b><span>{s.seatMonthRub ? `${money(s.seatMonthRub)} за место в месяц` : ""}</span></div>
      </div>
      {s.access !== "active" && <p className="err">{s.access === "readonly" ? "Баланс исчерпан — пополните его у владельца сервиса." : "Доступ приостановлен владельцем сервиса."}</p>}
      <h3>Сотрудники</h3>
      <InviteForm path="/api/company/invites" roles={["engineer", "reviewer", "admin"]} />
      <Msg m={m} />
      <Users rows={d.users} onToggle={(u) => void api("PUT", `/api/company/users/${u.id}`, { status: u.status === "blocked" ? "active" : "blocked" }).then(load).catch((x) => setM({ ok: false, text: x.message }))} />
      <h3>Операции</h3>
      <Ledger rows={d.ledger} />
    </div>
  );
}

function Shell({ me, children, onOut }: { me: Me; children: ReactNode; onOut(): void }) {
  const owner = me.user.role === "owner";
  return (
    <div className="shell">
      <header>
        <b>Конструктор ИД</b>
        <nav>{owner ? <><a href="#/">Компании</a><a href="#/tariffs">Тарифы</a><a href="#/audit">Журнал</a></> : <a href="#/">Компания</a>}<a href="#/password">Пароль</a></nav>
        <span className="who">{me.user.name || me.user.email} · {ROLE[me.user.role]}</span>
        <button onClick={onOut}>Выйти</button>
      </header>
      <main>{children}</main>
    </div>
  );
}

function Password() {
  const [old, setOld] = useState(""), [pw, setPw] = useState(""), [m, setM] = useState<any>(null);
  return (
    <form className="card narrow" onSubmit={async (e) => {
      e.preventDefault(); setM(null);
      try { await api("POST", "/api/auth/password", { old, password: pw }); setM({ ok: true, text: "Пароль изменён. Войдите заново." }); setTimeout(() => { setToken(""); location.reload(); }, 1500); } catch (x) { setM({ ok: false, text: (x as Error).message }); }
    }}>
      <h2>Смена пароля</h2>
      <label>Текущий пароль<input type="password" value={old} onChange={(e) => setOld(e.target.value)} required /></label>
      <label>Новый пароль<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
      <button className="primary">Изменить</button>
      <Msg m={m} />
    </form>
  );
}

function App() {
  const h = useHash();
  const [me, setMe] = useState<Me | null | "none">(getToken() ? null : "none");
  const [tariffs, setTariffs] = useState<any[]>([]);
  const load = () => api<Me>("GET", "/api/me").then((m) => { setMe(m); if (m.user.role === "owner") void api("GET", "/api/owner/tariffs").then(setTariffs); })
    .catch((e) => { if (e instanceof AuthError) setMe("none"); else setMe("none"); });
  useEffect(() => { if (getToken()) void load(); }, []);
  if (h.startsWith("invite/")) return <Invite token={h.slice(7)} onIn={() => void load()} />;
  if (me === "none") return <Login onIn={() => void load()} />;
  if (!me) return <p className="muted">Загрузка…</p>;
  const out = async () => { try { await api("POST", "/api/auth/logout"); } catch { /* уже вышли */ } setToken(""); setMe("none"); };
  const owner = me.user.role === "owner";
  let page: ReactNode;
  if (h === "password") page = <Password />;
  else if (!owner) page = me.user.role === "admin" ? <Company /> : <div className="card narrow"><p>Работа ведётся в панели «Конструктора ИД» в Excel. Консоль нужна администратору компании.</p></div>;
  else if (h.startsWith("tenant/")) page = <Tenant tid={h.slice(7)} tariffs={tariffs} />;
  else if (h === "tariffs") page = <Tariffs list={tariffs} reload={() => void api("GET", "/api/owner/tariffs").then(setTariffs)} />;
  else if (h === "audit") page = <Audit />;
  else page = <Tenants />;
  return <Shell me={me} onOut={() => void out()}>{page}</Shell>;
}

createRoot(document.getElementById("root")!).render(<App />);
