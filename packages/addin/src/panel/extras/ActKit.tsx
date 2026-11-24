// 0.52.2: комплект акта прямо в карточке акта (окно и панель): выбрать из имеющихся или «новый». Акт в одном комплекте:
// прежняя строка «Актов комплектов» переносится, новая — в конец состава выбранного комплекта.
import { useState } from "react";
import { cellText } from "@idk/shared/workbook/values";
import { readBook } from "@idk/shared/workbook/records";
import { column } from "@idk/shared/workbook/schema";
import { setActKit } from "@idk/shared/kit/compose";
import type { BookPort } from "../../book/bookPort.ts";
import type { BookState } from "../useBook.ts";

const NEW = "__new__";
const H = (k: string) => column("Комплекты", k).header;

export function ActKit({ port, state, act }: { port: BookPort; state: BookState; act: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const book = state.book!;
  const kits = [...new Set((book.tables["Комплекты"] ?? []).map((r) => cellText(r.v.number)).filter(Boolean))];
  const mine = (book.tables["АктыКомплектов"] ?? []).filter((r) => cellText(r.v.act) === act).map((r) => cellText(r.v.kit));
  const cur = mine[0] ?? "";

  const set = async (choice: string) => {
    setBusy(true);
    setError("");
    try {
      const b = await readBook(port);
      for (const t of ["Комплекты", "АктыКомплектов"] as const) if (await port.isFiltered(t)) await port.clearFilters(t);
      let kit = choice;
      if (choice === NEW) {
        const all = (b.tables["Комплекты"] ?? []).map((r) => cellText(r.v.number)).filter(Boolean);
        const nums = all.map(Number).filter(Number.isFinite);
        kit = String(nums.length ? Math.max(...nums) + 1 : all.length + 1);
        const base = (b.tables["Комплекты"] ?? []).at(-1);
        await port.insert("Комплекты", (b.tables["Комплекты"] ?? []).length, [
          {
            [H("number")]: kit,
            ...(base
              ? { [H("section")]: cellText(base.v.section ?? null), [H("city")]: cellText(base.v.city ?? null), [H("year")]: cellText(base.v.year ?? null) }
              : {}),
          },
        ]);
      }
      await setActKit(port, await readBook(port), act, kit);
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="act-kit">
      <span>Комплект</span>
      <select value={cur} disabled={busy} onChange={(e) => void set(e.target.value)} aria-label="Комплект акта">
        <option value="">— не в комплекте —</option>
        {kits.map((k) => (
          <option key={k} value={k}>
            Комплект {k}
          </option>
        ))}
        <option value={NEW}>+ новый комплект</option>
      </select>
      {mine.length > 1 && <span className="error">акт в нескольких комплектах: {mine.join(", ")} — выберите один</span>}
      {error && <span className="error">{error}</span>}
    </label>
  );
}
