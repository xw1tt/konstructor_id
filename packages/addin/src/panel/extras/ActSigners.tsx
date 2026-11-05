// 0.30: подписанты акта в карточке акта. По каждой роли — представители книги; отмеченные подписывают все документы
// акта (АОСР, РИМ, ВД, ВОР, АВК, КЖ, протоколы) и попадают в ОЖР. Роль без ручного выбора — по датам «Действует с/по».
import { useState } from "react";
import { ROLE_CODES, type RoleCode } from "@idk/shared/roles";
import { roleFromBook, ROLE_BOOK_LABELS } from "@idk/shared/workbook/schema";
import { cellText, joinRefs, parseDateCell, splitRefs } from "@idk/shared/workbook/values";
import type { ExcelPort } from "../../book/excelPort.ts";
import type { BookState } from "../useBook.ts";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const iso = (v: unknown) => { const p = parseDateCell((v ?? null) as any); return p.ok ? p.value : null; };

interface Person { name: string; position: string; active: boolean }

export function ActSigners({ port, state, act }: { port: ExcelPort; state: BookState; act: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const book = state.book;
  const row = book?.tables["Акты"]?.find((r) => cellText(r.v.baseNumber) === act);
  if (!book || !row) return null;
  const date = iso(row.v.date);
  const chosen = splitRefs(row.v.signers ?? null);
  const chosenSet = new Set(chosen.map(norm));

  // Люди по ролям (одно ФИО — один раз; «действует» — хоть одна его строка действует на дату акта).
  const byRole = new Map<RoleCode, Person[]>();
  for (const r of book.tables["Представители"] ?? []) {
    const role = roleFromBook(cellText(r.v.role));
    const name = cellText(r.v.fullName);
    if (!role || !name) continue;
    const f = iso(r.v.validFrom), t = iso(r.v.validTo);
    const active = !date || ((!f || f <= date) && (!t || date <= t));
    const list = byRole.get(role) ?? [];
    const same = list.find((p) => norm(p.name) === norm(name));
    if (same) same.active ||= active;
    else list.push({ name, position: cellText(r.v.position), active });
    byRole.set(role, list);
  }
  const roles = ROLE_CODES.filter((r) => byRole.has(r));
  const manual = (role: RoleCode) => (byRole.get(role) ?? []).some((p) => chosenSet.has(norm(p.name)));
  const signs = (role: RoleCode) => (byRole.get(role) ?? []).filter((p) => (manual(role) ? chosenSet.has(norm(p.name)) : p.active));
  const anyManual = roles.some(manual);

  const save = async (names: string[]) => {
    setBusy(true); setError("");
    try {
      await port.write("Акты", row.row, { "Подписанты": names.length ? joinRefs([...new Set(names)]) : null });
      state.refresh();
    } catch (e) {
      setError(state.outdated
        ? "В книге нет столбца «Подписанты» — нажмите «Обновить разметку» в «Настройках»."
        : (e as Error).message);
    } finally { setBusy(false); }
  };
  /** Отметка по роли: роль «по датам» сначала принимает текущих подписантов, затем меняется отметка. */
  const toggle = (role: RoleCode, p: Person, on: boolean) => {
    const own = new Set((byRole.get(role) ?? []).map((x) => norm(x.name)));
    const others = chosen.filter((n) => !own.has(norm(n)));
    const base = signs(role).map((x) => x.name);
    const next = on ? [...base, p.name] : base.filter((n) => norm(n) !== norm(p.name));
    // Сняли всех — роль возвращается «по датам».
    void save([...others, ...next]);
  };
  const reset = (role: RoleCode) => {
    const own = new Set((byRole.get(role) ?? []).map((x) => norm(x.name)));
    void save(chosen.filter((n) => !own.has(norm(n))));
  };

  const summary = roles.map((r) => signs(r).map((p) => p.name).join(", ") || "—").join("; ");
  return (
    <div className="setting">
      <h3 className="tools-title">
        <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          Подписанты {open ? "▴" : "▾"}
        </button>
        <span className="muted" style={{ fontWeight: "normal" }}> · {anyManual ? "выбраны вручную" : "по датам полномочий"}</span>
      </h3>
      {!open && <p className="muted" style={{ marginTop: 0 }}>{summary}</p>}
      {open && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Отметьте, кто подписывает этот акт. Выбор действует на все документы акта и на ОЖР. Роль без отметок —
            по датам «Действует с/по» в «Представителях».
          </p>
          {roles.map((role) => (
            <div key={role} style={{ marginBottom: 6 }}>
              <b>{ROLE_BOOK_LABELS[role]}</b>
              <span className="muted"> · {manual(role) ? "вручную" : "по датам"}</span>
              {manual(role) && <button className="btn btn-small" style={{ marginLeft: 6 }} disabled={busy} onClick={() => reset(role)}>по датам</button>}
              {(byRole.get(role) ?? []).map((p) => {
                const on = signs(role).includes(p);
                return (
                  <label key={p.name} className="check" style={{ display: "block" }}>
                    <input type="checkbox" disabled={busy} checked={on} onChange={(e) => toggle(role, p, e.target.checked)} />
                    {" "}{p.name}<span className="muted"> — {p.position}</span>
                    {!p.active && <span className={on ? "warn" : "muted"}> · полномочия на дату акта не действуют</span>}
                  </label>
                );
              })}
            </div>
          ))}
          {!roles.length && <p className="warn">В «Представителях» нет никого с ролью.</p>}
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
