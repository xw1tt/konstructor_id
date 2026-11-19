// 0.33: оформление документа (print.styles) в Excel — шрифт, масштаб кегля и высоты строк по основному тексту,
// жирный/курсив значений нельзя отличить в листе, поэтому не меняются; поля и ориентация — в параметрах страницы.
import { cleanStyle, type DocStyle } from "@idk/shared/docStyle";
import { DEFAULT_SIZE, FONT, type Sheet } from "./book.ts";

export function applyLook(sheet: Sheet, s: Partial<DocStyle> | null | undefined): Sheet {
  const x = cleanStyle(s);
  if (!Object.keys(x).length) return sheet;
  const k = x.size ? x.size / DEFAULT_SIZE : 1;
  for (const cell of sheet.cells.values()) {
    const st = { ...cell.s };
    if (x.font) st.font = x.font;
    else if (!st.font) st.font = FONT;
    if (k !== 1) st.size = Math.round((st.size ?? DEFAULT_SIZE) * k * 2) / 2;
    if (x.tableAlign && st.border && (st.h ?? "left") !== "right") st.h = x.tableAlign;
    cell.s = st;
  }
  if (k !== 1) for (const [r, h] of sheet.heights) sheet.heights.set(r, Math.round(h * k * 10) / 10);
  const m = sheet.page.margins;
  const margins: [number, number, number, number] = [x.marginTop ?? m[0], x.marginRight ?? m[1], x.marginBottom ?? m[2], x.marginLeft ?? m[3]];
  Object.assign(sheet.page, { margins, ...(x.orientation ? { landscape: x.orientation === "landscape" } : {}) });
  return sheet;
}
