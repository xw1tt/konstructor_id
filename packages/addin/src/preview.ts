// Окно предпросмотра: показывает PDF, адрес которого передан в ?src=…, и ссылку на тот же документ в Excel (Word).
declare const Office: any;

/** Ссылка «Скачать Excel» по адресу PDF: документ печати, своя форма (тип файла формы) или комплект (архив). */
export function editableLink(src: string, formType: string | null): { href: string; label: string } | null {
  if (/^\/api\/print-jobs\/[^/?]+\/[^/?]+$/.test(src)) return { href: `${src}?format=xlsx`, label: "Скачать Excel" };
  if (/^\/api\/form-jobs\/[^/?]+$/.test(src)) return { href: `${src}/source`, label: formType === "docx" ? "Скачать Word" : "Скачать Excel" };
  if (/^\/api\/kit-jobs\/[^/?]+$/.test(src)) return { href: `${src}/xlsx`, label: "Скачать Excel (архив)" };
  return null;
}

function showEditable(src: string, formType: string | null) {
  const a = document.getElementById("xl") as HTMLAnchorElement | null;
  const l = editableLink(src, formType);
  if (!a || !l) return;
  a.href = l.href;
  a.textContent = l.label;
  a.hidden = false;
}

async function show() {
  const src = new URLSearchParams(location.search).get("src") ?? "";
  const frame = document.getElementById("pdf") as HTMLIFrameElement;
  const msg = document.getElementById("msg")!;
  const dl = document.getElementById("dl") as HTMLAnchorElement;
  if (!src.startsWith("/api/")) {
    msg.hidden = false;
    msg.textContent = "Не указан документ для предпросмотра.";
    frame.hidden = true;
    return;
  }
  // Комплект (десятки МБ сканов) открываем по прямой ссылке: копию в памяти (blob) встроенный просмотрщик
  // окна Excel не показывает. Сервер хранит готовый комплект, повторный запрос его не пересобирает.
  if (src.startsWith("/api/kit-jobs/")) {
    try {
      const r = await fetch(src);
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `Ошибка сборки (${r.status})`);
      void r.body?.cancel();
      const name = decodeURIComponent((r.headers.get("content-disposition") ?? "").split("''")[1] ?? "komplekt.pdf");
      document.getElementById("title")!.textContent = name.replace(/\.pdf$/, "");
      document.title = name;
      dl.href = `${src}?download=1`;
      dl.removeAttribute("download");
      const open = document.getElementById("open") as HTMLAnchorElement;
      open.href = src;
      open.hidden = false;
      showEditable(src, null);
      frame.src = src;
    } catch (e) {
      msg.hidden = false;
      msg.textContent = (e as Error).message || "Сервер не запущен";
      frame.hidden = true;
    }
    return;
  }
  try {
    const r = await fetch(src);
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `Ошибка печати (${r.status})`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const name = decodeURIComponent((r.headers.get("content-disposition") ?? "").split("''")[1] ?? "document.pdf");
    document.getElementById("title")!.textContent = name.replace(/\.pdf$/, "");
    document.title = name;
    dl.href = url;
    dl.download = name;
    showEditable(src, r.headers.get("x-source-type"));
    frame.src = url;
  } catch (e) {
    msg.hidden = false;
    msg.textContent = (e as Error).message || "Сервер не запущен";
    frame.hidden = true;
  }
}

if (typeof document !== "undefined") {
  if (typeof Office !== "undefined" && Office?.onReady) Office.onReady(() => void show());
  else void show();
}
