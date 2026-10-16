import { createRoot } from "react-dom/client";
import { ExcelPort } from "./book/excelPort.ts";
import { Panel } from "./panel/Panel.tsx";

declare const Office: { onReady: (cb: () => void) => void } | undefined;

function start() {
  createRoot(document.getElementById("root")!).render(<Panel port={new ExcelPort()} />);
}

// Внутри Excel ждём готовности Office.js; в обычном браузере запускаемся сразу (панель покажет, что нужен Excel).
if (typeof Office !== "undefined" && Office?.onReady) Office.onReady(start);
else start();
