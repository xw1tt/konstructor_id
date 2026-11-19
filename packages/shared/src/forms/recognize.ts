// 0.34: загрузка своей формы в один шаг — по тексту документа заказчика программа узнаёт, какой это документ
// (встроенный вид или свой: название и короткий код). Акт, по которому заполнен образец, выбирает сервер:
// разметка по каждому акту, больше совпавших значений — тот акт.
import { PROTO_DEFS, PROTO_KINDS } from "../protocols/defs.ts";
import type { PrintKind } from "../acts/schemas.ts";

export interface DocGuess {
  /** Встроенный документ или null — свой. */
  kind: PrintKind | null;
  /** Строка документа, по которой узнан (заголовок). */
  title: string;
  /** Для своего — предложенные название и код. */
  name: string;
  code: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Признаки встроенных документов: все слова должны встретиться в одной строке заголовка (или во всём тексте — для коротких). */
const RULES: [PrintKind, RegExp][] = [
  ["aosr", /освидетельствовани[яе] скрытых работ/],
  ["avk", /входного контроля/],
  ["vor", /ведомость (физических )?объем(ов|а) (выполненных )?работ|ведомость объемов/],
  ["vd", /ведомость смонтированного|ведомость (оборудования|материалов|технических средств)/],
  ["rp", /реестр приложений/],
  ["rim", /реестр (применен|исполнительн|материал|документ)/],
  ["kj", /кабельн(ый|ого) журнал/],
  ["ip", /сопротивлени[яе] изоляции/],
];

/** Короткий код из названия: первые буквы значимых слов («Акт гидравлических испытаний» → «АГИ»). */
export function codeFromName(name: string): string {
  const skip = new Set(["и", "в", "на", "по", "о", "об", "для", "с", "со", "к", "от", "при", "из"]);
  const letters = name
    .split(/[\s\-–—,.()«»"]+/)
    .filter((w) => w && !skip.has(w.toLowerCase()) && /^[А-ЯЁа-яёA-Za-z]/.test(w))
    .map((w) => w[0].toUpperCase());
  return letters.join("").slice(0, 6) || "ДОК";
}

const HEAD = /^(акт|протокол|ведомость|журнал|кабельный журнал|реестр|перечень|справка|заключение|паспорт|лист|схема)(?=\s|$|[ .,:№])/;

/** Заголовок документа: первая строка, начинающаяся с «Акт», «Протокол», «Ведомость»… (с продолжением на следующей строке). */
export function findTitle(text: string): string {
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/^[A-Z]+\d+:\s*/, "").trim())
    .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].replace(/\s*№.*$/, "").trim();
    const l = norm(head);
    if (!HEAD.test(l) || l.length > 200) continue;
    // «АКТ» (или «ВЕДОМОСТЬ № 14.4…») отдельной строкой, а «освидетельствования скрытых работ» — следующей.
    const next = lines[i + 1] && !/\d{2}\.\d{2}\.\d{4}|№/.test(lines[i + 1]) && lines[i + 1].length < 160 ? lines[i + 1] : "";
    const t = l.split(" ").length === 1 && next ? `${head} ${next}` : head;
    return t
      .replace(/\s*№.*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

/** Что это за документ — по тексту файла. */
export function guessDoc(text: string): DocGuess {
  const title = findTitle(text);
  const t = norm(title);
  const all = norm(text.slice(0, 6000));
  // Протоколы и акты плана 13 — по полному названию из справочника.
  for (const k of PROTO_KINDS) {
    const n = norm(PROTO_DEFS[k].name)
      .replace(/\(.*?\)/g, "")
      .trim();
    if ((t && t.includes(n.slice(0, 40))) || all.includes(n))
      return { kind: k, title: title || PROTO_DEFS[k].name, name: PROTO_DEFS[k].name, code: PROTO_DEFS[k].code };
  }
  for (const [kind, re] of RULES) if (re.test(t)) return { kind, title, name: sentence(title), code: "" };
  // Заголовок нашёлся, но не встроенный документ — свой (в теле реестра приложений встречаются названия ведомостей).
  if (!title) for (const [kind, re] of RULES) if (re.test(all.slice(0, 1500))) return { kind, title: title || "", name: sentence(title), code: "" };
  const name = sentence(title) || "Свой документ";
  return { kind: null, title, name, code: codeFromName(name) };
}
