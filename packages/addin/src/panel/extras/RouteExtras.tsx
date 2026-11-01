// Дополнение карточки листа «Схемы трасс»: проверка схемы, превью листа, ведомость длин,
// сохранение PDF в «Исполнительные схемы» (оттуда — в реестр и комплект как скан схемы).
import { useEffect, useMemo, useState } from "react";
import { routeFromBook } from "@idk/shared/scheme/fromBook";
import { renderRouteSvg } from "@idk/shared/scheme/render";
import { KIND_NAMES, routeTotals } from "@idk/shared/scheme/route";
import type { ExcelPort } from "../../book/excelPort.ts";
import { useGuard } from "../../server.tsx";
import type { BookState } from "../useBook.ts";
import { sheetIssueLines, type IssueLine } from "../print.ts";
import { previewUrl } from "../kit.ts";
import { saveSchemePdf } from "../scheme.ts";
import { IssueList } from "./IssueList.tsx";

declare const Office: any;

function openPreview(url: string) {
  if (typeof Office !== "undefined" && Office?.context?.ui?.displayDialogAsync) {
    Office.context.ui.displayDialogAsync(url, { height: 90, width: 70, displayInIframe: false });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

const len = (m: number) => m.toFixed(1).replace(".", ",");

export function RouteExtras({ port, state, number }: { port: ExcelPort; state: BookState; number: string }) {
  const guard = useGuard();
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const build = useMemo(() => (state.book && number ? routeFromBook(state.book, number) : null), [state.book, number]);
  const view = useMemo(() => (build?.scheme ? renderRouteSvg(build.scheme) : null), [build]);

  useEffect(() => {
    setNote(null);
    let live = true;
    if (!build?.issues.length) { setLines([]); return; }
    void sheetIssueLines(port, build.issues).then((l) => { if (live) setLines(l); });
    return () => { live = false; };
  }, [build]);

  if (!state.book) return null;
  if (!number) return <p className="muted extras">Укажите номер схемы — появится превью листа.</p>;

  const save = async () => {
    if (!build?.scheme || !state.book) return;
    setBusy(true);
    setNote(null);
    const r = await guard(saveSchemePdf(port, state.book, number, build.scheme, location.origin), (m) => setNote({ text: m, error: true }));
    setBusy(false);
    if (!r) return;
    setNote({ text: r.added ? "Схема добавлена в «Исполнительные схемы» со сканом PDF." : "PDF схемы обновлён в «Исполнительных схемах»." });
    state.refresh();
    openPreview(previewUrl(`/api/files/${r.file.id}`, location.origin));
  };

  return (
    <div className="extras">
      <IssueList port={port} lines={lines} title={build?.scheme ? "Замечания по схеме:" : `Схему «${number}» не нарисовать:`} tone={build?.scheme ? "warn" : undefined} />
      {view && build?.scheme && (
        <>
          <p className="muted">Лист {build.scheme.format}, масштаб 1:{view.scale}{build.scheme.scale ? "" : " (подобран)"}</p>
          {view.warnings.map((w) => <p key={w} className="error" role="status">{w}</p>)}
          <div className="route-preview" aria-label={`Превью схемы ${number}`} dangerouslySetInnerHTML={{ __html: view.svg }} />
          <ul className="list route-totals">
            {routeTotals(build.scheme).map((t) => (
              <li key={t.kind + t.mark}>{KIND_NAMES[t.kind]}{t.mark ? ` ${t.mark}` : ""} — {len(t.length)} м</li>
            ))}
          </ul>
          <div className="row-actions">
            <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Сохраняю…" : "Сохранить PDF в «Исполнительные схемы»"}
            </button>
            <button className="btn" onClick={() => void port.activateSheet("Исполнительные схемы")}>Исполнительные схемы</button>
          </div>
        </>
      )}
      {note && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
    </div>
  );
}
