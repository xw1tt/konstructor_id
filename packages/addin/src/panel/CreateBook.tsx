// Создание книги объекта (листы и таблицы), перенос данных из базы сервера, восстановление разметки.
import { useState } from "react";
import type { TableName } from "@idk/shared/workbook/schema";
import { ExportData, exportToBook, exportLinks, writeBook, isEmptyExport } from "@idk/shared/workbook/migrate";
import { loadImportant } from "@idk/shared/workbook/important";
import type { ExcelPort } from "../book/excelPort.ts";
import { apiGet, ServerUnavailableError } from "../api.ts";
import type { BookState } from "./useBook.ts";
import type { CreateFlow } from "./Panel.tsx";
import { exampleRows } from "@idk/shared/workbook/examples";

type Step = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "offer"; data: ExportData } | { kind: "done"; text: string };

export function CreateBook({ port, state, missing, full, flow }: {
  port: ExcelPort; state: BookState; missing: TableName[]; full: boolean; flow: CreateFlow;
}) {
  // Полное создание держит экран открытым до конца (flow); восстановление разметки — нет.
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [error, setError] = useState("");
  const [fullMode] = useState(full);

  const create = async () => {
    setError("");
    setStep({ kind: "busy", text: "Создаю листы…" });
    if (fullMode) flow.start();
    try {
      await port.ensureBook(await loadImportant(port));
      if (!fullMode) { setStep({ kind: "done", text: "Разметка обновлена." }); state.refresh(); return; }
      let data: ExportData | null = null;
      try {
        data = ExportData.parse(await apiGet("/api/export"));
      } catch (e) {
        if (!(e instanceof ServerUnavailableError)) throw e;
      }
      if (data && !isEmptyExport(data)) setStep({ kind: "offer", data });
      else await withExamples();
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "idle" });
      if (fullMode) flow.finish();
    }
  };

  /** Новая книга без переноса: строки-примеры во всех таблицах. */
  const withExamples = async () => {
    setStep({ kind: "busy", text: "Добавляю строки-примеры…" });
    try {
      await writeBook(port, exampleRows(), {});
    } catch (e) {
      setError(`Примеры не добавлены: ${(e as Error).message}`);
    }
    flow.finish();
  };

  const migrate = async (data: ExportData) => {
    setStep({ kind: "busy", text: "Переношу данные…" });
    try {
      await writeBook(port, exportToBook(data, location.origin), exportLinks(data, location.origin));
      flow.finish();
    } catch (e) {
      setError(`Перенос прерван: ${(e as Error).message}`);
      setStep({ kind: "idle" });
      flow.finish();
    }
  };

  if (!fullMode) {
    return (
      <div className="banner" role="alert">
        <p>{missing.length ? <>В книге нет таблиц: {missing.join(", ")}. Книга прежней версии или таблица удалена — обновите разметку</>
          : <>Книга размечена прежней версией программы — обновите разметку</>}: программа добавит недостающие листы, таблицы,
          столбцы и значения списков, данные не изменятся.</p>
        <button className="btn" disabled={step.kind === "busy"} onClick={() => void create()}>Обновить разметку</button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <main className="content">
      <h2 className="app-title">Книга объекта</h2>
      <p>В этой книге ещё нет листов конструктора. Программа создаст листы «Реквизиты», «Представители», «Материалы»,
        «Документы качества», «База актов», «Исполнительные схемы», «Материалы в актах», «ВОР», «Кабельный журнал», «Изоляция»,
        «Комплекты», «Реестр ИД». В каждой таблице будет строка-пример, а при выделении ячейки — подсказка, что в неё вносить.</p>
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
            <button className="btn" onClick={() => void withExamples()}>Не переносить</button>
          </div>
        </div>
      )}
      {step.kind === "done" && <p className="notice">{step.text}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
