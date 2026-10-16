// Реестр нормативов: распознавание обозначений и адреса официального портала protect.gost.ru.
// Программа не загружает и не хранит тексты нормативов — только строит адрес страницы портала.

export const NORM_KINDS = ["ГОСТ", "ГОСТ Р", "СП", "ТР", "ПУЭ", "Прочее"] as const;
export type NormKind = (typeof NORM_KINDS)[number];
export const NORM_STATUSES = ["Действует", "Заменён", "Отменён"] as const;

export const PORTAL_ORIGIN = "https://protect.gost.ru";
export const MSG_NOT_ON_PORTAL = "Нет на портале";
export const MSG_PORTAL_ONLY = "Можно открывать только страницы protect.gost.ru";

/** Ключ сравнения обозначений: без пробелов, верхний регистр, «ё» как «е». */
export function normKey(designation: string): string {
  return designation.replace(/\s+/g, "").toUpperCase().replace(/Ё/g, "Е");
}

const RE = /(?<!\p{L})(ГОСТ\s*Р|ГОСТ|ТР\s*ТС|СП)\s*(\d(?:[\d./-]*\d)?)|(?<!\p{L})(ПУЭ)(?!\p{L})/giu;

const PREFIX: Record<string, { prefix: string; kind: NormKind }> = {
  "ГОСТР": { prefix: "ГОСТ Р", kind: "ГОСТ Р" },
  "ГОСТ": { prefix: "ГОСТ", kind: "ГОСТ" },
  "ТРТС": { prefix: "ТР ТС", kind: "ТР" },
  "СП": { prefix: "СП", kind: "СП" },
};

/** Обозначения нормативов в тексте — в порядке появления, без повторов. */
export function extractNormativ(text: string): { designation: string; kind: NormKind }[] {
  const out: { designation: string; kind: NormKind }[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(RE)) {
    const item = m[3]
      ? { designation: "ПУЭ", kind: "ПУЭ" as NormKind }
      : (() => {
          const p = PREFIX[normKey(m[1])];
          return { designation: `${p.prefix} ${m[2]}`, kind: p.kind };
        })();
    const k = normKey(item.designation);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** Только https://protect.gost.ru/… (без подмены хоста, порта и учётных данных в адресе). */
export function isPortalUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return false; }
  return u.protocol === "https:" && u.hostname === "protect.gost.ru" && u.port === "" && !u.username && !u.password;
}

export type PortalTarget = { ok: true; url: string } | { ok: false; message: string };

const SECTION: Partial<Record<string, string>> = { "ГОСТ": "gost", "ГОСТ Р": "gost", "СП": "sp", "ТР": "tr" };

/** Адрес страницы портала для строки реестра: сохранённая ссылка или поиск по обозначению. */
export function portalTarget(row: { designation: string; kind: string; link: string }): PortalTarget {
  const link = row.link.trim();
  if (link) return isPortalUrl(link) ? { ok: true, url: link } : { ok: false, message: MSG_PORTAL_ONLY };
  const section = SECTION[row.kind.trim()];
  const designation = row.designation.trim();
  if (!section || !designation) return { ok: false, message: MSG_NOT_ON_PORTAL };
  return { ok: true, url: `${PORTAL_ORIGIN}/${section}?search=${encodeURIComponent(designation)}` };
}
