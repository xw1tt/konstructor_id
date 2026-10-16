// Дополнение карточки кабельного журнала: итог длин кабеля по акту строки.
import type { BookState } from "../useBook.ts";
import { cableTotal } from "./summaries.ts";

export function CableExtras({ state, act }: { state: BookState; act: string }) {
  if (!act || !state.book) return null;
  return <p className="extras muted">Длина кабеля по акту {act}: {String(cableTotal(state.book, act)).replace(".", ",")} м</p>;
}
