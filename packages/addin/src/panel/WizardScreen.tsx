// План 17: мастер первого акта — 5 шагов: объект → участники → шифр → материалы → акт → «Печать АОСР».
// Пишет в те же листы, что заполняются вручную; организации, представители и материалы можно взять из библиотеки.
import { useContext, useEffect, useState, type ReactNode } from "react";
import { WIZARD_STEPS, ORG_ROLES, emptyWizard, stepErrors, type WizardData, type WizOrg, type OrgRole } from "@idk/shared/wizard";
import { ROLE_BOOK_LABELS } from "@idk/shared/workbook/schema";
import { ROLE_CODES, type RoleCode } from "@idk/shared/roles";
import { readBook } from "@idk/shared/workbook/records";
import { cellText } from "@idk/shared/workbook/values";
import type { LibRecord } from "@idk/shared/library/model";
import type { Issue } from "@idk/shared/workbook/bundle";
import type { ExcelPort } from "../book/excelPort.ts";
import type { BookState } from "./useBook.ts";
import { libraryApi } from "./libraryApi.ts";
import { createAct } from "./wizard.ts";
import { printAct } from "./print.ts";
import { PrintOptionsContext, TemplateContext } from "./templateContext.ts";

const t = (r: LibRecord, k: string) => cellText(r.values[k] ?? null);

function F({ label, err, children }: { label: string; err?: string; children: ReactNode }) {
  return (
    <label className={`field${err ? " field-error" : ""}`}>
      <span className="field-label">{label}{err && <span className="error"> — {err}</span>}</span>
      {children}
    </label>
  );
}

export function WizardScreen({ port, state, onClose }: { port: ExcelPort; state: BookState; onClose(): void }) {
  const [d, setD] = useState<WizardData>(emptyWizard);
  const [step, setStep] = useState(0);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ issues: Issue[] } | null>(null);
  const [error, setError] = useState("");
  const [lib, setLib] = useState<{ org: LibRecord[]; rep: LibRecord[]; material: LibRecord[] }>({ org: [], rep: [], material: [] });
  const template = useContext(TemplateContext);
  const options = useContext(PrintOptionsContext);

  // Библиотека — подсказки в полях; нет сервера или папки — мастер работает без них.
  useEffect(() => {
    void Promise.all([libraryApi.list("org"), libraryApi.list("rep"), libraryApi.list("material")])
      .then(([org, rep, material]) => setLib({ org, rep, material })).catch(() => undefined);
  }, []);

  const set = (fn: (x: WizardData) => void) => setD((prev) => { const n = structuredClone(prev); fn(n); return n; });
  const e = (k: string) => errs[k];

  const pickOrg = (role: OrgRole, name: string) => set((x) => {
    x.orgs[role].shortName = name;
    const r = lib.org.find((o) => t(o, "shortName") === name);
    if (r) x.orgs[role] = { shortName: name, fullName: t(r, "fullName"), inn: t(r, "inn"), ogrn: t(r, "ogrn"), address: t(r, "address") };
  });
  const pickRep = (i: number, name: string) => set((x) => {
    x.reps[i].fullName = name;
    const r = lib.rep.find((o) => t(o, "fullName") === name);
    if (r) Object.assign(x.reps[i], { position: t(r, "position"), org: t(r, "org"), authorityDoc: t(r, "authorityDoc"), nrsNumber: t(r, "nrsNumber") });
  });
  const pickMat = (i: number, name: string) => set((x) => {
    x.materials[i].name = name;
    const r = lib.material.find((o) => t(o, "name") === name);
    if (r) Object.assign(x.materials[i], { mark: t(r, "mark"), unit: t(r, "unit"), manufacturer: t(r, "manufacturer") });
  });

  const next = () => {
    const found = stepErrors(step, d, state.book ?? undefined);
    setErrs(found);
    if (!Object.keys(found).length) { setStep(step + 1); scrollTo?.(0, 0); }
  };

  const create = async () => {
    setBusy(true); setError("");
    try {
      const r = await createAct(port, d, state.important);
      if (Object.keys(r.fieldErrors).length) {
        setErrs(r.fieldErrors);
        const first = WIZARD_STEPS.findIndex((_, i) => Object.keys(stepErrors(i, d, state.book ?? undefined)).length);
        if (first >= 0) setStep(first);
        return;
      }
      setDone({ issues: r.issues });
      state.refresh();
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const print = async () => {
    setBusy(true); setError("");
    try {
      const issues = await printAct(await readBook(port), d.act.number.trim(), state.important, "aosr", template, options);
      if (issues.length) setDone({ issues });
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const orgFields = (role: OrgRole, o: WizOrg) => (
    <>
      <F label="Краткое наименование" err={e(`orgs.${role}.shortName`)}>
        <input list="wiz-orgs" value={o.shortName} onChange={(x) => pickOrg(role, x.target.value)} />
      </F>
      <F label="Полное наименование" err={e(`orgs.${role}.fullName`)}><input value={o.fullName} onChange={(x) => set((w) => { w.orgs[role].fullName = x.target.value; })} /></F>
      <div className="wiz-pair">
        <F label="ИНН" err={e(`orgs.${role}.inn`)}><input value={o.inn} onChange={(x) => set((w) => { w.orgs[role].inn = x.target.value; })} /></F>
        <F label="ОГРН" err={e(`orgs.${role}.ogrn`)}><input value={o.ogrn} onChange={(x) => set((w) => { w.orgs[role].ogrn = x.target.value; })} /></F>
      </div>
      <F label="Адрес" err={e(`orgs.${role}.address`)}><input value={o.address} onChange={(x) => set((w) => { w.orgs[role].address = x.target.value; })} /></F>
    </>
  );
  const orgNames = [...new Set(ORG_ROLES.map((r) => d.orgs[r.key].shortName.trim()).filter(Boolean))];

  if (done) {
    return (
      <main className="content wizard">
        <h2 className="app-title">Акт {d.act.number} создан</h2>
        {done.issues.length ? (
          <>
            <p className="error">Перед печатью исправьте в книге:</p>
            <ul className="issues">{done.issues.map((i, n) => <li key={n}>{i.table}{i.row !== null ? `, строка ${i.row + 1}` : ""}: «{i.column}» — {i.message}</li>)}</ul>
          </>
        ) : <p className="notice">Строки записаны на листы «Реквизиты», «Представители», «Материалы» и «База актов»; материалы акта — в карточке акта. Дальше книга ведётся как обычно.</p>}
        <div className="row-actions">
          <button className="btn btn-primary" disabled={busy} onClick={() => void print()}>Печать АОСР</button>
          <button className="btn" onClick={onClose}>Готово</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </main>
    );
  }

  return (
    <main className="content wizard">
      <h2 className="app-title">Мастер первого акта</h2>
      <ol className="wiz-steps" aria-label="Шаги">
        {WIZARD_STEPS.map((s, i) => <li key={s} className={i === step ? "wiz-cur" : i < step ? "wiz-done" : ""}>{s}</li>)}
      </ol>
      <datalist id="wiz-orgs">{lib.org.map((o) => <option key={o.id} value={t(o, "shortName")} />)}</datalist>
      <datalist id="wiz-reps">{lib.rep.map((o) => <option key={o.id} value={t(o, "fullName")}>{t(o, "position")}</option>)}</datalist>
      <datalist id="wiz-mats">{lib.material.map((o) => <option key={o.id} value={t(o, "name")}>{t(o, "mark")}</option>)}</datalist>
      <datalist id="wiz-org-names">{orgNames.map((n) => <option key={n} value={n} />)}</datalist>

      {step === 0 && (
        <div className="wiz-form">
          <F label="Наименование объекта" err={e("object.name")}><textarea rows={2} value={d.object.name} onChange={(x) => set((w) => { w.object.name = x.target.value; })} /></F>
          <F label="Адрес"><input value={d.object.address} onChange={(x) => set((w) => { w.object.address = x.target.value; })} /></F>
          <F label="Город"><input value={d.object.city} onChange={(x) => set((w) => { w.object.city = x.target.value; })} /></F>
        </div>
      )}

      {step === 1 && (
        <div className="wiz-form">
          <p className="muted">Организации по ролям АОСР. Начните вводить наименование — подставятся данные из библиотеки.</p>
          {ORG_ROLES.map((r) => (
            <fieldset key={r.key}><legend>{r.label}{r.key === "performer" ? " (если не генподрядчик)" : ""}</legend>{orgFields(r.key, d.orgs[r.key])}</fieldset>
          ))}
          <h3 className="tools-title">Представители {e("reps") && <span className="error">— {e("reps")}</span>}</h3>
          {d.reps.map((rp, i) => (
            <fieldset key={i}>
              <legend>
                <select aria-label="Роль" value={rp.role} onChange={(x) => set((w) => { w.reps[i].role = x.target.value as RoleCode; })}>
                  {ROLE_CODES.map((c) => <option key={c} value={c}>{ROLE_BOOK_LABELS[c]}</option>)}
                </select>
              </legend>
              <F label="ФИО"><input list="wiz-reps" value={rp.fullName} onChange={(x) => pickRep(i, x.target.value)} /></F>
              <F label="Должность" err={e(`reps.${i}.position`)}><input value={rp.position} onChange={(x) => set((w) => { w.reps[i].position = x.target.value; })} /></F>
              <F label="Организация" err={e(`reps.${i}.org`)}><input list="wiz-org-names" value={rp.org} onChange={(x) => set((w) => { w.reps[i].org = x.target.value; })} /></F>
              <F label="Документ о полномочиях" err={e(`reps.${i}.authorityDoc`)}><input value={rp.authorityDoc} onChange={(x) => set((w) => { w.reps[i].authorityDoc = x.target.value; })} /></F>
              <F label="НРС №"><input value={rp.nrsNumber} onChange={(x) => set((w) => { w.reps[i].nrsNumber = x.target.value; })} /></F>
            </fieldset>
          ))}
          <button className="btn" onClick={() => set((w) => { w.reps.push({ role: "other", fullName: "", position: "", org: "", authorityDoc: "", nrsNumber: "" }); })}>+ представитель</button>
        </div>
      )}

      {step === 2 && (
        <div className="wiz-form">
          <F label="Шифр раздела проекта" err={e("section.code")}><input value={d.section.code} onChange={(x) => set((w) => { w.section.code = x.target.value; })} /></F>
          <F label="Наименование раздела"><textarea rows={2} value={d.section.name} onChange={(x) => set((w) => { w.section.name = x.target.value; })} /></F>
          <p className="muted">Проектировщик раздела — «{d.orgs.designer.shortName}».</p>
        </div>
      )}

      {step === 3 && (
        <div className="wiz-form">
          {e("materials") && <p className="error">{e("materials")}</p>}
          {d.materials.map((m, i) => (
            <fieldset key={i}>
              <legend>Материал {i + 1}</legend>
              <F label="Наименование" err={e(`materials.${i}.name`)}><input list="wiz-mats" value={m.name} onChange={(x) => pickMat(i, x.target.value)} /></F>
              <div className="wiz-pair">
                <F label="Марка"><input value={m.mark} onChange={(x) => set((w) => { w.materials[i].mark = x.target.value; })} /></F>
                <F label="Ед. изм." err={e(`materials.${i}.unit`)}><input value={m.unit} onChange={(x) => set((w) => { w.materials[i].unit = x.target.value; })} /></F>
              </div>
              <div className="wiz-pair">
                <F label="Завод-изготовитель" err={e(`materials.${i}.manufacturer`)}><input value={m.manufacturer} onChange={(x) => set((w) => { w.materials[i].manufacturer = x.target.value; })} /></F>
                <F label="Кол-во в акте" err={e(`materials.${i}.quantity`)}><input inputMode="decimal" value={m.quantity} onChange={(x) => set((w) => { w.materials[i].quantity = x.target.value; })} /></F>
              </div>
            </fieldset>
          ))}
          <button className="btn" onClick={() => set((w) => { w.materials.push({ name: "", mark: "", unit: "", manufacturer: "", quantity: "" }); })}>+ материал</button>
          <p className="muted">Документы качества материалов из библиотеки можно добавить потом: «Библиотека» → «Добавить в книгу».</p>
        </div>
      )}

      {step === 4 && (
        <div className="wiz-form">
          <div className="wiz-pair">
            <F label="Номер акта" err={e("act.number")}><input value={d.act.number} onChange={(x) => set((w) => { w.act.number = x.target.value; })} /></F>
            <F label="Дата акта" err={e("act.date")}><input type="date" value={d.act.date} onChange={(x) => set((w) => { w.act.date = x.target.value; })} /></F>
          </div>
          <F label="Работы (п.1)" err={e("act.works")}><textarea rows={3} value={d.act.works} onChange={(x) => set((w) => { w.act.works = x.target.value; })} /></F>
          <div className="wiz-pair">
            <F label="Начало работ" err={e("act.dateStart")}><input type="date" value={d.act.dateStart} onChange={(x) => set((w) => { w.act.dateStart = x.target.value; })} /></F>
            <F label="Окончание работ" err={e("act.dateEnd")}><input type="date" value={d.act.dateEnd} onChange={(x) => set((w) => { w.act.dateEnd = x.target.value; })} /></F>
          </div>
          <F label="Нормативы (п.6)" err={e("act.normative")}><textarea rows={2} value={d.act.normative} onChange={(x) => set((w) => { w.act.normative = x.target.value; })} /></F>
          <F label="Разрешается (п.7)" err={e("act.nextWorks")}><textarea rows={2} value={d.act.nextWorks} onChange={(x) => set((w) => { w.act.nextWorks = x.target.value; })} /></F>
        </div>
      )}

      <div className="row-actions wiz-nav">
        {step > 0 && <button className="btn" onClick={() => { setErrs({}); setStep(step - 1); scrollTo?.(0, 0); }}>Назад</button>}
        {step < WIZARD_STEPS.length - 1
          ? <button className="btn btn-primary" onClick={next}>Далее</button>
          : <button className="btn btn-primary" disabled={busy || !state.book} onClick={() => void create()}>Создать акт</button>}
        <button className="btn" onClick={onClose}>Закрыть</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
