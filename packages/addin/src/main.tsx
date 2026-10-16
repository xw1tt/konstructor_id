import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ObjectTab } from "./tabs/ObjectTab.tsx";
import { MaterialsTab } from "./tabs/MaterialsTab.tsx";
import { ActsTab } from "./tabs/ActsTab.tsx";
import { ActMaterials } from "./tabs/acts/ActMaterials.tsx";
import { ActDocuments } from "./tabs/acts/ActDocuments.tsx";
import { VorEditor } from "./tabs/acts/VorEditor.tsx";
import { PrintButtons } from "./tabs/acts/PrintButtons.tsx";

declare const Office: { onReady: (cb: () => void) => void } | undefined;

const ACT_SLOTS = {
  materials: (full: any, reload: () => void) => <ActMaterials key={full.act.id} full={full} reload={reload} />,
  documents: (full: any, reload: () => void) => <ActDocuments key={full.act.id} full={full} reload={reload} />,
  print: (act: any) => <PrintButtons act={act} />,
  vor: (full: any, reload: () => void) => <VorEditor key={full.act.id} full={full} reload={reload} />,
};

function start() {
  createRoot(document.getElementById("root")!).render(<App tabs={{ "Объект": () => <ObjectTab />, "Материалы": () => <MaterialsTab />, "АОСР": () => <ActsTab slots={ACT_SLOTS} /> }} />);
}

// Внутри Excel ждём готовности Office.js; в обычном браузере запускаемся сразу.
if (typeof Office !== "undefined" && Office?.onReady) Office.onReady(start);
else start();
