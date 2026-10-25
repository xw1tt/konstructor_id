// Редактор шаблонов: имя, документы (встроенные и свои), форма каждого документа — встроенная или своя .docx/.xlsx,
// загрузка формы, разметка по заполненному образцу, выгрузка/загрузка шаблона. Шаблоны хранятся на компьютере (сервер).
import { useContext, useState } from "react";
import { BUILTIN_SBD, BUILTIN_DOC_LABELS, SBD_ID, docLabel, validateTemplate, isBuiltinTemplate, type TemplateDoc, type UserTemplate } from "@idk/shared/forms/template";
import { FORM_SETS, FORM_SET_LABELS, type FormDoc, type FormSet } from "@idk/shared/templates";
import { PRINT_KINDS, type PrintKind } from "@idk/shared/acts/schemas";
import { isProtoKind } from "@idk/shared/protocols/defs";
import { cellText } from "@idk/shared/workbook/values";
import { apiSend } from "../api.ts";
import { useGuard } from "../server.tsx";
import type { BookState } from "./useBook.ts";
import { UserTemplateContext } from "./templateContext.ts";
import { createTemplate, deleteTemplate, saveTemplateDocs, uploadForm, importTemplate, applyChange, withFormSet, withDocForm, withReserve } from "./templatesApi.ts";
import { bundleFor } from "./print.ts";
import { CatalogContext } from "./catalogApi.ts";
import { CatalogPicker } from "./CatalogPicker.tsx";

interface Markup { token: string; found: number; ambiguous: { id: number; text: string; context: string; options: string[]; chosen: string }[]; doc: number; name: string }

const toBase64 = async (f: File) => {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export function TemplateEditor({ state, onChoose }: { state: BookState; onChoose(id: string): void }) {
  const ctx = useContext(UserTemplateContext);
  const catalog = useContext(CatalogContext);
  const [picker, setPicker] = useState(false);
  const guard = useGuard();
  const [editId, setEditId] = useState(ctx.template.id);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [newName, setNewName] = useState("");
  const [custom, setCustom] = useState({ name: "", code: "" });
  const [markupAct, setMarkupAct] = useState("");
  const [markup, setMarkup] = useState<Markup | null>(null);
  /** Подтверждение необратимого: удаление шаблона (со всеми формами) или документа шаблона. */
  const [confirm, setConfirm] = useState<{ text: string; run(): void } | null>(null);
  const t = ctx.list.find((x) => x.id === editId) ?? BUILTIN_SBD;
  const readOnly = isBuiltinTemplate(t.id);
  const acts = (state.book?.tables["Акты"] ?? []).map((r) => cellText(r.v.baseNumber)).filter(Boolean);
  const fail = (text: string) => setNote({ text, error: true });
  const ok = (text: string) => setNote({ text });

  const save = async (docs: TemplateDoc[], name = t.name, print = t.print) => {
    const next: UserTemplate = { ...t, name, docs, print };
    const errors = validateTemplate(next);
    if (errors.length) { fail(errors[0]); return false; }
    const r = await guard(saveTemplateDocs(next), fail);
    if (r) { ctx.reload(); ok("Сохранено"); }
    return !!r;
  };

  const create = async (from?: string) => {
    const name = newName.trim() || (from ? `${t.name} (копия)` : "Новый шаблон");
    const r = await guard(createTemplate(name, from), fail);
    if (r) { setNewName(""); ctx.reload(); setEditId(r.id); ok(`Шаблон «${r.name}» создан`); }
  };

  /** Изменение набора и форм: у встроенного шаблона — копия с изменением (план 14). */
  const change = async (fn: (x: UserTemplate) => UserTemplate) => {
    const r = await guard(applyChange(t, fn), fail);
    if (!r) return;
    ctx.reload();
    if (r.id !== t.id) { setEditId(r.id); ok(`«${t.name}» не меняется — создана копия «${r.name}» с этой настройкой`); } else ok("Сохранено");
  };
  /** Выбор формы документа: «по набору» или конкретный набор. */
  const formSelect = (doc: FormDoc, label: string) => (
    <label className="setting-option">{label}{" "}
      <select value={t.print.forms?.[doc] ?? ""} onChange={(e) => void change((x) => withDocForm(x, doc, (e.target.value || null) as FormSet | null))}>
        <option value="">по набору ({FORM_SET_LABELS[t.print.formSet ?? "sbd"]})</option>
        {FORM_SETS.map((s) => <option key={s} value={s}>{FORM_SET_LABELS[s]}</option>)}
      </select>
    </label>
  );
  const FORM_DOC_OF: Partial<Record<PrintKind, FormDoc>> = { vd: "vd", rim: "rim", kj: "kj" };

  const remove = async () => {
    if (readOnly) return;
    if (await guard(deleteTemplate(t.id).then(() => true), fail)) { ctx.reload(); setEditId(SBD_ID); ok("Шаблон удалён"); }
  };

  /** Названия видов работ документа (по кодам справочника). */
  const workNames = (codes: string[] | undefined) => (codes ?? []).map((c) =>
    catalog?.sections.flatMap((s) => s.works).find((w) => w.code === c)?.name ?? c);
  const patch = (i: number, p: Partial<Extract<TemplateDoc, { kind: "custom" }>>) =>
    void save(t.docs.map((d, k) => (k === i && d.kind === "custom" ? { ...d, ...p } : d)));

  const builtinMissing = PRINT_KINDS.filter((k) => !t.docs.some((d) => d.kind === "builtin" && d.doc === k));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= t.docs.length) return;
    const docs = [...t.docs];
    [docs[i], docs[j]] = [docs[j], docs[i]];
    void save(docs);
  };
  const setForm = async (i: number, file: File | undefined) => {
    if (!file) return;
    const f = await guard(uploadForm(t.id, file), fail);
    if (f) await save(t.docs.map((d, k) => (k === i ? { ...d, form: f } : d)));
  };

  const startMarkup = async (i: number, file: File | undefined) => {
    if (!file || !state.book) return;
    if (!markupAct) { fail("Выберите акт, по которому заполнен образец"); return; }
    const d = t.docs[i];
    const { bundle, issues } = bundleFor(state.book, markupAct, state.important, d.kind === "builtin" ? d.doc : null);
    if (!bundle) { fail(`Акт «${markupAct}» не готов к печати: ${issues[0]?.message ?? ""}`); return; }
    const code = d.kind === "custom" ? d.code : undefined;
    const r = await guard(apiSend<Omit<Markup, "doc" | "name">>("POST", `/api/templates/${t.id}/markup`, { bundle, file: await toBase64(file), name: file.name, code }), fail);
    if (r) setMarkup({ ...r, doc: i, name: file.name });
  };
  const finishMarkup = async () => {
    if (!markup) return;
    const choices = Object.fromEntries(markup.ambiguous.map((a) => [a.id, a.chosen]));
    const f = await guard(apiSend<TemplateDoc["form"]>("POST", `/api/templates/${t.id}/markup/${markup.token}`, { choices }), fail);
    if (f && await save(t.docs.map((d, k) => (k === markup.doc ? { ...d, form: f } : d)))) {
      setMarkup(null);
      ok(`Форма по образцу сохранена: меток ${markup.found}. Проверьте её — «Скачать форму».`);
    }
  };

  return (
    <main className="content settings">
      <h2 className="app-title">Редактор шаблонов</h2>
      <p className="muted">Шаблоны хранятся на этом компьютере и доступны в любой книге. В книге запоминается выбранный шаблон.</p>
      <div className="row-actions">
        <select value={t.id} onChange={(e) => { setEditId(e.target.value); setMarkup(null); setNote(null); }} aria-label="Шаблон">
          {ctx.list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button className="btn" onClick={() => onChoose(t.id)} disabled={ctx.template.id === t.id}>{ctx.template.id === t.id ? "Выбран для книги" : "Выбрать для книги"}</button>
      </div>
      <div className="row-actions">
        <input placeholder="Имя нового шаблона" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn" onClick={() => void create()}>Новый</button>
        <button className="btn" onClick={() => void create(t.id)}>Копия</button>
      </div>
      {!readOnly && (
        <div className="row-actions">
          <input aria-label="Имя шаблона" defaultValue={t.name} key={t.id} onBlur={(e) => e.target.value.trim() !== t.name && void save(t.docs, e.target.value.trim())} />
          <a className="btn" href={`/api/templates/${t.id}/export`} download>Выгрузить</a>
          <button className="btn btn-danger" onClick={() => setConfirm({ text: `Удалить шаблон «${t.name}» вместе с его формами? Это не отменить — сначала можно «Выгрузить».`, run: () => void remove() })}>Удалить</button>
        </div>
      )}
      <div className="row-actions">
        <label className="btn">Загрузить шаблон (.idk-template)
          <input type="file" accept=".idk-template" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            const r = await guard(importTemplate(f), fail);
            if (r) { ctx.reload(); setEditId(r.id); ok(`Загружен шаблон «${r.name}»`); }
          }} />
        </label>
      </div>
      {readOnly && <p className="notice">«{t.name}» — встроенный шаблон, он не меняется. Выбор набора и форм ниже создаст копию с этой настройкой; «Копия» — просто копия.</p>}

      <h3 className="tools-title">Набор форм и нумерация</h3>
      <div className="row-actions">
        <label className="setting-option">Набор{" "}
          <select aria-label="Набор форм" value={t.print.formSet ?? "sbd"} onChange={(e) => void change((x) => withFormSet(x, e.target.value as FormSet))}>
            {FORM_SETS.map((s) => <option key={s} value={s}>{FORM_SET_LABELS[s]}</option>)}
          </select>
        </label>
        {formSelect("registry", "Реестр ИД:")}
      </div>
      <p className="muted">«СБД» — номера «акт.АОСР», «акт.РИМ»… «ТИ» — АОСР без суффикса, «акт.РМ», «акт.РП», «акт.ВД», «акт.КЖ», «акт.П».</p>

      <h3 className="tools-title">Документы шаблона</h3>
      {!readOnly && (
        <div className="row-actions">
          <button className="btn" aria-expanded={picker} onClick={() => setPicker(!picker)} disabled={!catalog}
            title={catalog ? undefined : "Справочник не загружен — запустите сервер"}>Из справочника{picker ? " ▴" : " ▾"}</button>
        </div>
      )}
      {picker && catalog && !readOnly && <CatalogPicker catalog={catalog} template={t} onApply={(next) => void save(next.docs)} />}
      <ul className="list tpl-docs">
        {t.docs.map((d, i) => (
          <li key={d.kind === "builtin" ? d.doc : d.code}>
            <div className="tpl-doc-title">
              <b>{docLabel(d)}</b>{d.kind === "custom" && <span className="muted"> · код {d.code}</span>}
              <span className="muted"> · {d.kind === "custom" && d.scan ? "скан" : `форма: ${d.form ? `своя (${d.form.original || d.form.type})` : d.kind === "builtin" ? "встроенная" : "не загружена"}`}</span>
              {d.kind === "custom" && <span className="muted"> · {d.scope === "kit" ? "на комплект" : "на акт"}</span>}
              {(d.works?.length ?? 0) > 0 && <div className="muted tpl-doc-works">Виды работ: {workNames(d.works).join("; ")}</div>}
            </div>
            {d.kind === "custom" && !readOnly && (
              <div className="row-actions">
                <label className="setting-option"><input type="checkbox" checked={!!d.scan} onChange={(e) => patch(i, { scan: e.target.checked })} /> скан (без формы)</label>
                <select aria-label="На акт или на комплект" value={d.scope ?? "act"} onChange={(e) => patch(i, { scope: e.target.value as "act" | "kit" })}>
                  <option value="act">на акт</option>
                  <option value="kit">на комплект</option>
                </select>
              </div>
            )}
            {d.kind === "builtin" && FORM_DOC_OF[d.doc] && !d.form && (
              <div className="row-actions">
                {formSelect(FORM_DOC_OF[d.doc]!, "Форма:")}
                {d.doc === "kj" && (t.print.forms?.kj ?? t.print.formSet) === "ti" && (
                  <label className="setting-option">Запас, %{" "}
                    <input type="number" min={0} max={100} step={0.5} style={{ width: "5em" }} defaultValue={t.print.kjReserve ?? 2} key={`${t.id}-res`}
                      onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== (t.print.kjReserve ?? 2)) void change((x) => withReserve(x, v)); }} />
                  </label>
                )}
              </div>
            )}
            {d.kind === "builtin" && d.doc === "aosr" && (
              <fieldset className="setting" disabled={readOnly}>
                <legend>П.4: «Исполнительная схема» перед номером схемы</legend>
                {[{ each: false, label: "Только перед первой схемой", note: "Как в образце СБД: «Исполнительная схема №1. …; №2. …»" },
                  { each: true, label: "Перед каждой схемой", note: "«Исполнительная схема №1. …; Исполнительная схема №2. …»" }].map((o) => (
                  <label key={String(o.each)} className="setting-option">
                    <input type="radio" name={`schemeEach-${t.id}`} checked={(t.print?.schemeEach ?? false) === o.each}
                      onChange={() => void save(t.docs, t.name, { ...t.print, schemeEach: o.each })} />
                    <span><b>{o.label}</b><br /><span className="muted">{o.note}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
            {!readOnly && (
              <div className="row-actions">
                <button className="btn" onClick={() => move(i, -1)} aria-label="Выше">↑</button>
                <button className="btn" onClick={() => move(i, 1)} aria-label="Ниже">↓</button>
                <label className="btn">Загрузить форму<input type="file" accept=".docx,.xlsx" hidden onChange={(e) => { void setForm(i, e.target.files?.[0]); e.target.value = ""; }} /></label>
                <label className="btn">По образцу<input type="file" accept=".docx,.xlsx" hidden onChange={(e) => { void startMarkup(i, e.target.files?.[0]); e.target.value = ""; }} /></label>
                {d.form && <a className="btn" href={`/api/templates/${t.id}/forms/${d.form.file}`} download={d.form.original || undefined}>Скачать форму</a>}
                {d.kind === "builtin" && isProtoKind(d.doc) && (
                  <a className="btn" href={`/api/forms/sample/${d.doc}`} download title="Форма с метками — откройте в Word, поправьте и загрузите кнопкой «Загрузить форму»">Образец .docx</a>
                )}
                {d.form && d.kind === "builtin" && <button className="btn" onClick={() => void save(t.docs.map((x, k) => (k === i ? { ...x, form: null } : x)))}>Встроенная</button>}
                <button className="btn btn-danger" onClick={() => setConfirm({ text: `Убрать «${docLabel(d)}» из шаблона${d.form ? " вместе с его формой" : ""}?`, run: () => void save(t.docs.filter((_, k) => k !== i)) })}>Убрать</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <>
          {builtinMissing.length > 0 && (
            <div className="row-actions">
              <span className="muted">Добавить встроенный:</span>
              {builtinMissing.map((k: PrintKind) => (
                <button key={k} className="btn" onClick={() => void save([...t.docs, { kind: "builtin", doc: k, form: null }])}>{BUILTIN_DOC_LABELS[k]}</button>
              ))}
            </div>
          )}
          <div className="row-actions">
            <input placeholder="Свой документ: название" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            <input placeholder="Код (АГИ)" size={8} value={custom.code} onChange={(e) => setCustom({ ...custom, code: e.target.value })} />
            <button className="btn" onClick={async () => {
              if (await save([...t.docs, { kind: "custom", code: custom.code.trim(), name: custom.name.trim(), form: null }])) setCustom({ name: "", code: "" });
            }}>Добавить свой документ</button>
          </div>
          <div className="row-actions">
            <label>Образец заполнен по акту{" "}
              <select value={markupAct} onChange={(e) => setMarkupAct(e.target.value)}>
                <option value="">— выберите акт —</option>
                {acts.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>
        </>
      )}
      {markup && (
        <div className="confirm" role="alertdialog" aria-label="Разметка по образцу">
          <p>«{markup.name}»: меток {markup.found}, неоднозначных мест {markup.ambiguous.length}.</p>
          {markup.ambiguous.map((a) => (
            <label key={a.id} className="setting-option">
              <span className="muted">…{a.context}…</span>
              <select value={a.chosen} onChange={(e) => setMarkup({ ...markup, ambiguous: markup.ambiguous.map((x) => (x.id === a.id ? { ...x, chosen: e.target.value } : x)) })}>
                {a.options.map((o) => <option key={o} value={o}>{`{${o}}`}</option>)}
              </select>
            </label>
          ))}
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => void finishMarkup()}>Сохранить форму</button>
            <a className="btn" href={`/api/templates/${t.id}/markup/${markup.token}`} download>Скачать для проверки</a>
            <button className="btn" onClick={() => setMarkup(null)}>Отмена</button>
          </div>
        </div>
      )}
      {confirm && (
        <div className="confirm" role="alertdialog" aria-label="Подтверждение">
          <p>{confirm.text}</p>
          <div className="row-actions">
            <button className="btn btn-danger" onClick={() => { confirm.run(); setConfirm(null); }}>Да</button>
            <button className="btn" onClick={() => setConfirm(null)}>Отмена</button>
          </div>
        </div>
      )}
      {note && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
    </main>
  );
}
