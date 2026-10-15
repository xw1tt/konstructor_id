import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

declare const Office: { onReady: (cb: () => void) => void } | undefined;

function start() {
  createRoot(document.getElementById("root")!).render(<App />);
}

// Внутри Excel ждём готовности Office.js; в обычном браузере запускаемся сразу.
if (typeof Office !== "undefined" && Office?.onReady) Office.onReady(start);
else start();
