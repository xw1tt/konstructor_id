// Дополнение карточки комплекта (строки «Комплектов», «Актов комплектов», «Реестра ИД»):
// заполнение реестра из актов, переходы к строкам комплекта, сборка комплекта в один PDF.
import { useContext, useEffect, useState } from "react";
import type { TableName } from "@idk/shared/workbook/schema";
import type { Issue } from "@idk/shared/workbook/bundle";
import { fillRegistry } from "@idk/shared/kit/registry";
import type { ExcelPort } from "../../book/excelPort.ts";
import { useGuard } from "../../server.tsx";
import type { BookState } from "../useBook.ts";
import { TemplateContext, PrintOptionsContext } from "../templateContext.ts";
import { issueLines, type IssueLine } from "../print.ts";
import { assembleKit, kitIssueLines, kitRegistryCount, previewUrl } from "../kit.ts";
import { IssueList } from "./IssueList.tsx";

declare const Office: any;

function openPreview(url: string) {
  if (typeof Office !== "undefined" && Office?.context?.ui?.displayDialogAsync) {
    Office.context.ui.displayDialogAsync(url, { height: 90, width: 70, displayInIframe: false });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export function KitExtras({ port, state, kit }: { port: ExcelPort; state: BookState; kit: string }) {
  const guard = useGuard();
  const template = useContext(TemplateContext);
  const options = useContext(PrintOptionsContext);
  const [busy, setBusy] = useState<"fill" | "build" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => { setConfirm(false); setLines([]); setNote(null); }, [kit]);
  if (!kit || !state.book) return null;
  const count = kitRegistryCount(state.book, kit);

  const showIssues = async (issues: Issue[]) => {
    const offsets: Partial<Record<TableName, number>> = {};
    for (const t of new Set(issues.map((i) => i.table))) offsets[t] = await port.tableSheetOffset(t).catch(() => undefined as any);
    setLines(issueLines(issues, offsets));
  };

  const fill = async () => {
    setConfirm(false);
    setBusy("fill");
    setLines([]);
    setNote(null);
    try {
      // В отфильтрованной таблице вставка задела бы скрытые строки других комплектов.
      if (await port.isFiltered("РеестрИД")) await port.clearFilters("РеестрИД");
      const r = await fillRegistry(port, state.book!, kit);
      if (r.issues.length) await showIssues(r.issues);
      else setNote({ text: `Реестр комплекта ${kit}: строк ${r.count}. Проверьте порядок и укажите сканы.` });
      state.refresh();
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    } finally {
      setBusy(null);
    }
  };

  const build = async () => {
    setBusy("build");
    setLines([]);
    setNote(null);
    const r = await guard(assembleKit(state.book!, kit, state.important, template, options), (m) => setNote({ text: m, error: true }));
    if (r?.kind === "issues") await showIssues(r.issues);
    if (r?.kind === "files") setLines(kitIssueLines(r.issues, await port.tableSheetOffset("РеестрИД").catch(() => undefined)));
    if (r?.kind === "ok") {
      setNote({ text: `Комплект собран: ${r.name}, страниц ${r.pages}.` });
      openPreview(previewUrl(`/api/kit-jobs/${r.id}`, location.origin));
    }
    setBusy(null);
  };

  return (
    <div className="extras">
      <h3 className="tools-title">Комплект {kit}</h3>
      <div className="row-actions">
        <button className="btn" onClick={() => void port.filterBy("АктыКомплектов", "Комплект", kit)}>Акты комплекта</button>
        <button className="btn" onClick={() => void port.filterBy("РеестрИД", "Комплект", kit)}>Реестр: {count}</button>
      </div>
      <div className="row-actions">
        <button className="btn" disabled={busy !== null} onClick={() => (count ? setConfirm(true) : void fill())}>
          {busy === "fill" ? "Заполняю…" : "Заполнить из актов"}
        </button>
        <button className="btn btn-primary" disabled={busy !== null} onClick={() => void build()}>
          {busy === "build" ? "Собираю…" : "Собрать комплект"}
        </button>
      </div>
      {confirm && (
        <div className="confirm" role="alertdialog" aria-label="Заполнение реестра">
          <p>Строки комплекта {kit} в реестре ({count}) будут заменены строками из актов; ручные правки этих строк пропадут.</p>
          <div className="row-actions">
            <button className="btn btn-danger" onClick={() => void fill()}>Заменить</button>
            <button className="btn" onClick={() => setConfirm(false)}>Отмена</button>
          </div>
        </div>
      )}
      {busy === "build" && <p className="notice">Печатаю документы и склеиваю комплект — это может занять минуту.</p>}
      <IssueList port={port} lines={lines} title="Перед сборкой исправьте:" />
      {note && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
    </div>
  );
}
