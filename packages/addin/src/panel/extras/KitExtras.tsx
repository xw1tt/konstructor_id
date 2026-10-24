// Дополнение карточки комплекта (строки «Комплектов», «Актов комплектов», «Реестра ИД»):
// заполнение реестра из актов, переходы к строкам комплекта, сборка комплекта в один PDF.
import { useContext, useEffect, useState } from "react";
import type { TableName } from "@idk/shared/workbook/schema";
import type { Issue } from "@idk/shared/workbook/bundle";
import { fillRegistry } from "@idk/shared/kit/registry";
import type { ExcelPort } from "../../book/excelPort.ts";
import { useGuard } from "../../server.tsx";
import type { BookState } from "../useBook.ts";
import { TemplateContext, PrintOptionsContext, UserTemplateContext } from "../templateContext.ts";
import { issueLines, printAct, printForm, type IssueLine } from "../print.ts";
import { templateButtons, type TemplateButton } from "../templatesApi.ts";
import type { PrintKind } from "@idk/shared/acts/schemas";
import { assembleKit, kitIssueLines, kitRegistryCount, previewUrl } from "../kit.ts";
import { IssueList } from "./IssueList.tsx";
import { kitShortage, type Status } from "@idk/shared/catalog/need";
import { CatalogContext, shortageText, statusText } from "../catalogApi.ts";

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
  const tplState = useContext(UserTemplateContext);
  const tpl = tplState.template;
  const options = useContext(PrintOptionsContext);
  const catalog = useContext(CatalogContext);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => { setConfirm(false); setLines([]); setNote(null); }, [kit]);
  if (!kit || !state.book) return null;
  const count = kitRegistryCount(state.book, kit);
  // Сводка «не хватает документов» — предупреждение, сборку не блокирует.
  const shortage: { act: string | null; label: string; status: Status }[] = catalog ? kitShortage(tpl, catalog, state.book, kit) : [];

  const showIssues = async (issues: Issue[]) => {
    const offsets: Partial<Record<TableName, number>> = {};
    for (const t of new Set(issues.map((i) => i.table))) offsets[t] = await port.tableSheetOffset(t).catch(() => undefined as any);
    setLines(issueLines(issues, offsets));
  };

  const fill = async () => {
    if (!tplState.ready) {
      setNote({ text: "Шаблоны ещё не загружены с сервера — реестр заполнится по шаблону книги, когда сервер ответит. Попробуйте через несколько секунд.", error: true });
      setConfirm(false);
      return;
    }
    setConfirm(false);
    setBusy("fill");
    setLines([]);
    setNote(null);
    try {
      // В отфильтрованной таблице вставка задела бы скрытые строки других комплектов.
      if (await port.isFiltered("РеестрИД")) await port.clearFilters("РеестрИД");
      const r = await fillRegistry(port, state.book!, kit, tpl);
      if (r.issues.length) await showIssues(r.issues);
      else setNote({ text: `Реестр комплекта ${kit}: строк ${r.count}. Проверьте порядок и укажите сканы.` });
      state.refresh();
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    } finally {
      setBusy(null);
    }
  };

  // Протоколы и акты плана 13 «на комплект»: печать по шапке комплекта в «Протоколах».
  const print = async (b: TemplateButton) => {
    setBusy(b.key);
    setLines([]);
    setNote(null);
    const where = { kit };
    if (b.form) {
      const r = await guard(printForm(state.book!, "", state.important, tpl.id, b.key, b.doc, where), (m) => setNote({ text: m, error: true }));
      if (r?.issues.length) await showIssues(r.issues);
      if (r?.job?.warnings.length) setNote({ text: `${r.job.name}: ${r.job.warnings.join(". ")}`, error: true });
    } else {
      const issues = await guard(printAct(state.book!, "", state.important, b.doc as PrintKind, template, options, where), (m) => setNote({ text: m, error: true }));
      if (issues?.length) await showIssues(issues);
    }
    setBusy(null);
  };
  const kitButtons = templateButtons(tpl, "kit");

  const build = async () => {
    setBusy("build");
    setLines([]);
    setNote(null);
    const r = await guard(assembleKit(state.book!, kit, state.important, template, options, tpl), (m) => setNote({ text: m, error: true }));
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
      {kitButtons.length > 0 && (
        <>
          <h3 className="tools-title">Документы комплекта</h3>
          <div className="row-actions" aria-label="Печать документов комплекта">
            {kitButtons.map((b) => (
              <button key={b.key} className="btn" disabled={busy !== null} onClick={() => void print(b)} title={b.form ? "По своей форме шаблона" : undefined}>
                {busy === b.key ? "Готовлю…" : b.label}{b.form ? " ✎" : ""}
              </button>
            ))}
          </div>
        </>
      )}
      {confirm && (
        <div className="confirm" role="alertdialog" aria-label="Заполнение реестра">
          <p>Строки комплекта {kit} в реестре ({count}) будут заменены строками из актов; ручные правки этих строк пропадут.</p>
          <div className="row-actions">
            <button className="btn btn-danger" onClick={() => void fill()}>Заменить</button>
            <button className="btn" onClick={() => setConfirm(false)}>Отмена</button>
          </div>
        </div>
      )}
      {shortage.length > 0 && (
        <div className="warn" role="status" style={{ display: "block", padding: "6px 8px" }}>
          <b>{shortageText(shortage.length)}</b> — сборку это не блокирует.
          <ul className="list">
            {shortage.map((s, i) => (
              <li key={i}>
                {s.act ? (
                  <button className="btn btn-link" onClick={() => void port.filterBy("РеестрИД", "Акт", s.act!)}>акт {s.act}</button>
                ) : <span>комплект</span>}
                <span>{statusText(s.status, s.label)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {busy === "build" && <p className="notice">Печатаю документы и склеиваю комплект — это может занять минуту.</p>}
      <IssueList port={port} lines={lines} title="Перед сборкой исправьте:" />
      {note && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
    </div>
  );
}
