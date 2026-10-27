// Окно предпросмотра: показывает PDF, адрес которого передан в ?src=…, и ссылку на тот же документ в Excel (Word).
declare const Office: any;

/**
 * Ссылка «Скачать Excel» по адресу PDF: документ печати, своя форма (тип файла формы) или комплект (архив).
 * file — имя файла по имени PDF (сервер присылает то же имя; атрибут download — на случай, если окно его не прочтёт).
 */
export function editableLink(src: string, formType: string | null, pdfName = ""): { href: string; label: string; file: string } | null {
  const base = pdfName.replace(/\.pdf$/i, "");
  const file = (ext: string) => (base ? `${base}${ext}` : "");
  if (/^\/api\/print-jobs\/[^/?]+\/[^/?]+$/.test(src)) return { href: `${src}?format=xlsx`, label: "Скачать Excel", file: file(".xlsx") };
  if (/^\/api\/form-jobs\/[^/?]+$/.test(src)) {
    const word = formType === "docx";
    return { href: `${src}/source`, label: word ? "Скачать Word" : "Скачать Excel", file: file(word ? ".docx" : ".xlsx") };
  }
  if (/^\/api\/kit-jobs\/[^/?]+$/.test(src)) return { href: `${src}/xlsx`, label: "Скачать Excel (архив)", file: file(" (Excel).zip") };
  if (/^\/api\/common-registry-jobs\/[^/?]+$/.test(src)) return { href: `${src}/xlsx`, label: "Скачать Excel", file: file(".xlsx") };
  return null;
}

function showEditable(src: string, formType: string | null, pdfName: string) {
  const a = document.getElementById("xl") as HTMLAnchorElement | null;
  const l = editableLink(src, formType, pdfName);
  if (!a || !l) return;
  a.href = l.href;
  a.textContent = l.label;
  if (l.file) a.download = l.file;
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
      showEditable(src, null, name);
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
    showEditable(src, r.headers.get("x-source-type"), name);
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
