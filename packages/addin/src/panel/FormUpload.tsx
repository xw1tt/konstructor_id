// 0.34: «Загрузить формы заказчика» — один шаг вместо пяти. Пользователь выбирает заполненные документы Word/Excel
// (0.35: сразу несколько, в том числе старые .doc/.xls); по каждому программа сама узнаёт, что это за документ (АОСР,
// ВД, протокол… или свой — с названием и кодом), находит акт книги, по которому он заполнен (больше совпавших значений),
// ставит метки и задаёт вопросы только о неоднозначных местах. «Сохранить» прикрепляет форму к документу шаблона
// (встроенному — вместо встроенной формы; свой — добавляется); «Сохранить все» — все распознанные разом.
import { useEffect, useRef, useState } from "react";
import { BUILTIN_DOC_LABELS, isBuiltinTemplate, type TemplateDoc, type UserTemplate } from "@idk/shared/forms/template";
import { PRINT_KINDS, type PrintKind } from "@idk/shared/acts/schemas";
import { cellText } from "@idk/shared/workbook/values";
import { apiGet, apiSend } from "../api.ts";
import { bundleFor } from "./print.ts";
import { createTemplate, saveTemplateDocs } from "./templatesApi.ts";
import { FORM_ACCEPT, readFormFile } from "./formFile.ts";
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
interface Item {
  key: number;
  /** Исходное имя файла (до перевода .doc → .docx). */
  source: string;
  name: string;
  b64: string;
  guess: Guess | null;
  kind: PrintKind | "";
  own: { name: string; code: string };
  res: Result | null;
  busy: string;
  err: string;
  saved: string;
}

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
  const [items, setItems] = useState<Item[]>([]);
  const [tid, setTid] = useState(t.id);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const seq = useRef(0);
  const live = useRef<Item[]>([]);
  live.current = items;

  // Пользователь выбрал в редакторе другой шаблон — незаконченная загрузка сбрасывается.
  useEffect(() => {
    if (t.id !== tid && !busy) {
      setTid(t.id);
      setItems([]);
      setErr("");
    }
  }, [t.id]);

  const patch = (key: number, p: Partial<Item>) => setItems((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)));

  /** Разметка по актам книги для выбранного вида документа. */
  const recognize = async (id: string, it: Pick<Item, "key" | "b64" | "name">, k: PrintKind | "", code: string) => {
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
          : "В книге нет актов: форма размечается по значениям акта, которым заполнен образец. Перенесите акт в книгу (помощник: «Заполни книгу по этому файлу») и загрузите снова",
      );
    patch(it.key, { busy: `Ищу акт образца среди ${bundles.length}…` });
    const r = await apiSend<Result>("POST", `/api/templates/${id}/recognize`, { file: it.b64, name: it.name, code: k ? undefined : code, bundles });
    patch(it.key, { res: r });
  };

  const pick = async (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setErr("");
    setBusy("Читаю документы…");
    try {
      let id = tid;
      if (isBuiltinTemplate(t.id) && id === t.id) {
        const copy = await createTemplate(`${t.name} (свои формы)`, t.id);
        id = copy.id;
        setTid(id);
        onTemplate(id);
      }
      const fresh: Item[] = files.map((f) => ({
        key: ++seq.current,
        source: f.name,
        name: f.name,
        b64: "",
        guess: null,
        kind: "",
        own: { name: "", code: "" },
        res: null,
        busy: "В очереди…",
        err: "",
        saved: "",
      }));
      setItems((cur) => [...cur.filter((x) => !x.saved), ...fresh]);
      // По одному: перевод и разметка нагружают Word/Excel на компьютере.
      for (let i = 0; i < files.length; i++) {
        const it = fresh[i];
        try {
          patch(it.key, { busy: /\.(doc|xls)$/i.test(files[i].name) ? "Перевожу в новый формат Word/Excel…" : "Читаю…" });
          const x = await readFormFile(files[i]);
          patch(it.key, { name: x.name, b64: x.base64, busy: "Узнаю документ…" });
          const g = await apiSend<Guess>("POST", `/api/templates/${id}/recognize/detect`, { file: x.base64, name: x.name });
          patch(it.key, { guess: g, kind: g.kind ?? "", own: { name: g.name, code: g.code } });
          await recognize(id, { key: it.key, b64: x.base64, name: x.name }, g.kind ?? "", g.code);
        } catch (e) {
          patch(it.key, { err: (e as Error).message });
        } finally {
          patch(it.key, { busy: "" });
        }
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const changeKind = async (it: Item, k: PrintKind | "") => {
    patch(it.key, { kind: k, busy: "Размечаю заново…", err: "" });
    try {
      await recognize(tid, it, k, it.own.code);
    } catch (e) {
      patch(it.key, { err: (e as Error).message });
    } finally {
      patch(it.key, { busy: "" });
    }
  };

  /** Сохраняет форму одного документа; шаблон перечитывается — сохранения идут по очереди. */
  const saveOne = async (it: Item): Promise<string | null> => {
    if (!it.res) return null;
    if (!it.kind && (!it.own.name.trim() || !it.own.code.trim())) {
      patch(it.key, { err: "Укажите название и код своего документа" });
      return null;
    }
    patch(it.key, { busy: "Сохраняю…", err: "" });
    try {
      const choices = Object.fromEntries(it.res.ambiguous.map((a) => [a.id, a.chosen]));
      const form = await apiSend<TemplateDoc["form"]>("POST", `/api/templates/${tid}/markup/${it.res.token}`, { choices });
      const list = await apiGet<UserTemplate[]>("/api/templates");
      const cur = list.find((x) => x.id === tid) ?? t;
      let docs: TemplateDoc[];
      let label: string;
      if (it.kind) {
        const kind = it.kind;
        label = BUILTIN_DOC_LABELS[kind];
        docs = cur.docs.some((d) => d.kind === "builtin" && d.doc === kind)
          ? cur.docs.map((d) => (d.kind === "builtin" && d.doc === kind ? { ...d, form } : d))
          : [...cur.docs, { kind: "builtin", doc: kind, form }];
      } else {
        label = it.own.name.trim();
        const code = it.own.code.trim();
        // Свой документ с тем же кодом — форма заменяется, а не добавляется второй документ.
        docs = cur.docs.some((d) => d.kind === "custom" && d.code.toUpperCase() === code.toUpperCase())
          ? cur.docs.map((d) => (d.kind === "custom" && d.code.toUpperCase() === code.toUpperCase() ? { ...d, name: label, form } : d))
          : [...cur.docs, { kind: "custom", name: label, code, form }];
      }
      await saveTemplateDocs({ ...cur, docs });
      patch(it.key, { saved: label });
      return label;
    } catch (e) {
      patch(it.key, { err: (e as Error).message });
      return null;
    } finally {
      patch(it.key, { busy: "" });
    }
  };

  const finish = (labels: string[]) => {
    if (!labels.length) return;
    onTemplate(tid);
    onDone(
      `Сохранены формы: ${labels.map((l) => `«${l}»`).join(", ")}. Печать — кнопками документов в карточке акта (значок ✎), Word — «Скачать Word» в окне документа.`,
    );
  };

  const saveAll = async () => {
    setBusy("Сохраняю формы…");
    const labels: string[] = [];
    for (const it of live.current) {
      if (it.saved || !it.res || it.busy) continue;
      const l = await saveOne(it);
      if (l) labels.push(l);
    }
    setBusy("");
    finish(labels);
  };

  const ready = items.filter((x) => x.res && !x.saved && !x.busy);
  // Два файла одного встроенного вида — сохранится последний (у документа одна форма).
  const dup = new Set(ready.filter((x, i) => x.kind && ready.findIndex((y) => y.kind === x.kind) !== i).map((x) => x.kind));

  return (
    <div className="setting form-upload">
      <h3 className="tools-title">Загрузить формы заказчика</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Выберите заполненные документы заказчика — один или сразу несколько (Word или Excel, в том числе старые .doc/.xls). Программа сама поймёт, что это за
        документы и по какому акту они заполнены, поставит метки вместо значений и спросит только о спорных местах. Вёрстка ваших файлов не меняется: ширины
        колонок, шрифты и рамки остаются как есть.
      </p>
      <label className={`btn${busy ? " disabled" : ""}`}>
        {busy || "Выбрать файлы…"}
        <input
          type="file"
          accept={FORM_ACCEPT}
          multiple
          hidden
          disabled={!!busy}
          onChange={(e) => {
            void pick(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {ready.length > 1 && (
        <button className="btn btn-primary" style={{ marginLeft: 6 }} disabled={!!busy} onClick={() => void saveAll()}>
          Сохранить все ({ready.length})
        </button>
      )}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
      {items.map((it) => {
        const sorted = it.res ? [...it.res.byAct].sort((a, b) => b.found - a.found) : [];
        const weak = it.res && (it.res.found < 3 || (sorted[1] && sorted[1].found === it.res.found));
        return (
          <div key={it.key} className="form-upload-result">
            <div className="form-upload-file">
              <b>{it.source}</b>
              {it.name !== it.source && <span className="muted"> → {it.name}</span>}
              {it.busy && <span className="muted"> · {it.busy}</span>}
              {it.saved && <span className="ok"> · сохранена как «{it.saved}»</span>}
            </div>
            {it.err && (
              <p className="error" role="alert">
                {it.err}
              </p>
            )}
            {it.guess && !it.saved && (
              <>
                <label className="setting-option">
                  Это{" "}
                  <select
                    aria-label="Вид документа"
                    value={it.kind}
                    disabled={!!it.busy}
                    onChange={(e) => void changeKind(it, e.target.value as PrintKind | "")}
                  >
                    <option value="">свой документ</option>
                    {PRINT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {BUILTIN_DOC_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  {it.guess.title && <span className="muted"> — по заголовку «{it.guess.title}»</span>}
                </label>
                {!it.kind && (
                  <div className="row-actions">
                    <input
                      aria-label="Название документа"
                      placeholder="Название"
                      value={it.own.name}
                      onChange={(e) => patch(it.key, { own: { ...it.own, name: e.target.value } })}
                    />
                    <input
                      aria-label="Код документа"
                      placeholder="Код"
                      size={8}
                      value={it.own.code}
                      onChange={(e) => patch(it.key, { own: { ...it.own, code: e.target.value } })}
                    />
                  </div>
                )}
                {it.kind && dup.has(it.kind) && (
                  <p className="warn">Несколько файлов вида «{BUILTIN_DOC_LABELS[it.kind]}»: у документа одна форма — сохранится последний.</p>
                )}
                {it.res && (
                  <>
                    <p>
                      Заполнен по акту <b>{it.res.act}</b>: меток {it.res.found}
                      {it.res.ambiguous.length ? `, спорных мест ${it.res.ambiguous.length} — выберите поле` : ""}.
                    </p>
                    {weak && (
                      <p className="warn">
                        {it.res.found < 3
                          ? "Совпало мало значений: возможно, образец заполнен по акту, которого нет в книге. Метки можно поставить вручную в файле («Скачать для проверки») или попросить помощника."
                          : `Акты ${sorted[0].act} и ${sorted[1].act} совпали одинаково — проверьте метки дат и номеров.`}
                      </p>
                    )}
                    {it.res.ambiguous.map((a) => (
                      <label key={a.id} className="setting-option">
                        <span className="muted">…{a.context}…</span>
                        <select
                          value={a.chosen}
                          onChange={(e) =>
                            patch(it.key, {
                              res: { ...it.res!, ambiguous: it.res!.ambiguous.map((x) => (x.id === a.id ? { ...x, chosen: e.target.value } : x)) },
                            })
                          }
                        >
                          {a.options.map((o) => (
                            <option key={o} value={o}>{`{${o}}`}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <div className="row-actions">
                      <button
                        className="btn btn-primary"
                        disabled={!!it.busy || !!busy}
                        onClick={() =>
                          void saveOne(it).then((l) => {
                            if (l) finish([l]);
                          })
                        }
                      >
                        Сохранить форму
                      </button>
                      <a
                        className="btn"
                        href={`/api/templates/${tid}/markup/${it.res.token}?choices=${encodeURIComponent(JSON.stringify(Object.fromEntries(it.res.ambiguous.map((a) => [a.id, a.chosen]))))}`}
                        download
                      >
                        Скачать для проверки
                      </a>
                      <button className="btn" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}>
                        Убрать
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
