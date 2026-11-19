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
import { bundleFor, sheetIssueLines, printAct, printForm, type IssueLine } from "../print.ts";
import { apiSend } from "../../api.ts";
import { IssueList } from "./IssueList.tsx";
import { Completeness } from "./Completeness.tsx";
import { PreDelivery } from "./PreDelivery.tsx";
import { ActMaterials } from "./ActMaterials.tsx";
import { ActSigners } from "./ActSigners.tsx";
import { unboundMaterials } from "@idk/shared/spec/closed";
import type { Issue } from "@idk/shared/workbook/bundle";
import { addNextAct } from "@idk/shared/acts/nextAct";
import { cellText } from "@idk/shared/workbook/values";

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
  const [files, setFiles] = useState<{ id: string; name: string; count: number; words: number; errors: string[] } | null>(null);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(0);
  if (!act || !state.book) return null;
  const sum = actSummary(state.book, act);
  const unbound = unboundMaterials(state.book, act);

  /** 0.32: следующий акт — копия последнего акта того же вида работ (номер +1, даты продолжаются, схемы и материалы). */
  const next = async () => {
    setBusy("next");
    setError("");
    setNote("");
    try {
      if (await port.isFiltered("Акты")) await port.clearFilters("Акты");
      const row = (state.book!.tables["Акты"] ?? []).find((r) => cellText(r.v.baseNumber) === act)?.row;
      if (row === undefined) throw new Error("Акт не найден в «Базе актов»");
      const r = await addNextAct(port, row);
      await port.selectCell("Акты", r.row, "Номер акта");
      setNote(
        `Добавлен акт ${r.number}` +
          (r.schemes || r.materials ? ` (схем: ${r.schemes}, материалов: ${r.materials} — без количества)` : "") +
          ". Проверьте «Работы (п.1)», даты и номера схем.",
      );
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /** 0.35: все документы акта файлами — свои формы заполненными Word/Excel, встроенные — в Excel — одним архивом. */
  const download = async () => {
    setBusy("files");
    setError("");
    setLines([]);
    setFiles(null);
    try {
      const all: Issue[] = [];
      const items = templateButtons(tpl.template).flatMap((b) => {
        const { bundle, issues } = bundleFor(state.book!, act, state.important, b.doc, options);
        if (!bundle) {
          all.push(...issues);
          return [];
        }
        return [{ bundle, kind: b.doc, form: b.form ? { template: tpl.template.id, doc: b.key } : null }];
      });
      if (!items.length) {
        setLines(await sheetIssueLines(port, all));
        return;
      }
      const r = await apiSend<{ id: string; name: string; files: string[]; errors: string[] }>("POST", "/api/act-files", {
        name: `Акт ${act}`,
        options,
        items,
      });
      setFiles({
        id: r.id,
        name: r.name,
        count: r.files.filter((f) => f !== "Ошибки.txt").length,
        words: r.files.filter((f) => /\.docx$/i.test(f)).length,
        errors: r.errors,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const print = async (b: TemplateButton) => {
    setBusy(b.key);
    setChecked((n) => n + 1);
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
      setLines(await sheetIssueLines(port, issues));
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
        <button
          className="btn"
          disabled={busy !== null}
          onClick={() => void next()}
          title="Копия последнего акта этого вида работ: номер +1, работы — со следующего рабочего дня, схемы и материалы акта"
        >
          {busy === "next" ? "Добавляю…" : "+ Следующий акт"}
        </button>
      </div>
      {note && (
        <p className="notice" role="status">
          {note}
        </p>
      )}
      <ActMaterials port={port} state={state} act={act} />
      {unbound.length > 0 && (
        <p className="warn" role="status">
          Не привязаны к спецификации: {unbound.join("; ")}. Укажите «№ п/п РКЦ» в «Материалах» — печать это не блокирует.
        </p>
      )}
      <ActSigners port={port} state={state} act={act} />
      <Completeness port={port} state={state} act={act} />
      <PreDelivery port={port} state={state} acts={[act]} what="акт" trigger={checked} />
      <h3 className="tools-title">Печать</h3>
      <div className="row-actions" aria-label="Печать документов">
        {templateButtons(tpl.template).map((b) => (
          <button key={b.key} className="btn" disabled={busy !== null} onClick={() => void print(b)} title={b.form ? "По своей форме шаблона" : undefined}>
            {busy === b.key ? "Готовлю…" : b.label}
            {b.form ? " ✎" : ""}
          </button>
        ))}
        <button
          className="btn"
          disabled={busy !== null}
          onClick={() => void download()}
          title="Все документы акта файлами для правки и отправки: свои формы — заполненными Word/Excel, встроенные — в Excel"
        >
          {busy === "files" ? "Собираю…" : "Файлы Word/Excel"}
        </button>
      </div>
      {files && (
        <p className="notice" role="status">
          <a href={`/api/act-files/${files.id}`} download={files.name}>
            Скачать {files.name}
          </a>{" "}
          — файлов {files.count}
          {files.words ? `, из них Word ${files.words}` : ""}
          {files.errors.length > 0 && <span className="warn"> · не собраны: {files.errors.join("; ")}</span>}
        </p>
      )}
      {tpl.warning && (
        <p className="warn" role="status">
          {tpl.warning}
        </p>
      )}
      {made && (
        <p className="notice" role="status">
          {made.name}:{" "}
          <a href={`/api/form-jobs/${made.id}/source`} download>
            скачать файл для правки
          </a>
          {made.warnings.length > 0 && (
            <>
              <br />
              <span className="warn">{made.warnings.join(". ")}</span>
            </>
          )}
        </p>
      )}
      <IssueList port={port} lines={lines} title="Перед печатью исправьте:" />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
