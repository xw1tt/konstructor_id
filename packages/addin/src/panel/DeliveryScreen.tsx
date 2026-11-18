// 0.32: «Печать и сдача» — всё, что выходит из книги: комплекты (реестр собирается сам, документы актов и реестр —
// одним PDF), общий реестр, ОЖР, проверка перед сдачей по всем актам. Раньше это было разбросано по карточкам строк.
import { useEffect, useState } from "react";
import { cellText } from "@idk/shared/workbook/values";
import type { ExcelPort } from "../book/excelPort.ts";
import type { BookState } from "./useBook.ts";
import { KitExtras } from "./extras/KitExtras.tsx";
import { OjrExtras } from "./extras/OjrExtras.tsx";
import { PreDelivery } from "./extras/PreDelivery.tsx";

export function DeliveryScreen({ port, state }: { port: ExcelPort; state: BookState }) {
  const book = state.book;
  const kits = [...new Set((book?.tables["Комплекты"] ?? []).map((r) => cellText(r.v.number)).filter(Boolean))];
  const [kit, setKit] = useState("");
  useEffect(() => {
    if (!kits.includes(kit)) setKit(kits[0] ?? "");
  }, [kits.join("\n")]);
  if (!book) return <p className="notice">Читаю книгу…</p>;
  const acts = (book.tables["Акты"] ?? []).map((r) => cellText(r.v.baseNumber)).filter(Boolean);

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
