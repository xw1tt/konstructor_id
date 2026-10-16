// Обновление справочника нормативов: обход страниц списков разделов protect.gost.ru.
// Читаются только страницы списков; раздел записывается целиком после успешного обхода всех его страниц.
import type { Db } from "../db.ts";
import { NORM_SECTIONS, parseListPage, type CatalogRow, type RefreshState } from "@idk/shared/normCatalog";
import { normCatalog } from "../repo/normCatalog.ts";

export type { RefreshState };

export const USER_AGENT = "Konstruktor-ID (справочник нормативов)";
export const PAUSE_MS = 300;
export const TIMEOUT_MS = 20_000;
/** Предохранитель от бесконечного обхода, если портал перестанет отдавать пустую страницу. */
const MAX_PAGES = 1000;

const NO_LINK = "Нет связи с порталом protect.gost.ru";
const parseError = (label: string) => `Не удалось разобрать список раздела «${label}» — возможно, портал изменил вёрстку`;

class RefreshError extends Error {}

export interface RefresherDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export function createRefresher(db: Db, deps: RefresherDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => new Date());
  const N = normCatalog(db);
  let state: RefreshState = { running: false, section: null, page: 0, pages: null, error: null, finishedAt: null };
  let current: Promise<void> = Promise.resolve();
  let first = true;

  async function get(url: string): Promise<string> {
    if (!first) await sleep(PAUSE_MS);
    first = false;
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new RefreshError(NO_LINK);
    }
    if (res.status >= 400) throw new RefreshError(NO_LINK);
    const type = res.headers.get("content-type") ?? "";
    const body = await res.text();
    if (type && !/html/i.test(type)) return "";
    return body;
  }

  async function run() {
    first = true;
    try {
      for (const s of NORM_SECTIONS) {
        const rows: CatalogRow[] = [];
        const seen = new Set<string>();
        state = { ...state, section: s.code, page: 0, pages: null };
        for (let page = 1; page <= MAX_PAGES; page++) {
          state = { ...state, page };
          const parsed = parseListPage(await get(`${s.url}?page=${page}`));
          if (parsed.totalPages !== null) state = { ...state, pages: parsed.totalPages };
          if (!parsed.rows.length) {
            if (page === 1) throw new RefreshError(parseError(s.label));
            break;
          }
          for (const r of parsed.rows) if (!seen.has(r.url)) { seen.add(r.url); rows.push(r); }
          if (state.pages !== null && page >= state.pages) break;
        }
        N.replaceSection(s.code, rows, now().toISOString());
      }
      state = { ...state, running: false, section: null, finishedAt: now().toISOString() };
    } catch (e) {
      const msg = e instanceof RefreshError ? e.message : `Ошибка обновления справочника: ${(e as Error).message}`;
      state = { ...state, running: false, error: msg, finishedAt: now().toISOString() };
    }
  }

  return {
    state: (): RefreshState => ({ ...state }),
    /** false — обновление уже идёт. */
    start(): boolean {
      if (state.running) return false;
      state = { running: true, section: null, page: 0, pages: null, error: null, finishedAt: null };
      current = run();
      return true;
    },
    done: () => current,
  };
}
