import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ObjectTab } from "./tabs/ObjectTab.tsx";
import { MaterialsTab } from "./tabs/MaterialsTab.tsx";

declare const Office: { onReady: (cb: () => void) => void } | undefined;

function start() {
  createRoot(document.getElementById("root")!).render(<App tabs={{ "Объект": () => <ObjectTab />, "Материалы": () => <MaterialsTab /> }} />);
}

// Внутри Excel ждём готовности Office.js; в обычном браузере запускаемся сразу.
if (typeof Office !== "undefined" && Office?.onReady) Office.onReady(start);
else start();
