import { createRoot } from "react-dom/client";
import { ExcelPort } from "./book/excelPort.ts";
import { newRowsDefaults } from "./book/defaults.ts";
import { Panel, type PanelSlots } from "./panel/Panel.tsx";
import { CardArea } from "./panel/card/RowCard.tsx";
import { CreateBook } from "./panel/CreateBook.tsx";
import { TABLE_NAMES } from "@idk/shared/workbook/schema";
import { restoreWidth, trackWidth } from "./panel/panelWidth.ts";
import { PanelGuard } from "./panel/PanelGuard.tsx";

declare const Office: { onReady: (cb: () => void) => void } | undefined;

const port = new ExcelPort();

const slots: PanelSlots = {
  create: (state, missing, flow) => (
    <CreateBook port={port} state={state} missing={missing} full={missing.length === TABLE_NAMES.length} flow={flow} />
  ),
  card: (state) => <CardArea port={port} state={state} />,
  onRowsAdded: async (state, table, first, n) => {
    if (!state.book) return;
    const list = newRowsDefaults(table, state.book, n);
    for (let i = 0; i < n; i++) if (Object.keys(list[i]).length) await port.write(table, first + i, list[i]);
  },
};

let started = false;
function start() {
  if (started) return;
  started = true;
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  restoreWidth(typeof Office !== "undefined" ? Office : undefined, storage);
  trackWidth(window, storage);
  createRoot(document.getElementById("root")!).render(<PanelGuard><Panel port={port} slots={slots} /></PanelGuard>);
}

// Внутри Excel ждём готовности Office.js; в обычном браузере запускаемся сразу (панель покажет, что нужен Excel).
if (typeof Office !== "undefined" && Office?.onReady) {
  Office.onReady(start);
  // Office.js не ответил (нет интернета до appsforoffice.microsoft.com, сбой Excel) — сказать об этом, а не молчать.
  setTimeout(() => {
    const b = document.getElementById("boot");
    if (!started && b) b.textContent = "Excel не ответил панели за 20 секунд. Закройте и снова откройте панель; если не поможет — проверьте интернет (Office.js загружается с сайта Microsoft) и перезапустите Excel.";
  }, 20000);
} else start();
