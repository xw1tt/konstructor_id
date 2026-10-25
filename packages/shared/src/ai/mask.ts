// План 19: маска ФИО для зарубежных подключений — в ответах инструментов ФИО из «Представителей» заменяются на [ФИО-N],
// в предложениях модели [ФИО-N] заменяются обратно.
import { cellText } from "../workbook/values.ts";
import type { Book } from "../workbook/records.ts";

export class NameMask {
  private names: string[] = [];
  constructor(book: Book | null, readonly enabled: boolean) {
    if (!enabled || !book) return;
    const set = new Set((book.tables["Представители"] ?? []).map((r) => cellText(r.v.fullName)).filter((n) => n.length >= 3));
    // Длинные первыми: «Иванов И.И.» не должен заменяться частью «Иванов».
    this.names = [...set].sort((a, b) => b.length - a.length);
  }
  private token = (i: number) => `[ФИО-${i + 1}]`;

  mask(s: string): string {
    let out = s;
    this.names.forEach((n, i) => { out = out.split(n).join(this.token(i)); });
    return out;
  }
  unmask(s: string): string {
    return s.replace(/\[ФИО-(\d+)\]/g, (m, d: string) => this.names[Number(d) - 1] ?? m);
  }
  /** Глубокая замена в строках объекта (аргументы инструмента). */
  unmaskDeep<T>(v: T): T {
    if (typeof v === "string") return this.unmask(v) as T;
    if (Array.isArray(v)) return v.map((x) => this.unmaskDeep(x)) as T;
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.unmaskDeep(x)])) as T;
    return v;
  }
}
