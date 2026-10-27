// Создание книги объекта (листы и таблицы, строки-примеры) и восстановление разметки.
import { useState } from "react";
import type { TableName } from "@idk/shared/workbook/schema";
import { writeBook } from "@idk/shared/workbook/write";
import { loadImportant } from "@idk/shared/workbook/important";
import type { ExcelPort, MergeReport } from "../book/excelPort.ts";
import type { BookState } from "./useBook.ts";
import type { CreateFlow } from "./Panel.tsx";
import { exampleRows } from "@idk/shared/workbook/examples";

type Step = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "done"; text: string };

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
      await withExamples();
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "idle" });
      if (fullMode) flow.finish();
    }
  };

  /** Новая книга: строки-примеры во всех таблицах. */
  const withExamples = async () => {
    setStep({ kind: "busy", text: "Добавляю строки-примеры…" });
    try {
      await writeBook(port, exampleRows(), {});
    } catch (e) {
      setError(`Примеры не добавлены: ${(e as Error).message}`);
    }
    flow.finish();
  };

  if (!fullMode) {
    return (
      <div className="banner" role="alert">
        <p>{missing.length ? <>В книге нет таблиц: {missing.join(", ")}. Книга прежней версии или таблица удалена — обновите разметку</>
          : <>Книга размечена прежней версией программы — обновите разметку</>}: программа добавит недостающие листы, таблицы,
          столбцы и значения списков, данные не изменятся.</p>
        <p className="muted">Книга до версии 0.27: листы «Спецификация» и «Документы качества» сводятся в одну таблицу «Материалы» —
          позиция РКЦ и до трёх документов качества в строке материала. Старые таблицы сохраняются на скрытом листе-архиве.</p>
        <button className="btn" disabled={step.kind === "busy"} onClick={() => void create()}>Обновить разметку</button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <main className="content">
      <h2 className="app-title">Книга объекта</h2>
      <p>В этой книге ещё нет листов конструктора. Программа создаст листы «Реквизиты», «Представители», «Материалы»
        (материал, позиция РКЦ и документы качества — в одной строке), «База актов», «Исполнительные схемы», «ВОР», «Кабельный журнал», «Изоляция»,
        «Комплекты», «Реестр ИД». В каждой таблице будет строка-пример, а при выделении ячейки — подсказка, что в неё вносить.</p>
      {step.kind === "idle" && <button className="btn btn-primary" onClick={() => void create()}>Создать книгу объекта</button>}
      {step.kind === "busy" && <p className="notice">{step.text}</p>}
      {step.kind === "done" && <p className="notice">{step.text}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}

/** Итог переноса книги прежней версии (план 31): что сведено и что не поместилось. */
export function MergeNote({ merge, onClose }: { merge: MergeReport; onClose: () => void }) {
  return (
    <div className="banner" role="status">
      <p>Разметка обновлена: документы качества ({merge.docs}) и позиции спецификации ({merge.positions}) перенесены в таблицу «Материалы».
        Прежние таблицы — на скрытом листе «{merge.backup}».</p>
      {merge.problems.length > 0 && (
        <>
          <p className="warn">Не перенесено — внесите вручную (данные есть в архиве):</p>
          <ul className="list warn">{merge.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </>
      )}
      <button className="btn" onClick={onClose}>Понятно</button>
    </div>
  );
}
