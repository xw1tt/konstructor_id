// Простые значки верхней строки (линии, цвет — currentColor).
import type { AssistantIconId } from "./screens.ts";

const S = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const HomeIcon = () => <svg {...S}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>;
export const GridIcon = () => <svg {...S} width={14} height={14}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 10v10" /></svg>;
export const ChevronIcon = () => <svg {...S} width={12} height={12}><path d="M6 9l6 6 6-6" /></svg>;

const PATHS: Record<AssistantIconId, JSX.Element> = {
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  history: <><path d="M4 12a8 8 0 1 0 2.5-5.8" /><path d="M4 4v4h4" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14" /><path d="M12 17h.01" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
};

export const AssistantIcon = ({ id }: { id: AssistantIconId }) => <svg {...S}>{PATHS[id]}</svg>;
