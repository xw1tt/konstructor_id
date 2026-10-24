// Редактор шаблонов: имя, документы (встроенные и свои), форма каждого документа — встроенная или своя .docx/.xlsx,
// загрузка формы, разметка по заполненному образцу, выгрузка/загрузка шаблона. Шаблоны хранятся на компьютере (сервер).
import { useContext, useState } from "react";
import { BUILTIN_SBD, BUILTIN_DOC_LABELS, SBD_ID, docLabel, validateTemplate, type TemplateDoc, type UserTemplate } from "@idk/shared/forms/template";
import { PRINT_KINDS, type PrintKind } from "@idk/shared/acts/schemas";
import { cellText } from "@idk/shared/workbook/values";
import { apiSend } from "../api.ts";
import { useGuard } from "../server.tsx";
import type { BookState } from "./useBook.ts";
import { UserTemplateContext } from "./templateContext.ts";
import { createTemplate, deleteTemplate, saveTemplateDocs, uploadForm, importTemplate } from "./templatesApi.ts";
import { bundleFor } from "./print.ts";

interface Markup { token: string; found: number; ambiguous: { id: number; text: string; context: string; options: string[]; chosen: string }[]; doc: number; name: string }

const toBase64 = async (f: File) => {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export function TemplateEditor({ state, onChoose }: { state: BookState; onChoose(id: string): void }) {
  const ctx = useContext(UserTemplateContext);
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
  const readOnly = t.id === SBD_ID;
  const acts = (state.book?.tables["Акты"] ?? []).map((r) => cellText(r.v.baseNumber)).filter(Boolean);
  const fail = (text: string) => setNote({ text, error: true });
  const ok = (text: string) => setNote({ text });

  const save = async (docs: TemplateDoc[], name = t.name) => {
    const next: UserTemplate = { ...t, name, docs };
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

  const remove = async () => {
    if (readOnly) return;
    if (await guard(deleteTemplate(t.id).then(() => true), fail)) { ctx.reload(); setEditId(SBD_ID); ok("Шаблон удалён"); }
  };

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
      {readOnly && <p className="notice">«СБД» — встроенный шаблон, он не меняется. Нажмите «Копия», чтобы сделать свой.</p>}

      <h3 className="tools-title">Документы шаблона</h3>
      <ul className="list tpl-docs">
        {t.docs.map((d, i) => (
          <li key={d.kind === "builtin" ? d.doc : d.code}>
            <div className="tpl-doc-title">
              <b>{docLabel(d)}</b>{d.kind === "custom" && <span className="muted"> · код {d.code}</span>}
              <span className="muted"> · форма: {d.form ? `своя (${d.form.original || d.form.type})` : d.kind === "builtin" ? "встроенная" : "не загружена"}</span>
            </div>
            {!readOnly && (
              <div className="row-actions">
                <button className="btn" onClick={() => move(i, -1)} aria-label="Выше">↑</button>
                <button className="btn" onClick={() => move(i, 1)} aria-label="Ниже">↓</button>
                <label className="btn">Загрузить форму<input type="file" accept=".docx,.xlsx" hidden onChange={(e) => { void setForm(i, e.target.files?.[0]); e.target.value = ""; }} /></label>
                <label className="btn">По образцу<input type="file" accept=".docx,.xlsx" hidden onChange={(e) => { void startMarkup(i, e.target.files?.[0]); e.target.value = ""; }} /></label>
                {d.form && <a className="btn" href={`/api/templates/${t.id}/forms/${d.form.file}`} download={d.form.original || undefined}>Скачать форму</a>}
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
