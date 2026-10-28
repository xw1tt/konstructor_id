// Какие материалы книги относятся к документу качества: совпадения марки, артикула, слов наименования и изготовителя
// в тексте скана. Сравнение — в «плоском» виде: регистр, ё/е, похожие латинские и русские буквы (OCR их путает),
// «х/x/×», «,/.» и пробелы не мешают.
export interface MatInfo { name: string; mark?: string; article?: string; manufacturer?: string }
export interface MatHit { name: string; score: number; why: string[] }

const HOMO: Record<string, string> = { а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", ё: "e" };
/** Плоский вид: нижний регистр, русские буквы, похожие на латинские, — латиницей, «×»→x, «,»→«.». */
export function flat(s: string): string {
  return s.toLowerCase().replace(/[авекмнорстухё]/g, (c) => HOMO[c] ?? c).replace(/[×*]/g, "x").replace(/,/g, ".").replace(/[«»"“”„]/g, "");
}
const compact = (s: string) => flat(s).replace(/[\s\-–—_()\[\]]/g, "");
const STOP = new Set(["для", "или", "при", "мм", "шт", "из", "на", "по", "с", "и", "в", "тип", "марки", "марка", "ooo", "ооо", "зао", "оао", "пао", "ао"].map(flat));
const words = (s: string, min = 3) => flat(s).split(/[^a-zа-я0-9./]+/i).filter((w) => w.length >= min && !STOP.has(w) && !/^\d{1,2}$/.test(w));

/** Оценка 0…1 и причины (для подсказки пользователю). */
export function scoreMaterial(text: string, m: MatInfo): MatHit {
  const ft = flat(text), ct = compact(text);
  const why: string[] = [];
  let score = 0;
  const mark = (m.mark ?? "").trim();
  if (mark.length >= 3) {
    if (ct.includes(compact(mark))) { score += 0.6; why.push(`марка ${mark}`); }
    else {
      // Марка без сечения: «ВВГнг(А)-LS» из «ВВГнг(А)-LS 3х2,5» — в сертификате часто вся серия.
      const base = compact(mark.split(/\s+/)[0]);
      if (base.length >= 3 && ct.includes(base)) { score += 0.4; why.push(`серия ${mark.split(/\s+/)[0]}`); }
    }
  }
  const art = (m.article ?? "").trim();
  if (art.length >= 3 && ct.includes(compact(art))) { score += 0.5; why.push(`артикул ${art}`); }
  const nw = [...new Set(words(m.name, 4))];
  if (nw.length) {
    const hit = nw.filter((w) => ft.includes(w));
    const part = hit.length / nw.length;
    if (part > 0) { score += 0.35 * part; if (part >= 0.5) why.push(`наименование (${hit.length} из ${nw.length} слов)`); }
    // Марка в наименовании (если отдельной марки нет): «Кабель КСПЭВнг(А)-HF 2х2х0,97».
    if (!mark) {
      const tok = m.name.split(/\s+/).find((t) => /[A-Za-zА-Яа-я]{2,}.*[-(]|\d+[хxх×]\d/.test(t) && t.length >= 4);
      if (tok && ct.includes(compact(tok))) { score += 0.3; why.push(`марка ${tok}`); }
    }
  }
  const man = words(m.manufacturer ?? "", 4).filter((w) => !/^(общество|ограниченной|ответственностью|акционерное)$/.test(w));
  if (man.length && man.some((w) => ft.includes(w))) { score += 0.1; why.push("изготовитель"); }
  return { name: m.name, score: Math.min(1, Math.round(score * 100) / 100), why };
}

/** Подходящие материалы по убыванию оценки (от min). */
export function matchMaterials(text: string, mats: MatInfo[], min = 0.3): MatHit[] {
  return mats.map((m) => scoreMaterial(text, m)).filter((h) => h.score >= min).sort((a, b) => b.score - a.score);
}

/** Исправление типичных ошибок OCR в датах: О→0, З→3, l/I/|→1, б→6, пробелы внутри «12 . 03 . 2025». */
export function fixOcrDates(text: string): string {
  return text.replace(/[0-9OОoоЗзlI|бB]{1,2}\s*[./,]\s*[0-9OОoоЗзlI|бB]{1,2}\s*[./,]\s*[0-9OОoоЗзlI|бB]{2,4}/g, (m) => {
    if (!/\d/.test(m)) return m;
    return m.replace(/\s+/g, "").replace(/[OОoо]/g, "0").replace(/[Зз]/g, "3").replace(/[lI|]/g, "1").replace(/б/g, "6").replace(/B/g, "8").replace(/,/g, ".");
  });
}
