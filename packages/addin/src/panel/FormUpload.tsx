// 0.34: «Загрузить форму заказчика» — один шаг вместо пяти. Пользователь выбирает заполненный документ Word/Excel;
// программа сама узнаёт, что это за документ (АОСР, ВД, протокол… или свой — с названием и кодом), находит акт книги,
// по которому он заполнен (больше совпавших значений), ставит метки и задаёт вопросы только о неоднозначных местах.
// «Сохранить» прикрепляет форму к документу шаблона (встроенному — вместо встроенной формы; свой — добавляется).
import { useEffect, useState } from "react";
import { BUILTIN_DOC_LABELS, isBuiltinTemplate, type TemplateDoc, type UserTemplate } from "@idk/shared/forms/template";
import { PRINT_KINDS, type PrintKind } from "@idk/shared/acts/schemas";
import { cellText } from "@idk/shared/workbook/values";
import { apiGet, apiSend } from "../api.ts";
import { bundleFor } from "./print.ts";
import { createTemplate, saveTemplateDocs } from "./templatesApi.ts";
import type { BookState } from "./useBook.ts";

interface Guess {
  type: "docx" | "xlsx";
  kind: PrintKind | null;
  title: string;
  name: string;
  code: string;
}
interface Place {
  id: number;
  text: string;
  context: string;
  options: string[];
  chosen: string;
}
interface Result {
  token: string;
  act: string;
  found: number;
  ambiguous: Place[];
  byAct: { act: string; found: number }[];
}

const toBase64 = async (f: File) => {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
/** Сколько актов перебирается при поиске акта образца (последние в книге). */
const MAX_ACTS = 40;

export function FormUpload({
  t,
  state,
  onTemplate,
  onDone,
}: {
  t: UserTemplate;
  state: BookState;
  /** Встроенный шаблон не меняется: работа идёт в его копии — её нужно выбрать в редакторе. */
  onTemplate(id: string): void;
  onDone(text: string, error?: boolean): void;
}) {
  const [busy, setBusy] = useState("");
  const [file, setFile] = useState<{ b64: string; name: string } | null>(null);
  const [tid, setTid] = useState(t.id);
  const [guess, setGuess] = useState<Guess | null>(null);
  const [kind, setKind] = useState<PrintKind | "">("");
  const [own, setOwn] = useState({ name: "", code: "" });
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState("");

  const reset = () => {
    setFile(null);
    setGuess(null);
    setRes(null);
    setErr("");
  };
  // Пользователь выбрал в редакторе другой шаблон — незаконченная загрузка сбрасывается.
  useEffect(() => {
    if (t.id !== tid && !busy) {
      setTid(t.id);
      reset();
    }
  }, [t.id]);

  /** Разметка по актам книги для выбранного вида документа. */
  const recognize = async (f: { b64: string; name: string }, id: string, k: PrintKind | "", code: string) => {
    const book = state.book;
    if (!book) return;
    const acts = (book.tables["Акты"] ?? []).map((r) => cellText(r.v.baseNumber)).filter(Boolean);
    const bundles = acts
      .slice(-MAX_ACTS)
      .map((act) => ({ act, bundle: bundleFor(book, act, {}, k || null).bundle }))
      .filter((x) => x.bundle);
    if (!bundles.length)
      throw new Error(
        acts.length
          ? "Ни один акт книги ещё не собирается (не заполнены реквизиты объекта или ссылки) — заполните книгу и загрузите форму снова"
          : "В книге нет актов: форма размечается по значениям акта, которым заполнен образец",
      );
    setBusy(`Ищу акт образца среди ${bundles.length}…`);
    const r = await apiSend<Result>("POST", `/api/templates/${id}/recognize`, { file: f.b64, name: f.name, code: k ? undefined : code, bundles });
    setRes(r);
  };

  const pick = async (input: File | undefined) => {
    if (!input) return;
    reset();
    setBusy("Читаю документ…");
    try {
      let id = tid;
      if (isBuiltinTemplate(t.id) && id === t.id) {
        const copy = await createTemplate(`${t.name} (свои формы)`, t.id);
        id = copy.id;
        setTid(id);
        onTemplate(id);
      }
      const f = { b64: await toBase64(input), name: input.name };
      setFile(f);
      const g = await apiSend<Guess>("POST", `/api/templates/${id}/recognize/detect`, { file: f.b64 });
      setGuess(g);
      setKind(g.kind ?? "");
      setOwn({ name: g.name, code: g.code });
      await recognize(f, id, g.kind ?? "", g.code);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const changeKind = async (k: PrintKind | "") => {
    setKind(k);
    if (!file) return;
    setBusy("Размечаю заново…");
    setErr("");
    try {
      await recognize(file, tid, k, own.code);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    if (!res || !file) return;
    if (!kind && (!own.name.trim() || !own.code.trim())) {
      setErr("Укажите название и код своего документа");
      return;
    }
    setBusy("Сохраняю…");
    try {
      const choices = Object.fromEntries(res.ambiguous.map((a) => [a.id, a.chosen]));
      const form = await apiSend<TemplateDoc["form"]>("POST", `/api/templates/${tid}/markup/${res.token}`, { choices });
      const list = await apiGet<UserTemplate[]>("/api/templates");
      const cur = list.find((x) => x.id === tid) ?? t;
      let docs: TemplateDoc[];
      let label: string;
      if (kind) {
        label = BUILTIN_DOC_LABELS[kind];
        docs = cur.docs.some((d) => d.kind === "builtin" && d.doc === kind)
          ? cur.docs.map((d) => (d.kind === "builtin" && d.doc === kind ? { ...d, form } : d))
          : [...cur.docs, { kind: "builtin", doc: kind, form }];
      } else {
        label = own.name.trim();
        docs = [...cur.docs, { kind: "custom", name: own.name.trim(), code: own.code.trim(), form }];
      }
      await saveTemplateDocs({ ...cur, docs });
      onTemplate(tid);
      onDone(
        `Форма «${label}» сохранена: меток ${res.found}${res.ambiguous.length ? `, уточнено мест ${res.ambiguous.length}` : ""}. Печать — кнопкой «${label}» в карточке акта (значок ✎).`,
      );
      reset();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const sorted = res ? [...res.byAct].sort((a, b) => b.found - a.found) : [];
  const weak = res && (res.found < 3 || (sorted[1] && sorted[1].found === res.found));

  return (
    <div className="setting form-upload">
      <h3 className="tools-title">Загрузить форму заказчика</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Выберите заполненный документ заказчика (Word или Excel). Программа сама поймёт, что это за документ и по какому акту он заполнен, поставит метки вместо
        значений и спросит только о спорных местах.
      </p>
      <label className="btn">
        {busy || "Выбрать файл…"}
        <input
          type="file"
          accept=".docx,.xlsx"
          hidden
          disabled={!!busy}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
      {guess && (
        <div className="form-upload-result">
          <label className="setting-option">
            Это{" "}
            <select aria-label="Вид документа" value={kind} disabled={!!busy} onChange={(e) => void changeKind(e.target.value as PrintKind | "")}>
              <option value="">свой документ</option>
              {PRINT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {BUILTIN_DOC_LABELS[k]}
                </option>
              ))}
            </select>
            {guess.title && <span className="muted"> — по заголовку «{guess.title}»</span>}
          </label>
          {!kind && (
            <div className="row-actions">
              <input aria-label="Название документа" placeholder="Название" value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} />
              <input aria-label="Код документа" placeholder="Код" size={8} value={own.code} onChange={(e) => setOwn({ ...own, code: e.target.value })} />
            </div>
          )}
          {res && (
            <>
              <p>
                Заполнен по акту <b>{res.act}</b>: меток {res.found}
                {res.ambiguous.length ? `, спорных мест ${res.ambiguous.length} — выберите поле` : ""}.
              </p>
              {weak && (
                <p className="warn">
                  {res.found < 3
                    ? "Совпало мало значений: возможно, образец заполнен по акту, которого нет в книге. Метки можно поставить вручную в файле («Скачать для проверки»)."
                    : `Акты ${sorted[0].act} и ${sorted[1].act} совпали одинаково — проверьте метки дат и номеров.`}
                </p>
              )}
              {res.ambiguous.map((a) => (
                <label key={a.id} className="setting-option">
                  <span className="muted">…{a.context}…</span>
                  <select
                    value={a.chosen}
                    onChange={(e) => setRes({ ...res, ambiguous: res.ambiguous.map((x) => (x.id === a.id ? { ...x, chosen: e.target.value } : x)) })}
                  >
                    {a.options.map((o) => (
                      <option key={o} value={o}>{`{${o}}`}</option>
                    ))}
                  </select>
                </label>
              ))}
              <div className="row-actions">
                <button className="btn btn-primary" disabled={!!busy} onClick={() => void save()}>
                  Сохранить форму
                </button>
                <a
                  className="btn"
                  href={`/api/templates/${tid}/markup/${res.token}?choices=${encodeURIComponent(JSON.stringify(Object.fromEntries(res.ambiguous.map((a) => [a.id, a.chosen]))))}`}
                  download
                >
                  Скачать для проверки
                </a>
                <button className="btn" onClick={reset}>
                  Отмена
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
