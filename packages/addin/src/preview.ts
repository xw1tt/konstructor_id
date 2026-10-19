// Окно предпросмотра: показывает PDF, адрес которого передан в ?src=…
declare const Office: any;

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
    frame.src = url;
  } catch (e) {
    msg.hidden = false;
    msg.textContent = (e as Error).message || "Сервер не запущен";
    frame.hidden = true;
  }
}

if (typeof Office !== "undefined" && Office?.onReady) Office.onReady(() => void show());
else void show();
