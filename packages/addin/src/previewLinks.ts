// Ссылки «Скачать Excel / Word / архив» по адресу PDF — для страницы предпросмотра и предпросмотра в окне программы.
/**
 * Ссылка «Скачать Excel» по адресу PDF: документ печати, своя форма (тип файла формы) или комплект (архив).
 * file — имя файла по имени PDF (сервер присылает то же имя; атрибут download — на случай, если окно его не прочтёт).
 */
export function editableLink(src: string, formType: string | null, pdfName = ""): { href: string; label: string; file: string } | null {
  const base = pdfName.replace(/\.pdf$/i, "");
  const file = (ext: string) => (base ? `${base}${ext}` : "");
  if (/^\/api\/print-jobs\/[^/?]+\/[^/?]+$/.test(src)) {
    // 0.46.3: документ «Камчатки» (АОСР, реестры) — Word; сервер отдаёт файл по тому же адресу.
    if (formType === "docx") return { href: `${src}?format=xlsx`, label: "Скачать Word", file: file(".docx") };
    if (formType === "any") return { href: `${src}?format=xlsx`, label: "Скачать Word / Excel", file: "" };
    return { href: `${src}?format=xlsx`, label: "Скачать Excel", file: file(".xlsx") };
  }
  if (/^\/api\/form-jobs\/[^/?]+$/.test(src)) {
    const word = formType === "docx";
    return { href: `${src}/source`, label: word ? "Скачать Word" : "Скачать Excel", file: file(word ? ".docx" : ".xlsx") };
  }
  if (/^\/api\/kit-jobs\/[^/?]+$/.test(src)) return { href: `${src}/xlsx`, label: "Скачать Word и Excel (архив)", file: file(" (Word и Excel).zip") };
  if (/^\/api\/common-registry-jobs\/[^/?]+$/.test(src)) return { href: `${src}/xlsx`, label: "Скачать Excel", file: file(".xlsx") };
  return null;
}
