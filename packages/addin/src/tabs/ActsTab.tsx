import { useState } from "react";
import type { Act } from "@idk/shared/acts/schemas";
import { formatDateShort } from "@idk/shared/acts/format";
import { apiSend } from "../api.ts";
import { useGuard } from "../server.tsx";
import { Section, useList } from "./common.tsx";
import { ActCard, type ActCardSlots } from "./acts/ActCard.tsx";
import { nextBaseNumber, todayIso } from "./acts/actDefaults.ts";

export function ActsTab({ slots }: { slots?: ActCardSlots }) {
  const guard = useGuard();
  const [list, reload] = useList<Act>("/api/acts");
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const create = async () => {
    setError("");
    const last = list[list.length - 1];
    const a = await guard(apiSend<Act>("POST", "/api/acts", {
      baseNumber: nextBaseNumber(last?.baseNumber ?? ""), date: todayIso(),
    }), setError);
    if (a) { reload(); setOpenId(a.id); }
  };

  if (openId !== null)
    return <ActCard id={openId} onClose={() => setOpenId(null)} onChanged={reload} slots={slots} />;

  return (
    <Section title={`Акты АОСР (${list.length})`} open>
      {list.length === 0 && <p className="muted">Актов пока нет. Создайте первый — номер и дату можно будет поменять.</p>}
      <ul className="list">
        {list.map((a) => (
          <li key={a.id}>
            <button className="link" title={a.works} onClick={() => setOpenId(a.id)}>
              №{a.baseNumber} <span className="muted">{formatDateShort(a.date)}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-actions"><button className="btn" onClick={() => void create()}>Новый акт</button></div>
    </Section>
  );
}
