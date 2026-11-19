// 0.33: оформление встроенного документа в шаблоне — шрифт, кегли, значения, интервал, строки таблицы, поворот
// заголовков, поля, ориентация. Правки сразу видны в предпросмотре на выбранном акте; «Сохранить» — в шаблон.
import { useEffect, useRef, useState } from "react";
import { cleanStyle, describeStyle, DOC_FONTS, STYLE_PRESETS, styleLabel, type DocStyle } from "@idk/shared/docStyle";
import type { PrintKind } from "@idk/shared/acts/schemas";
import type { PrintOptions, TemplateCode } from "@idk/shared/templates";
import type { BookState } from "./useBook.ts";
import { previewJob } from "./print.ts";

type Num = "size" | "tableSize" | "headerSize" | "titleSize" | "lineHeight" | "rowHeight" | "marginTop" | "marginRight" | "marginBottom" | "marginLeft";
const NUMS: { key: Num; label: string; unit: string; step: number; min: number; max: number; hint: string }[] = [
  { key: "size", label: "Текст", unit: "пт", step: 0.5, min: 6, max: 16, hint: "10" },
  { key: "tableSize", label: "Таблица", unit: "пт", step: 0.5, min: 5, max: 14, hint: "как в образце" },
  { key: "headerSize", label: "Заголовки граф", unit: "пт", step: 0.5, min: 5, max: 14, hint: "как в образце" },
  { key: "titleSize", label: "Заголовок документа", unit: "пт", step: 0.5, min: 8, max: 20, hint: "как в образце" },
  { key: "lineHeight", label: "Интервал", unit: "", step: 0.05, min: 0.9, max: 2, hint: "1,15" },
  { key: "rowHeight", label: "Строка таблицы от", unit: "мм", step: 0.5, min: 3, max: 30, hint: "по тексту" },
];
const MARGINS: { key: Num; label: string }[] = [
  { key: "marginTop", label: "верх" },
  { key: "marginRight", label: "право" },
  { key: "marginBottom", label: "низ" },
  { key: "marginLeft", label: "лево" },
];
const tri = (v: boolean | undefined) => (v === undefined ? "" : v ? "yes" : "no");
const fromTri = (s: string) => (s === "" ? undefined : s === "yes");

export function StyleEditor({
  styleKey,
  doc,
  value,
  disabled,
  state,
  template,
  options,
  onSave,
}: {
  styleKey: string;
  doc: PrintKind;
  value: DocStyle | null;
  disabled?: boolean;
  state: BookState;
  template: TemplateCode;
  options: PrintOptions;
  onSave(v: DocStyle): Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DocStyle>(value ?? {});
  const [act, setAct] = useState("");
  const [job, setJob] = useState<{ id: string; act: string } | null>(null);
  const [note, setNote] = useState("");
  const [src, setSrc] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const saved = JSON.stringify(cleanStyle(value));
  useEffect(() => setDraft(value ?? {}), [saved]);
  const acts = (state.book?.tables["Акты"] ?? []).map((r) => String(r.v.baseNumber ?? "").trim()).filter(Boolean);
  const chosen = act || acts[0] || "";
  let clean: DocStyle = {};
  let invalid = "";
  try {
    clean = cleanStyle(draft);
  } catch {
    invalid = "Значение вне допустимых пределов";
  }
  const dirty = !invalid && JSON.stringify(clean) !== saved;
  const diff = describeStyle(invalid ? value : clean);

  // Задание печати на выбранном акте — один раз на акт; оформление меняется в адресе предпросмотра.
  // Акт не печатается (не заполнен) — пробуются следующие, пока пользователь не выбрал акт сам.
  useEffect(() => {
    if (!open || !chosen || !state.book || job?.act === chosen) return;
    let alive = true;
    setNote("");
    (async () => {
      const order = act ? [act] : acts;
      let first = "";
      for (const a of order) {
        const r = await previewJob(state.book!, a, state.important, doc, template, options);
        if (!alive) return;
        if (r.id) {
          setJob({ id: r.id, act: a });
          if (a !== chosen) setAct(a);
          return;
        }
        const i = r.issues[0];
        first ||= `Акт ${a} не печатается: ${i ? `«${i.column}» — ${i.message}` : "проверьте акт"}`;
      }
      setNote(order.length > 1 ? "Ни один акт книги ещё не печатается: заполните обязательные поля. " + first : first);
    })().catch((e: Error) => alive && setNote(e.message));
    return () => {
      alive = false;
    };
  }, [open, chosen, doc]);
  // Живой предпросмотр: адрес обновляется через 300 мс после последней правки.
  useEffect(() => {
    if (!job || invalid) return;
    const t = setTimeout(
      () => setSrc(`${location.origin}/api/print-jobs/${job.id}/${doc}?format=html&style=${encodeURIComponent(JSON.stringify(clean))}`),
      300,
    );
    return () => clearTimeout(t);
  }, [job?.id, JSON.stringify(clean)]);
  const landscape = clean.orientation === "landscape" || /^(avk|ip|kj)/.test(styleKey);
  const pageW = landscape ? 1150 : 820;
  useEffect(() => {
    const w = box.current?.clientWidth;
    if (w) setScale(Math.min(1, w / pageW));
  }, [open, pageW, src]);

  const set = (p: Partial<DocStyle>) => setDraft({ ...draft, ...p });
  const num = (k: Num) => (draft[k] === undefined ? "" : String(draft[k]));
  const setNum = (k: Num, s: string) => {
    const v = s.trim() === "" ? undefined : Number(s.replace(",", "."));
    set({ [k]: v === undefined || Number.isFinite(v) ? v : draft[k] } as Partial<DocStyle>);
  };

  return (
    <div className="style-editor">
      <button className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        Оформление{diff.length ? ` (изменено: ${diff.length})` : ""}
        {open ? " ▴" : " ▾"}
      </button>
      {open && (
        <fieldset className="setting" disabled={disabled}>
          <legend>{styleLabel(styleKey)}: шрифт, размеры, поля</legend>
          <label className="setting-option">
            Набор{" "}
            <select
              aria-label="Готовый набор оформления"
              value=""
              onChange={(e) => {
                const p = STYLE_PRESETS.find((x) => x.id === e.target.value);
                if (p) setDraft({ ...p.style });
              }}
            >
              <option value="">выбрать готовый…</option>
              {STYLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="style-grid">
            <label>
              Шрифт
              <select value={draft.font ?? ""} onChange={(e) => set({ font: (e.target.value || undefined) as DocStyle["font"] })}>
                <option value="">как в образце</option>
                {DOC_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            {NUMS.map((n) => (
              <label key={n.key}>
                {n.label}
                {n.unit ? `, ${n.unit}` : ""}
                <input
                  type="number"
                  inputMode="decimal"
                  step={n.step}
                  min={n.min}
                  max={n.max}
                  placeholder={n.hint}
                  value={num(n.key)}
                  onChange={(e) => setNum(n.key, e.target.value)}
                />
              </label>
            ))}
            <label>
              Значения жирным
              <select value={tri(draft.valueBold)} onChange={(e) => set({ valueBold: fromTri(e.target.value) })}>
                <option value="">как в образце</option>
                <option value="yes">да</option>
                <option value="no">нет</option>
              </select>
            </label>
            <label>
              Значения курсивом
              <select value={tri(draft.valueItalic)} onChange={(e) => set({ valueItalic: fromTri(e.target.value) })}>
                <option value="">как в образце</option>
                <option value="yes">да</option>
                <option value="no">нет</option>
              </select>
            </label>
            <label>
              Текст в таблице
              <select value={draft.tableAlign ?? ""} onChange={(e) => set({ tableAlign: (e.target.value || undefined) as DocStyle["tableAlign"] })}>
                <option value="">как в образце</option>
                <option value="left">влево</option>
                <option value="center">по центру</option>
              </select>
            </label>
            <label>
              Лист
              <select value={draft.orientation ?? ""} onChange={(e) => set({ orientation: (e.target.value || undefined) as DocStyle["orientation"] })}>
                <option value="">как в образце</option>
                <option value="portrait">книжный</option>
                <option value="landscape">альбомный</option>
              </select>
            </label>
          </div>
          <div className="style-margins">
            Поля, мм:
            {MARGINS.map((m) => (
              <label key={m.key}>
                {m.label}
                <input type="number" min={0} max={40} step={1} placeholder="—" value={num(m.key)} onChange={(e) => setNum(m.key, e.target.value)} />
              </label>
            ))}
          </div>
          <label className="setting-option">
            <input type="checkbox" checked={!!draft.headerRotate} onChange={(e) => set({ headerRotate: e.target.checked || undefined })} /> Повернуть заголовки
            узких граф (снизу вверх)
          </label>
          <label className="setting-option">
            <input type="checkbox" checked={draft.textAlign === "justify"} onChange={(e) => set({ textAlign: e.target.checked ? "justify" : undefined })} />{" "}
            Текст по ширине
          </label>
          {invalid && (
            <p className="error" role="alert">
              {invalid}
            </p>
          )}
          <div className="row-actions">
            <button className="btn btn-primary" disabled={!dirty} onClick={() => void onSave(clean)}>
              Сохранить
            </button>
            <button className="btn" disabled={!dirty} onClick={() => setDraft(value ?? {})}>
              Отменить правки
            </button>
            <button className="btn" disabled={!Object.keys(clean).length} onClick={() => setDraft({})}>
              Как в образце
            </button>
          </div>
          {diff.length > 0 && <p className="muted">{diff.join(", ")}</p>}
          <div className="style-preview-head">
            Предпросмотр на акте{" "}
            <select aria-label="Акт для предпросмотра" value={chosen} onChange={(e) => setAct(e.target.value)}>
              {acts.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          {!acts.length && <p className="muted">Добавьте акт в «Базу актов», чтобы увидеть документ.</p>}
          {note && <p className="warn">{note}</p>}
          <div className="style-preview" ref={box} style={{ height: Math.round((landscape ? 820 : 1160) * scale) }}>
            {src && (
              <iframe
                title="Предпросмотр документа"
                src={src}
                sandbox="allow-same-origin allow-scripts"
                style={{ width: pageW, height: landscape ? 820 : 1160, transform: `scale(${scale})`, transformOrigin: "0 0" }}
              />
            )}
          </div>
          <p className="muted">Действует на PDF и Excel всех актов книги с этим шаблоном (в Excel — шрифт, размер, поля и ориентация).</p>
        </fieldset>
      )}
    </div>
  );
}
