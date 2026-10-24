// Карточка текущей строки: все поля строки, запись в ячейку при выходе из поля, переименование ключей
// с обновлением ссылок, дополнения разделов.
import { useContext, useEffect, useState } from "react";
import {
  TABLES, OBJECT_FIELDS, SHEETS, isObjectFieldRequired, keyColumn, column as colOf, type ColumnDef, type TableName,
} from "@idk/shared/workbook/schema";
import { cellText, type CellValue } from "@idk/shared/workbook/values";
import { findReferences, renameKey, type RefHit } from "@idk/shared/workbook/refs";
import type { Book } from "@idk/shared/workbook/records";
import type { ExcelPort } from "../../book/excelPort.ts";
import { apiUpload } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import type { BookState } from "../useBook.ts";
import { SECTIONS, sectionForSheet } from "../sections.ts";
import { Field } from "./fields.tsx";
import { isExampleRow } from "@idk/shared/workbook/examples";
import { toCellFor } from "./editValue.ts";
import { MaterialExtras } from "../extras/MaterialExtras.tsx";
import { ActExtras } from "../extras/ActExtras.tsx";
import { CableExtras } from "../extras/CableExtras.tsx";
import { KitExtras } from "../extras/KitExtras.tsx";
import { OjrExtras } from "../extras/OjrExtras.tsx";
import { SpecExtras, SpecPositionCard, SpecMatchTool } from "../extras/SpecExtras.tsx";
import { kitOfRow } from "../kit.ts";
import { CatalogContext, workListNames } from "../catalogApi.ts";
import { UserTemplateContext } from "../templateContext.ts";

interface PendingRename { table: TableName; from: string; to: string; hits: RefHit[] }

/** Для таблицы «Объект» столбец «Значение» ведёт себя по типу поля (ссылка на организацию, дата). */
function effectiveColumn(table: TableName, col: ColumnDef, row: CellValue[], headers: string[]): ColumnDef {
  if (table !== "Объект" || col.key !== "value") return col;
  const label = cellText(row[headers.indexOf("Поле")] ?? null);
  const f = OBJECT_FIELDS.find((x) => x.label === label);
  const withHint = f ? { ...col, hint: f.hint } : col;
  if (f?.type === "ref") return { ...withHint, type: "ref", ref: "Организации" };
  if (f?.type === "date") return { ...withHint, type: "date" };
  return withHint;
}

const keysOf = (book: Book | null, t: TableName) => {
  const k = keyColumn(t);
  if (!book || !k) return [];
  return [...new Set((book.tables[t] ?? []).map((r) => cellText(r.v[k.key])).filter(Boolean))];
};

const renameText = (hits: RefHit[]) =>
  `Обновить ссылки: ${hits.length} строк на ${new Set(hits.map((h) => h.table)).size} листах?`;

export function CardArea({ port, state }: { port: ExcelPort; state: BookState }) {
  const [pending, setPending] = useState<PendingRename | null>(null);
  const [message, setMessage] = useState("");

  // Переименование ключа правкой ячейки на листе.
  useEffect(() => state.onCellChange((e) => {
    if (!e.table || e.multi || !state.book) return;
    const key = keyColumn(e.table);
    const from = cellText(e.before), to = cellText(e.after);
    if (!key || e.column !== key.header || !from || !to || from === to) return;
    const hits = findReferences(state.book, e.table, from);
    if (hits.length) setPending({ table: e.table, from, to, hits });
  }), [state.book]);

  const confirmRename = async () => {
    if (!pending || !state.book) return;
    const r = await renameKey(port, state.book, pending.table, pending.from, pending.to);
    setPending(null);
    setMessage(r.ok ? `Ссылки обновлены: ${r.updated}` : r.message);
    state.refresh();
  };

  const s = state.selection;
  useEffect(() => setMessage(""), [s?.table]);
  const section = s ? SECTIONS.find((x) => x.id === sectionForSheet(s.sheet)) : undefined;
  return (
    <>
      {section && section.sheets.length > 1 && (
        <div className="subsheets" role="group" aria-label="Листы раздела">
          {section.sheets.map((sh) => (
            <button key={sh} className={"chip" + (sh === s!.sheet ? " chip-active" : "")} onClick={() => void port.activateSheet(sh)}>{sh}</button>
          ))}
        </div>
      )}
      {pending && (
        <div className="confirm" role="alertdialog" aria-label="Обновление ссылок">
          <p>«{pending.from}» → «{pending.to}». {renameText(pending.hits)}</p>
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => void confirmRename()}>Обновить</button>
            <button className="btn" onClick={() => setPending(null)}>Не обновлять</button>
          </div>
        </div>
      )}
      {message && <p className="muted" role="status">{message}</p>}
      {section?.id === "ojr" && <OjrExtras port={port} state={state} />}
      {section?.id === "spec" && <SpecExtras port={port} state={state} />}
      {s?.sheet === "Материалы" && <SpecMatchTool port={port} state={state} />}
      <RowCard port={port} state={state} onRename={(p) => setPending(p)} />
    </>
  );
}

function RowCard({ port, state, onRename }: { port: ExcelPort; state: BookState; onRename: (p: PendingRename) => void }) {
  const guard = useGuard();
  const catalog = useContext(CatalogContext);
  const { template } = useContext(UserTemplateContext);
  /** Варианты «Вида работ» — как список «ВидыРабот» книги. */
  const workOptions = catalog ? workListNames(catalog, template) : [];
  const [errors, setErrors] = useState<Record<string, string>>({});
  const s = state.selection;
  const t = state.table;
  useEffect(() => setErrors({}), [s?.table, s?.row]);
  if (!s || !t) return null;
  if (s.table !== t.name || s.row === null) {
    return <p className="notice">Встаньте на строку таблицы — здесь появится её карточка.</p>;
  }
  const table = t.name;
  const rowIdx = s.row;
  const row = t.rows[rowIdx] ?? [];
  const links = t.links[rowIdx] ?? [];
  const valueOf = (h: string) => row[t.headers.indexOf(h)] ?? null;

  const commit = async (col: ColumnDef, input: string | string[]) => {
    const parsed = toCellFor(table, col, input);
    if (!parsed.ok) { setErrors((e) => ({ ...e, [col.header]: parsed.message })); return; }
    setErrors((e) => ({ ...e, [col.header]: "" }));
    const before = cellText(valueOf(col.header));
    await port.write(table, rowIdx, { [col.header]: parsed.value });
    const key = keyColumn(table);
    const after = cellText(parsed.value);
    if (key?.header === col.header && before && after && before !== after && state.book) {
      const hits = findReferences(state.book, table, before);
      if (hits.length) onRename({ table, from: before, to: after, hits });
    }
    state.refresh();
  };

  const upload = async (col: ColumnDef, file: File) => {
    const f = await guard(apiUpload(file, file.name), (m) => setErrors((e) => ({ ...e, [col.header]: m })));
    if (!f) return;
    await port.write(table, rowIdx, { [col.header]: f.name }, { [col.header]: `${location.origin}/api/files/${f.id}` });
    state.refresh();
  };

  const sheet = SHEETS.find((x) => x.tables.includes(table))!.name;
  return (
    <section className="card" aria-label="Карточка строки">
      <h2 className="tools-title">Строка {rowIdx + 1} · {sheet}</h2>
      {isExampleRow(row, table, t.headers) && <p className="example-note" role="note">Это строка-пример: замените значения своими или удалите строку.</p>}
      <div className="form">
        {TABLES[table].columns.map((c) => {
          const col = effectiveColumn(table, c, row, t.headers);
          // В «Объекте» обязательны только поля шапки АОСР; договор и прочее можно не заполнять.
          const important = (state.important[table] ?? []).includes(c.header)
            && !(table === "Объект" && c.key === "value" && !isObjectFieldRequired(cellText(valueOf("Поле"))));
          return (
            <Field
              key={c.header}
              col={{ ...col, important }}
              value={valueOf(c.header)}
              link={links[t.headers.indexOf(c.header)] ?? null}
              options={col.ref ? keysOf(state.book, col.ref) : col.listRange ? workOptions : []}
              error={errors[c.header] ?? ""}
              onCommit={(v) => void commit(col, v)}
              onUpload={c.type === "file" ? (f) => void upload(c, f) : undefined}
            />
          );
        })}
      </div>
      {table === "Материалы" && <MaterialExtras port={port} state={state} name={cellText(valueOf(colOf("Материалы", "name").header))} />}
      {table === "Спецификация" && <SpecPositionCard state={state} number={cellText(valueOf(colOf("Спецификация", "number").header))} />}
      {table === "МатериалыАктов" && <SpecPositionCard state={state} material={cellText(valueOf(colOf("МатериалыАктов", "material").header))} />}
      {table === "Акты" && <ActExtras port={port} state={state} act={cellText(valueOf(colOf("Акты", "baseNumber").header))} />}
      {table === "КабельныйЖурнал" && <CableExtras port={port} state={state} act={cellText(valueOf(colOf("КабельныйЖурнал", "act").header))} />}
      {table === "ИзмеренияМарок" && <CableExtras port={port} state={state} act="" />}
      {(table === "Комплекты" || table === "АктыКомплектов" || table === "РеестрИД") && (
        <KitExtras port={port} state={state} kit={kitOfRow(table, t.headers, row)} />
      )}
    </section>
  );
}
