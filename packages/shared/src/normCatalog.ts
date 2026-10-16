// Справочник нормативов: разделы портала protect.gost.ru и разбор страниц их списков.
// Читаются только списки (обозначение, наименование, страницы, статус, ссылка на карточку) — не тексты.
import { PORTAL_ORIGIN } from "./normativ.ts";

export const NORM_SECTIONS = [
  { code: "sp", label: "СП", url: `${PORTAL_ORIGIN}/sp` },
  { code: "gost", label: "ГОСТ", url: `${PORTAL_ORIGIN}/gost` },
  { code: "rst", label: "Правила", url: `${PORTAL_ORIGIN}/rst` },
  { code: "classificators", label: "Классиф.", url: `${PORTAL_ORIGIN}/classificators` },
  { code: "tr", label: "Техрегл.", url: `${PORTAL_ORIGIN}/tr` },
  { code: "foundational", label: "Основопол.", url: `${PORTAL_ORIGIN}/foundational` },
] as const;
export type NormSection = (typeof NORM_SECTIONS)[number]["code"];
export const isNormSection = (s: string): s is NormSection => NORM_SECTIONS.some((x) => x.code === s);
export const sectionLabel = (s: NormSection) => NORM_SECTIONS.find((x) => x.code === s)!.label;

/** Состояние обновления справочника (GET /api/norms/refresh). */
export interface RefreshState {
  running: boolean;
  section: NormSection | null;
  page: number;
  pages: number | null;
  error: string | null;
  finishedAt: string | null;
}

/** Строка справочника в ответе GET /api/norms. */
export interface NormItem extends CatalogRow { id: number; section: NormSection }
export interface NormSearchResult {
  total: number;
  counts: Record<NormSection, number>;
  updated: Partial<Record<NormSection, string>>;
  items: NormItem[];
}

export interface CatalogRow { designation: string; title: string; pages: number; status: string; url: string }

const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " ", laquo: "«", raquo: "»", apos: "'", ndash: "–", mdash: "—" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const text = (html: string) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** Ссылка на карточку: абсолютная или относительная, с параметрами после кода или без. */
const DETAILS = /href\s*=\s*["']((?:https?:\/\/[^/"']+)?\/?[a-z]+\/details\/[0-9a-f-]{36}[^"']*)["']/i;
const STATUS = /^(действ|замен|отмен|не действ|приостан|утрат)/i;

/** Отбрасывает значки перед статусом (✓, ↻ и т. п.). */
const cleanStatus = (s: string) => s.replace(/^[^\p{L}]+/u, "").trim();

export function parseListPage(html: string): { rows: CatalogRow[]; totalPages: number | null } {
  const rows: CatalogRow[] = [];
  const seen = new Set<string>();
  for (const tr of html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []) {
    const href = tr.match(DETAILS)?.[1];
    if (!href) continue;
    const path = href.replace(/^https?:\/\/[^/]+/i, "");
    const url = PORTAL_ORIGIN + (path.startsWith("/") ? path : "/" + path);
    if (seen.has(url)) continue;
    const cells = (tr.match(/<td\b[\s\S]*?<\/td>/gi) ?? []).map((td) => ({ html: td, text: text(td) }));
    const linkCell = cells.findIndex((c) => DETAILS.test(c.html));
    if (linkCell < 0) continue;
    const designation = text(cells[linkCell].html.match(/<a\b[\s\S]*?<\/a>/i)?.[0] ?? cells[linkCell].html);
    const rest = cells.filter((_, i) => i !== linkCell);
    const statusCell = rest.find((c) => STATUS.test(cleanStatus(c.text)));
    // Числа после ссылки — страницы (столбец «№» стоит до неё).
    const numbers = cells.filter((c, i) => i > linkCell && /^\d+$/.test(c.text));
    const pages = numbers.length ? Number(numbers[numbers.length - 1].text) : 0;
    const others = rest.filter((c) => c !== statusCell && !/^\d+$/.test(c.text));
    const title = others.reduce((a, c) => (c.text.length > a.length ? c.text : a), "");
    seen.add(url);
    rows.push({ designation, title, pages, status: statusCell ? cleanStatus(statusCell.text) : "", url });
  }
  const pageOf = html.match(/Стр\.\s*\d+\s*из\s*(\d+)/i);
  let totalPages: number | null = pageOf ? Number(pageOf[1]) : null;
  if (totalPages === null) {
    const nums = [...html.matchAll(/[?&]page=(\d+)/gi)].map((m) => Number(m[1]));
    if (nums.length) totalPages = Math.max(...nums);
  }
  return { rows, totalPages };
}

export function statusTone(status: string): "ok" | "replaced" | "other" {
  const s = status.trim().toLowerCase().replace(/ё/g, "е");
  if (s.startsWith("действ")) return "ok";
  if (s.startsWith("замен")) return "replaced";
  return "other";
}
