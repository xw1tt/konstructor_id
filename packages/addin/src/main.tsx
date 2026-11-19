import { createRoot } from "react-dom/client";
import { ExcelPort } from "./book/excelPort.ts";
import { Panel } from "./panel/Panel.tsx";
import { bookSlots } from "./panel/slots.tsx";
import { openInWindow, startBridgeLink } from "./book/bridgeLink.ts";
import { restoreWidth, trackWidth } from "./panel/panelWidth.ts";
import { PanelGuard } from "./panel/PanelGuard.tsx";

declare const Office: { onReady: (cb: () => void) => void } | undefined;

const port = new ExcelPort();

const slots = bookSlots(port);

let started = false;
function start() {
  if (started) return;
  started = true;
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  restoreWidth(typeof Office !== "undefined" ? Office : undefined, storage);
  trackWidth(window, storage);
  // 0.36: панель — посредник окна программы: выполняет его вызовы в этой книге.
  if (port.isSupported()) startBridgeLink(port);
  createRoot(document.getElementById("root")!).render(
    <PanelGuard>
      <Panel port={port} slots={slots} shell={{ onOpenWindow: (screen) => openInWindow(screen === "wizard" ? "home" : screen) }} />
    </PanelGuard>,
  );
}

// Внутри Excel ждём готовности Office.js; в обычном браузере запускаемся сразу (панель покажет, что нужен Excel).
if (typeof Office !== "undefined" && Office?.onReady) {
  Office.onReady(start);
  // Office.js не ответил (нет интернета до appsforoffice.microsoft.com, сбой Excel) — сказать об этом, а не молчать.
  setTimeout(() => {
    const b = document.getElementById("boot");
    if (!started && b)
      b.textContent =
        "Excel не ответил панели за 20 секунд. Закройте и снова откройте панель; если не поможет — проверьте интернет (Office.js загружается с сайта Microsoft) и перезапустите Excel.";
  }, 20000);
} else start();
