// Создание книги объекта (листы и таблицы), перенос данных из базы сервера, восстановление разметки.
import { useState } from "react";
import type { TableName } from "@idk/shared/workbook/schema";
import { ExportData, exportToBook, exportLinks, writeBook, isEmptyExport } from "@idk/shared/workbook/migrate";
import { loadImportant } from "@idk/shared/workbook/important";
import type { ExcelPort } from "../book/excelPort.ts";
import { apiGet, ServerUnavailableError } from "../api.ts";
import type { BookState } from "./useBook.ts";

type Step = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "offer"; data: ExportData } | { kind: "done"; text: string };

export function CreateBook({ port, state, missing, full }: { port: ExcelPort; state: BookState; missing: TableName[]; full: boolean }) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [error, setError] = useState("");

  const create = async () => {
    setError("");
    setStep({ kind: "busy", text: "Создаю листы…" });
    try {
      await port.ensureBook(await loadImportant(port));
      if (!full) { setStep({ kind: "done", text: "Разметка восстановлена." }); state.refresh(); return; }
      let data: ExportData | null = null;
      try {
        data = ExportData.parse(await apiGet("/api/export"));
      } catch (e) {
        if (!(e instanceof ServerUnavailableError)) throw e;
      }
      if (data && !isEmptyExport(data)) setStep({ kind: "offer", data });
      else { setStep({ kind: "done", text: "Книга объекта создана." }); state.refresh(); }
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "idle" });
    }
  };

  const migrate = async (data: ExportData) => {
    setStep({ kind: "busy", text: "Переношу данные…" });
    try {
      await writeBook(port, exportToBook(data, location.origin), exportLinks(data, location.origin));
      setStep({ kind: "done", text: "Данные перенесены в книгу." });
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "idle" });
    }
    state.refresh();
  };

  if (!full) {
    return (
      <div className="banner" role="alert">
        <p>Таблица не найдена: {missing.join(", ")}.</p>
        <button className="btn" disabled={step.kind === "busy"} onClick={() => void create()}>Восстановить разметку</button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <main className="content">
      <h2 className="app-title">Книга объекта</h2>
      <p>В этой книге ещё нет листов конструктора. Программа создаст листы «Реквизиты», «Представители», «Материалы»,
        «Документы качества», «База актов», «Исполнительные схемы», «Материалы в актах», «ВОР», «Кабельный журнал».</p>
      {step.kind === "idle" && <button className="btn btn-primary" onClick={() => void create()}>Создать книгу объекта</button>}
      {step.kind === "busy" && <p className="notice">{step.text}</p>}
      {step.kind === "offer" && (
        <div className="confirm" role="alertdialog" aria-label="Перенос данных">
          <p>
            В базе есть данные (организаций {step.data.organizations.length}, материалов {step.data.materials.length},
            актов {step.data.acts.length}). Перенести в книгу?
          </p>
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => void migrate(step.data)}>Перенести</button>
            <button className="btn" onClick={() => { setStep({ kind: "done", text: "Книга объекта создана." }); state.refresh(); }}>Не переносить</button>
          </div>
        </div>
      )}
      {step.kind === "done" && <p className="notice">{step.text}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
