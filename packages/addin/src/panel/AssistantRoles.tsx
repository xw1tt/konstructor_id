// 0.34: роли помощника — кнопки готовых задач над полем ввода: «Проверка как технадзор» (акт под курсором или все)
// и «Черновики актов из РД» (сначала файл РД: PDF, Word или Excel — сервер достаёт текст).
import { useState } from "react";
import { ASSISTANT_ROLES, type AssistantRole } from "@idk/shared/ai/roles";
import { apiSend } from "../api.ts";

const toBase64 = async (f: File) => {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export function AssistantRoles({
  disabled,
  act,
  acts,
  onTask,
  onError,
}: {
  disabled: boolean;
  act: string | null;
  acts: string[];
  onTask(t: { text: string; display: string }): void;
  onError(text: string): void;
}) {
  const [reading, setReading] = useState(false);
  const [scope, setScope] = useState<"act" | "all">("act");

  const run = (r: AssistantRole) => onTask(r.build({ act: scope === "act" ? act : null, acts }));

  const rd = async (r: AssistantRole, f: File | undefined) => {
    if (!f) return;
    setReading(true);
    onError("");
    try {
      const x = await apiSend<{ name: string; text: string; pages: number | null; cut: boolean }>("POST", "/api/ai/extract", {
        file: await toBase64(f),
        name: f.name,
      });
      if (!x.text.trim()) throw new Error("В файле нет текста");
      onTask(r.build({ act, acts, rd: { name: x.name, text: x.text, pages: x.pages ?? undefined } }));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="as-roles" aria-label="Роли помощника">
      {ASSISTANT_ROLES.map((r) =>
        r.needsRd ? (
          <label key={r.id} className={`btn btn-small${disabled || reading ? " disabled" : ""}`} title={r.hint}>
            {reading ? "Читаю РД…" : `${r.label}…`}
            <input
              type="file"
              accept=".pdf,.docx,.xlsx"
              hidden
              disabled={disabled || reading}
              onChange={(e) => {
                void rd(r, e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          <span key={r.id} className="as-role">
            <button className="btn btn-small" disabled={disabled || (!act && !acts.length)} title={r.hint} onClick={() => run(r)}>
              {r.label}
            </button>
            {act && (
              <select
                aria-label="Что проверять"
                className="as-role-scope"
                value={scope}
                disabled={disabled}
                onChange={(e) => setScope(e.target.value as "act" | "all")}
              >
                <option value="act">акт {act}</option>
                <option value="all">все акты ({acts.length})</option>
              </select>
            )}
          </span>
        ),
      )}
    </div>
  );
}
