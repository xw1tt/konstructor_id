// Простые значки панели (линии, цвет — currentColor): верхняя строка и разделы. При узкой панели (план 21) остаются только они.
import type { SectionId } from "./sections.ts";

const S = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const HomeIcon = () => <svg {...S}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>;
export const GridIcon = () => <svg {...S} width={15} height={15}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 10v10" /></svg>;
export const GearIcon = () => <svg {...S} width={16} height={16}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>;
export const ChevronIcon = () => <svg {...S} width={12} height={12}><path d="M6 9l6 6 6-6" /></svg>;
/** «Норматив» — раскрытая книга. */
export const NormIcon = () => <svg {...S} width={16} height={16}><path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z" /><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" /></svg>;
/** «Библиотека» — корешки на полке. */
export const LibraryIcon = () => <svg {...S} width={16} height={16}><path d="M4 4v16M8 4v16M12 6l4 14M17 5l3 15" /><path d="M3 20h18" /></svg>;
/** «Помощник» — искры. */
export const SparkIcon = () => <svg {...S} width={16} height={16}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></svg>;

const SECTION_PATHS: Record<SectionId, JSX.Element> = {
  requisites: <><path d="M4 20V8l8-4 8 4v12" /><path d="M9 20v-6h6v6M4 20h16" /></>,
  reps: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.5a5 5 0 0 1 5 5.5" /></>,
  acts: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 14l2 2 4-4" /></>,
  spec: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  materials: <><path d="M3 8l9-5 9 5-9 5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  schemes: <><path d="M4 20V4h16v16z" /><path d="M4 14l5-5 4 4 7-7" /></>,
  cables: <><path d="M4 7c4 0 4 10 8 10s4-10 8-10" /><circle cx="4" cy="7" r="1.5" /><circle cx="20" cy="7" r="1.5" /></>,
  kits: <><path d="M3 7h6l2 2h10v11H3z" /><path d="M3 7V5h6" /></>,
  ojr: <><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" /><path d="M5 18a2 2 0 0 1 2-2h12M9 8h6M9 11h4" /></>,
};
export const SectionIcon = ({ id }: { id: SectionId }) => <svg {...S} width={16} height={16}>{SECTION_PATHS[id]}</svg>;
