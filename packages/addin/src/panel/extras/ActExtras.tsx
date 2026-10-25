// Дополнение карточки акта: сводка, переход к строкам акта на других листах, проверка и печать.
import { useContext, useState } from "react";
import type { TableName } from "@idk/shared/workbook/schema";
import type { PrintKind } from "@idk/shared/acts/schemas";
import type { ExcelPort } from "../../book/excelPort.ts";
import { useGuard } from "../../server.tsx";
import type { BookState } from "../useBook.ts";
import { actSummary } from "./summaries.ts";
import { TemplateContext, PrintOptionsContext, UserTemplateContext } from "../templateContext.ts";
import { templateButtons, type TemplateButton } from "../templatesApi.ts";
import { issueLines, printAct, printForm, type IssueLine } from "../print.ts";
import { IssueList } from "./IssueList.tsx";
import { Completeness } from "./Completeness.tsx";
import { unboundMaterials } from "@idk/shared/spec/closed";

const LINKED: { table: TableName; label: string; key: "schemes" | "materials" | "vor" }[] = [
  { table: "Схемы", label: "Схемы", key: "schemes" },
  { table: "МатериалыАктов", label: "Материалы", key: "materials" },
  { table: "ВОР", label: "ВОР", key: "vor" },
];

export function ActExtras({ port, state, act }: { port: ExcelPort; state: BookState; act: string }) {
  const guard = useGuard();
  const template = useContext(TemplateContext);
  const options = useContext(PrintOptionsContext);
  const tpl = useContext(UserTemplateContext);
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; name: string; warnings: string[] } | null>(null);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [error, setError] = useState("");
  if (!act || !state.book) return null;
  const sum = actSummary(state.book, act);
  const unbound = unboundMaterials(state.book, act);

  const print = async (b: TemplateButton) => {
    setBusy(b.key);
    setError("");
    setLines([]);
    setMade(null);
    let issues: Issue[] | undefined;
    if (b.form) {
      const r = await guard(printForm(state.book!, act, state.important, tpl.template.id, b.key, b.doc, { act }, options), setError);
      issues = r?.issues;
      if (r?.job) setMade(r.job);
    } else {
      issues = await guard(printAct(state.book!, act, state.important, b.doc as PrintKind, template, options), setError);
    }
    if (issues?.length) {
      const tables = [...new Set(issues.map((i) => i.table))];
      const offsets: Partial<Record<TableName, number>> = {};
      for (const t of tables) offsets[t] = await port.tableSheetOffset(t).catch(() => undefined as any);
      setLines(issueLines(issues, offsets));
    }
    setBusy(null);
  };

  return (
    <div className="extras">
      <h3 className="tools-title">Акт {act}</h3>
      <div className="row-actions">
        {LINKED.map((l) => (
          <button key={l.table} className="btn" onClick={() => void port.filterBy(l.table, "Акт", act)}>
            {l.label}: {sum[l.key]}
          </button>
        ))}
      </div>
      {unbound.length > 0 && (
        <p className="warn" role="status">Не привязаны к спецификации: {unbound.join("; ")}. Укажите «№ п/п РКЦ» в «Материалах» — печать это не блокирует.</p>
      )}
      <Completeness port={port} state={state} act={act} />
      <h3 className="tools-title">Печать</h3>
      <div className="row-actions" aria-label="Печать документов">
        {templateButtons(tpl.template).map((b) => (
          <button key={b.key} className="btn" disabled={busy !== null} onClick={() => void print(b)} title={b.form ? "По своей форме шаблона" : undefined}>
            {busy === b.key ? "Готовлю…" : b.label}{b.form ? " ✎" : ""}
          </button>
        ))}
      </div>
      {tpl.warning && <p className="warn" role="status">{tpl.warning}</p>}
      {made && (
        <p className="notice" role="status">
          {made.name}: <a href={`/api/form-jobs/${made.id}/source`} download>скачать файл для правки</a>
          {made.warnings.length > 0 && <><br /><span className="warn">{made.warnings.join(". ")}</span></>}
        </p>
      )}
      <IssueList port={port} lines={lines} title="Перед печатью исправьте:" />
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
