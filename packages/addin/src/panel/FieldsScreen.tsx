// «Поля для шаблона»: все метки своих форм с значениями на выбранном акте и кнопкой «Копировать метку».
import { useEffect, useState } from "react";
import { FIELD_TREE, label, type FormData } from "@idk/shared/forms/fields";
import { cellText } from "@idk/shared/workbook/values";
import { apiSend } from "../api.ts";
import { useGuard } from "../server.tsx";
import type { BookState } from "./useBook.ts";
import { bundleFor } from "./print.ts";

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function FieldsScreen({ state }: { state: BookState }) {
  const guard = useGuard();
  const acts = (state.book?.tables["Акты"] ?? []).map((r) => cellText(r.v.baseNumber)).filter(Boolean);
  const [act, setAct] = useState(acts[0] ?? "");
  const [data, setData] = useState<FormData | null>(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    setData(null);
    if (!act || !state.book) return;
    const { bundle, issues } = bundleFor(state.book, act, state.important, null);
    if (!bundle) { setNote(`Акт «${act}» не готов к печати — значения не показаны (${issues[0]?.message ?? ""})`); return; }
    setNote("");
    void guard(apiSend<FormData>("POST", "/api/form-fields", { bundle }), setNote).then((d) => d && setData(d));
  }, [act, state.book]);

  return (
    <main className="content settings">
      <h2 className="app-title">Поля для шаблона</h2>
      <p className="muted">Вставьте метку в свою форму Word/Excel — при печати на её место встанет значение. Строка таблицы с
        «{"{#Материалы}"} … {"{/Материалы}"}» повторяется по материалам акта (так же «Схемы», «ВОР»).</p>
      <label>Значения по акту{" "}
        <select value={act} onChange={(e) => setAct(e.target.value)}>{acts.map((a) => <option key={a} value={a}>{a}</option>)}</select>
      </label>
      {note && <p className="warn">{note}</p>}
      {FIELD_TREE.map((g) => (
        <section key={g.group} className="fields-group">
          <h3 className="tools-title">{g.group}{g.list ? ` — список {#${g.list}} … {/${g.list}}` : ""}</h3>
          <ul className="list">
            {g.fields.map((f) => {
              const key = `${g.group}.${f}`;
              const value = g.list ? data?.lists[g.list]?.[0]?.[key] : data?.values[key];
              const text = label(g.group, f);
              return (
                <li key={key} className="field-row">
                  <button className="btn" onClick={async () => { if (await copy(text)) setCopied(key); }}>{copied === key ? "Скопировано" : "Копировать"}</button>
                  <code className="field-label" title="Выделите и скопируйте, если кнопка не сработала">{text}</code>
                  <span className="muted field-value">{value ? value.split("\n")[0] + (value.includes("\n") ? " …" : "") : "—"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
