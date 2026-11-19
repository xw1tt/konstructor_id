// 0.32: «Печать и сдача» — всё, что выходит из книги: комплекты (реестр собирается сам, документы актов и реестр —
// одним PDF), общий реестр, ОЖР, проверка перед сдачей по всем актам. Раньше это было разбросано по карточкам строк.
import { useEffect, useState } from "react";
import { cellText } from "@idk/shared/workbook/values";
import type { BookPort } from "../book/bookPort.ts";
import type { BookState } from "./useBook.ts";
import { KitExtras } from "./extras/KitExtras.tsx";
import { OjrExtras } from "./extras/OjrExtras.tsx";
import { PreDelivery } from "./extras/PreDelivery.tsx";
import { kitRegistryCount } from "./kit.ts";

const actWord = (n: number) => {
  const m10 = n % 10,
    m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? "акт" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "акта" : "актов";
};

export function DeliveryScreen({ port, state, wide = false }: { port: BookPort; state: BookState; wide?: boolean }) {
  const book = state.book;
  const kits = [...new Set((book?.tables["Комплекты"] ?? []).map((r) => cellText(r.v.number)).filter(Boolean))];
  const [kit, setKit] = useState("");
  useEffect(() => {
    if (!kits.includes(kit)) setKit(kits[0] ?? "");
  }, [kits.join("\n")]);
  if (!book) return <p className="notice">Читаю книгу…</p>;
  const acts = (book.tables["Акты"] ?? []).map((r) => cellText(r.v.baseNumber)).filter(Boolean);
  if (wide) return <WideDelivery port={port} state={state} kits={kits} kit={kit} setKit={setKit} acts={acts} />;

  return (
    <main className="content delivery">
      <h2>Печать и сдача</h2>
      <section className="setting">
        <h3 className="tools-title">Комплекты ИД</h3>
        {!kits.length ? (
          <>
            <p className="muted">
              В книге нет комплектов. Комплект — номер и акты, которые сдаются вместе: заведите его на листе «Комплекты», реестр соберётся сам.
            </p>
            <button className="btn" onClick={() => void port.activateSheet("Комплекты")}>
              Открыть «Комплекты»
            </button>
          </>
        ) : (
          <>
            {kits.length > 1 && (
              <div className="delivery-kits" role="tablist" aria-label="Комплект">
                {kits.map((k) => (
                  <button key={k} role="tab" aria-selected={k === kit} className={`btn btn-small${k === kit ? " btn-primary" : ""}`} onClick={() => setKit(k)}>
                    {k}
                  </button>
                ))}
              </div>
            )}
            {kit && <KitExtras port={port} state={state} kit={kit} />}
          </>
        )}
      </section>
      <section className="setting">
        <OjrExtras port={port} state={state} />
      </section>
      {acts.length > 0 && (
        <section className="setting">
          <h3 className="tools-title">Все акты книги</h3>
          <PreDelivery port={port} state={state} acts={acts} what="все акты" />
        </section>
      )}
    </main>
  );
}

/** 0.37: «Печать и сдача» в окне программы — комплекты списком слева, выбранный комплект в середине, ОЖР и проверка
 *  всех актов — справа. */
function WideDelivery({
  port,
  state,
  kits,
  kit,
  setKit,
  acts,
}: {
  port: BookPort;
  state: BookState;
  kits: string[];
  kit: string;
  setKit(k: string): void;
  acts: string[];
}) {
  const book = state.book!;
  const rowOf = (k: string) => (book.tables["Комплекты"] ?? []).find((r) => cellText(r.v.number) === k);
  const actsOf = (k: string) => (book.tables["АктыКомплектов"] ?? []).filter((r) => cellText(r.v.kit) === k).length;
  return (
    <div className="dl">
      <header className="acts-head">
        <h2>Печать и сдача</h2>
        <button className="btn" onClick={() => void port.activateSheet("Комплекты")}>
          Открыть «Комплекты» в Excel
        </button>
      </header>
      <div className="dl-grid">
        <aside className="dl-kits" aria-label="Комплекты">
          <h3 className="wn-cap">Комплекты</h3>
          {!kits.length && <p className="muted">Комплектов нет. Комплект — номер и акты, которые сдаются вместе: заведите его на листе «Комплекты».</p>}
          {kits.map((k) => {
            const r = rowOf(k);
            const vol = r ? cellText(r.v.volume) : "";
            const n = actsOf(k);
            const reg = kitRegistryCount(book, k);
            return (
              <button key={k} className={`dl-kit${k === kit ? " dl-kit-on" : ""}`} aria-current={k === kit ? "true" : undefined} onClick={() => setKit(k)}>
                <strong>
                  Комплект {k}
                  {vol ? ` · том ${vol}` : ""}
                </strong>
                <span>
                  {n} {actWord(n)} · {reg ? `в реестре ${reg}` : "реестр пуст"}
                </span>
              </button>
            );
          })}
        </aside>
        <section className="dl-main" aria-label="Комплект">
          {kit ? <KitExtras port={port} state={state} kit={kit} /> : <p className="notice">Выберите комплект слева.</p>}
        </section>
        <aside className="dl-side">
          <section className="dl-card">
            <OjrExtras port={port} state={state} />
          </section>
          {acts.length > 0 && (
            <section className="dl-card">
              <h3 className="tools-title">Все акты книги</h3>
              <PreDelivery port={port} state={state} acts={acts} what="все акты" />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
