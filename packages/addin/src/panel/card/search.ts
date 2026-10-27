// Поиск значения ссылки (материал, акт, организация…) в карточке строки: все слова запроса — в любом порядке, без
// учёта регистра, «ё» = «е», пробелы и знаки «х/x», «,/.» в марках не мешают.
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[×x]/g, "х").replace(/,/g, ".").replace(/\s+/g, " ").trim();

/** Подходящие варианты: сначала начинающиеся с запроса, затем содержащие все его слова; не больше limit. */
export function searchOptions(options: readonly string[], query: string, limit = 50): string[] {
  const q = norm(query);
  if (!q) return options.slice(0, limit);
  const words = q.split(" ");
  const hits = options.filter((o) => { const n = norm(o); return words.every((w) => n.includes(w)); });
  const starts = hits.filter((o) => norm(o).startsWith(q));
  return [...starts, ...hits.filter((o) => !starts.includes(o))].slice(0, limit);
}
