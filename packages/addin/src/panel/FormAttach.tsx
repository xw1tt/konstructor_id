// План 20: вложение формы заказчика в чат помощника; после применения — проверка и сохранение формы в шаблон.
import { useContext, useEffect, useReducer, useState } from "react";
import { docLabel, isBuiltinTemplate } from "@idk/shared/forms/template";
import { UserTemplateContext } from "./templateContext.ts";
import { apiSend } from "../api.ts";
import { createTemplate, saveTemplateDocs, type TemplateDoc } from "./templatesApi.ts";
import type { FormKit } from "./kits.ts";

const toBase64 = async (f: File) => {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export function FormAttach({ kit, onChoose }: { kit: FormKit; onChoose(id: string): void }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const tpl = useContext(UserTemplateContext);
  const t = tpl.template;
  const [doc, setDoc] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => kit.on(rerender), [kit]);
  const r = kit.ready;

  const save = async () => {
    if (!r) return;
    setMsg(null);
    try {
      // Встроенный шаблон не меняется — форма уходит в копию (как в «Редакторе шаблонов»).
      const target = isBuiltinTemplate(t.id) ? await createTemplate(`${t.name} (копия)`, t.id) : t;
      const form = await apiSend<TemplateDoc["form"]>("POST", `/api/templates/${target.id}/markup/${r.token}`, { choices: r.choices });
      await saveTemplateDocs({ ...target, docs: target.docs.map((d, k) => (k === doc ? { ...d, form } : d)) });
      tpl.reload();
      if (target.id !== t.id) onChoose(target.id);
      setMsg({ ok: true, text: `Форма сохранена для «${docLabel(target.docs[doc])}» в шаблоне «${target.name}»${target.id !== t.id ? " (копия выбрана для книги)" : ""}.` });
      kit.attach(null);
      rerender();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <div className="as-form">
      <div className="row-actions">
        <label className="btn" title="Заполненный документ заказчика (.docx или .xlsx) — помощник сделает из него форму с метками">
          Файл формы…
          <input type="file" accept=".docx,.xlsx" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            kit.attach({ name: f.name, base64: await toBase64(f) });
            setMsg(null);
            rerender();
          }} />
        </label>
        {kit.file && <span className="muted">Приложен: {kit.file.name} <button className="btn btn-icon" aria-label="Убрать файл" onClick={() => { kit.attach(null); rerender(); }}>×</button></span>}
      </div>
      {r && (
        <div className="as-card">
          <p>Форма «{r.name}» размечена.{r.missing.length ? ` Не найдено в документе: ${r.missing.join("; ")}.` : ""}</p>
          <div className="row-actions">
            <a className="btn" href={`/api/templates/${t.id}/markup/${r.token}?choices=${encodeURIComponent(JSON.stringify(r.choices))}`} download>Скачать для проверки</a>
          </div>
          <div className="row-actions">
            <select aria-label="Документ шаблона" value={doc} onChange={(e) => setDoc(Number(e.target.value))}>
              {t.docs.map((d, k) => <option key={k} value={k}>{docLabel(d)}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => void save()}>Сохранить как форму</button>
          </div>
        </div>
      )}
      {msg && <p className={msg.ok ? "notice" : "error"}>{msg.text}</p>}
    </div>
  );
}
