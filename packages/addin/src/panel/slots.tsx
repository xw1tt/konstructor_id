// Карточка строки, создание книги и значения новых строк — одинаковы в панели Excel и в окне программы (0.36).
import { TABLE_NAMES } from "@idk/shared/workbook/schema";
import type { BookPort } from "../book/bookPort.ts";
import { newRowsDefaults } from "../book/defaults.ts";
import type { PanelSlots } from "./Panel.tsx";
import { CardArea } from "./card/RowCard.tsx";
import { CreateBook } from "./CreateBook.tsx";

export function bookSlots(port: BookPort): PanelSlots {
  return {
    create: (state, missing, flow) => <CreateBook port={port} state={state} missing={missing} full={missing.length === TABLE_NAMES.length} flow={flow} />,
    card: (state) => <CardArea port={port} state={state} />,
    onRowsAdded: async (state, table, first, n) => {
      if (!state.book) return;
      const list = newRowsDefaults(table, state.book, n);
      for (let i = 0; i < n; i++) if (Object.keys(list[i]).length) await port.write(table, first + i, list[i]);
    },
  };
}
