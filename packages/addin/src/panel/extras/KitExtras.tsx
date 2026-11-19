// Дополнение карточки комплекта (строки «Комплектов», «Актов комплектов», «Реестра ИД»):
// реестр из актов (0.32 — сверяется сам при сборке), переходы к строкам комплекта, сборка комплекта в один PDF.
import { useContext, useEffect, useState } from "react";
import type { Issue } from "@idk/shared/workbook/bundle";
import { cellText } from "@idk/shared/workbook/values";
import { kitActs, syncRegistry } from "@idk/shared/kit/registry";
import { readBook, type Book } from "@idk/shared/workbook/records";
import type { BookPort } from "../../book/bookPort.ts";
import { useGuard } from "../../server.tsx";
import type { BookState } from "../useBook.ts";
import { TemplateContext, PrintOptionsContext, UserTemplateContext } from "../templateContext.ts";
import { sheetIssueLines, printAct, printForm, type IssueLine } from "../print.ts";
import { templateButtons, type TemplateButton } from "../templatesApi.ts";
import type { PrintKind } from "@idk/shared/acts/schemas";
import { assembleKit, assembleCommonRegistry, kitIssueLines, kitRegistryCount, previewUrl } from "../kit.ts";
import { IssueList } from "./IssueList.tsx";
import { PreDelivery } from "./PreDelivery.tsx";
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

export function KitExtras({ port, state, kit }: { port: BookPort; state: BookState; kit: string }) {
  const guard = useGuard();
  const template = useContext(TemplateContext);
  const tplState = useContext(UserTemplateContext);
  const tpl = tplState.template;
  const options = useContext(PrintOptionsContext);
  const catalog = useContext(CatalogContext);
  const [busy, setBusy] = useState<string | null>(null);
  const [checked, setChecked] = useState(0);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => {
    setLines([]);
    setNote(null);
  }, [kit]);
  if (!kit || !state.book) return null;
  const count = kitRegistryCount(state.book, kit);
  // Сводка «не хватает документов» — предупреждение, сборку не блокирует.
  const shortage: { act: string | null; label: string; status: Status }[] = catalog ? kitShortage(tpl, catalog, state.book, kit) : [];

  const showIssues = async (issues: Issue[]) => {
    setLines(await sheetIssueLines(port, issues));
  };

  /** 0.32: реестр комплекта сверяется с актами сам; перестраивается, только если документы изменились
   *  (ручные «Листов», «Экз.» и сканы — на те же документы). Возвращает книгу после сверки. */
  const sync = async (k: string, book: Book): Promise<{ book: Book; text: string; issues: Issue[] }> => {
    if (!tplState.ready) return { book, text: "", issues: [] };
    // В отфильтрованной таблице вставка задела бы скрытые строки других комплектов.
    if (await port.isFiltered("РеестрИД")) await port.clearFilters("РеестрИД");
    const r = await syncRegistry(port, book, k, tpl);
    if (!r.changed) return { book, text: "", issues: r.issues };
    const parts = [r.added && `добавлено ${r.added}`, r.removed && `убрано ${r.removed}`].filter(Boolean).join(", ");
    return { book: await readBook(port), text: `Реестр комплекта ${k} обновлён из актов${parts ? ` (${parts})` : ""}.`, issues: [] };
  };

  const fill = async () => {
    if (!tplState.ready) {
      setNote({ text: "Шаблоны ещё не загружены с сервера — попробуйте через несколько секунд.", error: true });
      return;
    }
    setBusy("fill");
    setLines([]);
    setNote(null);
    try {
      const r = await sync(kit, state.book!);
      if (r.issues.length) await showIssues(r.issues);
      else setNote({ text: r.text || `Реестр комплекта ${kit} уже совпадает с актами: строк ${kitRegistryCount(state.book!, kit)}.` });
      if (r.text) state.refresh();
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
      const r = await guard(printForm(state.book!, "", state.important, tpl.id, b.key, b.doc, where, options), (m) => setNote({ text: m, error: true }));
      if (r?.issues.length) await showIssues(r.issues);
      if (r?.job?.warnings.length) setNote({ text: `${r.job.name}: ${r.job.warnings.join(". ")}`, error: true });
    } else {
      const issues = await guard(printAct(state.book!, "", state.important, b.doc as PrintKind, template, options, where), (m) =>
        setNote({ text: m, error: true }),
      );
      if (issues?.length) await showIssues(issues);
    }
    setBusy(null);
  };
  const kitButtons = templateButtons(tpl, "kit");

  const build = async () => {
    setBusy("build");
    setChecked((n) => n + 1);
    setLines([]);
    setNote(null);
    let synced: Awaited<ReturnType<typeof sync>>;
    try {
      synced = await sync(kit, state.book!);
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
      setBusy(null);
      return;
    }
    if (synced.text) state.refresh();
    const r = await guard(assembleKit(synced.book, kit, state.important, template, options, tpl), (m) => setNote({ text: m, error: true }));
    if (r?.kind === "issues") await showIssues(r.issues);
    if (r?.kind === "files") setLines(kitIssueLines(r.issues, await port.tableSheetOffset("РеестрИД").catch(() => undefined)));
    if (r?.kind === "ok") {
      setNote({ text: `${synced.text ? synced.text + " " : ""}Комплект собран: ${r.name}, страниц ${r.pages}.` });
      openPreview(previewUrl(`/api/kit-jobs/${r.id}`, location.origin));
    }
    setBusy(null);
  };

  // Общий реестр ИД: все комплекты книги одним реестром (после подписания всей ИД).
  const common = async () => {
    setBusy("common");
    setLines([]);
    setNote(null);
    let book = state.book!;
    let updated = 0;
    try {
      // Реестр собирается сам — сверяются все комплекты книги, в том числе ещё без строк реестра.
      for (const k of new Set((book.tables["Комплекты"] ?? []).map((r) => cellText(r.v.number)).filter(Boolean))) {
        const x = await sync(k, book);
        if (x.text) updated++;
        book = x.book;
      }
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
      setBusy(null);
      return;
    }
    if (updated) state.refresh();
    const r = await guard(assembleCommonRegistry(book, state.important, template, options, tpl), (m) => setNote({ text: m, error: true }));
    if (r?.kind === "empty") setNote({ text: "Ни у одного комплекта нет строк в «Реестре ИД» — добавьте акты в «Акты комплектов».", error: true });
    if (r?.kind === "issues") await showIssues(r.issues);
    if (r?.kind === "ok") {
      setNote({
        text:
          (updated ? `Реестры комплектов обновлены из актов: ${updated}. ` : "") +
          `Общий реестр: комплектов ${r.kits}, документов ${r.docs}, листов ${r.sheets}.` +
          (r.warnings.length ? ` Листы не посчитаны (взяты из графы «Листов» или пусто): ${r.warnings.join("; ")}` : ""),
        error: r.warnings.length > 0,
      });
      openPreview(previewUrl(`/api/common-registry-jobs/${r.id}`, location.origin));
    }
    setBusy(null);
  };
  const allKits = [...new Set((state.book.tables["Комплекты"] ?? []).map((r) => cellText(r.v.number)).filter(Boolean))];

  return (
    <div className="extras">
      <h3 className="tools-title">Комплект {kit}</h3>
      <div className="row-actions">
        <button className="btn" onClick={() => void port.filterBy("АктыКомплектов", "Комплект", kit)}>
          Акты комплекта
        </button>
        <button className="btn" onClick={() => void port.filterBy("РеестрИД", "Комплект", kit)}>
          Реестр: {count}
        </button>
      </div>
      <div className="row-actions">
        <button className="btn" disabled={busy !== null} onClick={() => void fill()} title="Реестр собирается из актов сам — при сборке комплекта">
          {busy === "fill" ? "Сверяю…" : "Обновить из актов"}
        </button>
        <button
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() => void build()}
          title="Реестр сверяется с актами, проверка перед сдачей, документы актов и реестр — одним PDF"
        >
          {busy === "build" ? "Собираю…" : "Сдать: собрать комплект"}
        </button>
      </div>
      <div className="row-actions">
        <button
          className="btn"
          disabled={busy !== null || !allKits.length}
          onClick={() => void common()}
          title="Все комплекты книги одним реестром: документы подряд по комплектам, сквозная нумерация, PDF и Excel"
        >
          {busy === "common" ? "Собираю общий реестр…" : `Общий реестр (комплектов: ${allKits.length})`}
        </button>
      </div>
      {kitButtons.length > 0 && (
        <>
          <h3 className="tools-title">Документы комплекта</h3>
          <div className="row-actions" aria-label="Печать документов комплекта">
            {kitButtons.map((b) => (
              <button key={b.key} className="btn" disabled={busy !== null} onClick={() => void print(b)} title={b.form ? "По своей форме шаблона" : undefined}>
                {busy === b.key ? "Готовлю…" : b.label}
                {b.form ? " ✎" : ""}
              </button>
            ))}
          </div>
        </>
      )}
      {shortage.length > 0 && (
        <div className="warn" role="status" style={{ display: "block", padding: "6px 8px" }}>
          <b>{shortageText(shortage.length)}</b> — сборку это не блокирует.
          <ul className="list">
            {shortage.map((s, i) => (
              <li key={i}>
                {s.act ? (
                  <button className="btn btn-link" onClick={() => void port.filterBy("РеестрИД", "Акт", s.act!)}>
                    акт {s.act}
                  </button>
                ) : (
                  <span>комплект</span>
                )}
                <span>{statusText(s.status, s.label)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <PreDelivery port={port} state={state} acts={kitActs(state.book!, kit).acts} what="комплект" trigger={checked} />
      {busy === "build" && <p className="notice">Печатаю документы и склеиваю комплект — это может занять минуту.</p>}
      <IssueList port={port} lines={lines} title="Перед сборкой исправьте:" />
      {note && (
        <p className={note.error ? "error" : "notice"} role="status">
          {note.text}
        </p>
      )}
    </div>
  );
}
