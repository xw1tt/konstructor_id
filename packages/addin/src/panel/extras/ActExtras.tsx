// Дополнение карточки акта: сводка, переход к строкам акта на других листах, проверка и печать.
import { useContext, useState } from "react";
import type { TableName } from "@idk/shared/workbook/schema";
import type { PrintKind } from "@idk/shared/acts/schemas";
import type { ExcelPort } from "../../book/excelPort.ts";
import { useGuard } from "../../server.tsx";
import type { BookState } from "../useBook.ts";
import { actSummary } from "./summaries.ts";
import { TemplateContext, PrintOptionsContext } from "../templateContext.ts";
import { issueLines, printAct, type IssueLine } from "../print.ts";
import { IssueList } from "./IssueList.tsx";
import { unboundMaterials } from "@idk/shared/spec/closed";

const DOCS: { kind: PrintKind; label: string }[] = [
  { kind: "aosr", label: "АОСР" }, { kind: "rim", label: "РИМ" }, { kind: "vd", label: "ВД" }, { kind: "vor", label: "ВОР" },
  { kind: "kj", label: "КЖ" }, { kind: "ip", label: "Протокол" }, { kind: "avk", label: "АВК" },
];
const LINKED: { table: TableName; label: string; key: "schemes" | "materials" | "vor" }[] = [
  { table: "Схемы", label: "Схемы", key: "schemes" },
  { table: "МатериалыАктов", label: "Материалы", key: "materials" },
  { table: "ВОР", label: "ВОР", key: "vor" },
];

export function ActExtras({ port, state, act }: { port: ExcelPort; state: BookState; act: string }) {
  const guard = useGuard();
  const template = useContext(TemplateContext);
  const options = useContext(PrintOptionsContext);
  const [busy, setBusy] = useState<PrintKind | null>(null);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [error, setError] = useState("");
  if (!act || !state.book) return null;
  const sum = actSummary(state.book, act);
  const unbound = unboundMaterials(state.book, act);

  const print = async (doc: PrintKind) => {
    setBusy(doc);
    setError("");
    setLines([]);
    const issues = await guard(printAct(state.book!, act, state.important, doc, template, options), setError);
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
      <h3 className="tools-title">Печать</h3>
      <div className="row-actions" aria-label="Печать документов">
        {DOCS.map((d) => (
          <button key={d.kind} className="btn" disabled={busy !== null} onClick={() => void print(d.kind)}>
            {busy === d.kind ? "Готовлю…" : d.label}
          </button>
        ))}
      </div>
      <IssueList port={port} lines={lines} title="Перед печатью исправьте:" />
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
