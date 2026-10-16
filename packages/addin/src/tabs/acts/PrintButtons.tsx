import { useState } from "react";
import type { Act, DocKind } from "@idk/shared/acts/schemas";
import { ServerUnavailableError } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import { pdfUrl, previewUrl } from "./printUrls.ts";

declare const Office: any;

const DOCS: { kind: DocKind; label: string }[] = [
  { kind: "aosr", label: "АОСР" }, { kind: "rim", label: "РИМ" }, { kind: "vd", label: "ВД" }, { kind: "vor", label: "ВОР" },
];

function openPreview(url: string) {
  if (typeof Office !== "undefined" && Office?.context?.ui?.displayDialogAsync) {
    Office.context.ui.displayDialogAsync(url, { height: 90, width: 70, displayInIframe: false });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export function PrintButtons({ act }: { act: Act }) {
  const guard = useGuard();
  const [busy, setBusy] = useState<DocKind | null>(null);
  const [error, setError] = useState("");

  const open = async (kind: DocKind) => {
    setError("");
    setBusy(kind);
    // Сначала проверяем, что документ печатается, чтобы показать понятную ошибку прямо здесь.
    const ok = await guard((async () => {
      let r: Response;
      try { r = await fetch(pdfUrl(act.id, kind)); } catch { throw new ServerUnavailableError(); }
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `Ошибка печати (${r.status})`);
      return true;
    })(), setError);
    setBusy(null);
    if (ok) openPreview(previewUrl(act.id, kind, location.origin));
  };

  return (
    <div>
      <div className="row-actions" aria-label="Печать документов">
        {DOCS.map((d) => (
          <button key={d.kind} className="btn" disabled={busy !== null} onClick={() => void open(d.kind)}>
            {busy === d.kind ? "Готовлю…" : d.label}
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
