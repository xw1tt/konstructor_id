import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ObjectTab } from "./tabs/ObjectTab.tsx";
import { MaterialsTab } from "./tabs/MaterialsTab.tsx";
import { ActsTab } from "./tabs/ActsTab.tsx";
import { ActMaterials } from "./tabs/acts/ActMaterials.tsx";
import { ActDocuments } from "./tabs/acts/ActDocuments.tsx";
import { VorEditor } from "./tabs/acts/VorEditor.tsx";

declare const Office: { onReady: (cb: () => void) => void } | undefined;

const ACT_SLOTS = {
  materials: (full: any, reload: () => void) => <ActMaterials key={JSON.stringify(full.materials)} full={full} reload={reload} />,
  documents: (full: any, reload: () => void) => <ActDocuments key={JSON.stringify(full.documents)} full={full} reload={reload} />,
  vor: (full: any, reload: () => void) => <VorEditor key={JSON.stringify(full.vor) + full.materials.length} full={full} reload={reload} />,
};

function start() {
  createRoot(document.getElementById("root")!).render(<App tabs={{ "Объект": () => <ObjectTab />, "Материалы": () => <MaterialsTab />, "АОСР": () => <ActsTab slots={ACT_SLOTS} /> }} />);
}

// Внутри Excel ждём готовности Office.js; в обычном браузере запускаемся сразу.
if (typeof Office !== "undefined" && Office?.onReady) Office.onReady(start);
else start();
