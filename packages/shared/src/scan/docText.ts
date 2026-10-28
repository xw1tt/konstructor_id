// Распознавание скана документа качества: из текста (слой PDF или OCR Windows) — вид, номер, даты, изготовитель.
// Правила — без нейросети; с нейросетью — запрос и разбор ответа JSON. Результат — черновик для проверки человеком.
import { QUALITY_DOC_LABELS, QUALITY_DOC_TYPES } from "../roles.ts";

export interface DocFields {
  /** Вид — подпись из списка книги («Сертификат соответствия»…). */
  type: string | null;
  number: string | null;
  /** ГГГГ-ММ-ДД */
  issueDate: string | null;
  validUntil: string | null;
  manufacturer: string | null;
}

const LABELS = QUALITY_DOC_TYPES.map((t) => QUALITY_DOC_LABELS[t]);
const MONTHS = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];

/** «12.03.2025», «12.03.25», «12 марта 2025 г.» → ГГГГ-ММ-ДД. */
export function parseRuDate(s: string): string | null {
  let m = /(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return valid(y, Number(m[2]), Number(m[1]));
  }
  m = /(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i.exec(s);
  if (m) {
    const w = m[2].toLowerCase();
    const i = MONTHS.findIndex((p, k) => (k === 4 ? /^ма[яй]$/.test(w) : w.startsWith(p)));
    if (i >= 0) return valid(Number(m[3]), i + 1, Number(m[1]));
  }
  return null;
}
function valid(y: number, mo: number, d: number): string | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const DATE_RE = /\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})(?!\d)|\d{1,2}\s+[а-яё]+\s+\d{4}/gi;

/** Поля по правилам: ключевые слова вида, номер после «№», даты рядом с «выдан/дата» и «действителен/по». */
export function docFieldsByRules(text: string): DocFields {
  const t = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const low = t.toLowerCase();
  const type =
    /сертификат[а-яё]*\s+соответстви/.test(low) ? "Сертификат соответствия"
      : /деклараци[а-яё]*\s+о\s+соответстви/.test(low) ? "Декларация о соответствии"
        : /отказн[а-яё]*\s+письм|не\s+подлежит\s+обязательн/.test(low) ? "Отказное письмо"
          : /информационн[а-яё]*\s+письм/.test(low) ? "Информационное письмо"
            : /паспорт|качества|сертификат\s+качества/.test(low) ? "Паспорт качества" : null;
  // Номер: регистрационный номер ЕАЭС / РОСС — приоритетно, иначе первое «№ …».
  const reg = /(ЕАЭС\s*(?:N|№)?\s*RU\s*[A-ZА-Я]-[A-ZА-Я]{2}\.[A-ZА-Я0-9]{2,6}\.[A-ZА-Я]\.\d{4,6}\/\d{2}|РОСС\s*RU[\s.][A-ZА-Я0-9.]+|RU\s*[CД]-[A-ZА-Я]{2}\.[A-ZА-Я0-9.]+\/\d{2})/i.exec(t);
  let number: string | null = null;
  if (reg) number = `№${reg[1].replace(/\s+/g, " ").replace(/^ЕАЭС\s*(?:N|№)\s*/i, "ЕАЭС ")}`;
  else {
    const m = /(?:№|N\s?º|N(?=\s*\d))\s*([A-ZА-Яа-яЁё0-9][\wА-Яа-яЁё./\\-]{1,40})/.exec(t);
    if (m) number = `№${m[1].replace(/[.,]$/, "")}`;
  }
  const near = (re: RegExp) => {
    const m = re.exec(t);
    if (!m) return null;
    const tail = t.slice(m.index, m.index + 120);
    const d = tail.match(DATE_RE);
    return d ? parseRuDate(d[0]) : null;
  };
  // «срок действия с 11.06.2021 по 10.06.2026» — период: начало — дата документа, конец — срок действия.
  const D = DATE_RE.source;
  const period = new RegExp(`(?:с|c)\\s*(${D})\\s*(?:г\\.?\\s*)?(?:по|до)\\s*(${D})`, "i").exec(t);
  const validUntil = period ? parseRuDate(period[2]) : near(/((?:действ[а-яё]*|действителен)\s*(?:до|по)|по\s+(?=\d{1,2}[./])|срок\s+действия|действителен)/i);
  let issueDate = near(/(дата\s+(?:выдачи|регистрации|изготовления|выпуска)|выдан|зарегистрирован[а-яё]*)/i)
    ?? (period ? parseRuDate(period[1]) : null) ?? near(/от\s+(?=\d{1,2}[./\s])/i);
  if (!issueDate) {
    const all = (t.match(DATE_RE) ?? []).map(parseRuDate).filter((x): x is string => !!x).filter((x) => x !== validUntil).sort();
    issueDate = all[0] ?? null;
  }
  const man = /(?:изготовитель|производитель|завод-изготовитель)[:\s]+([^\n]{3,120})/i.exec(t);
  const manufacturer = man ? man[1].replace(/\s*(?:место нахождения|адрес|ОГРН|ИНН).*$/i, "").trim().replace(/[,;.]$/, "") || null : null;
  return { type, number, issueDate, validUntil: validUntil && issueDate && validUntil < issueDate ? null : validUntil, manufacturer };
}

/** Запрос к нейросети: вернуть JSON с полями. Текст обрезается — документ качества умещается в первые страницы. */
export function docFieldsPrompt(text: string, material: string): { system: string; user: string } {
  return {
    system: "Ты извлекаешь реквизиты документа качества строительного материала (паспорт, сертификат, декларация, письмо) из распознанного текста. " +
      `Ответь ТОЛЬКО объектом JSON без пояснений: {"type": одно из ${JSON.stringify(LABELS)} или null, "number": номер документа как в документе с префиксом «№» или null, ` +
      '"issueDate": дата документа (выдачи, регистрации) "ГГГГ-ММ-ДД" или null, "validUntil": срок действия "ГГГГ-ММ-ДД" или null, "manufacturer": изготовитель кратко или null}. ' +
      "Не выдумывай: чего нет в тексте — null. Текст после OCR может содержать ошибки распознавания.",
    user: `Материал: ${material || "не указан"}\nТекст документа:\n${text.slice(0, 12000)}`,
  };
}

/** Ответ нейросети → поля (лишнее отбрасывается, даты и вид проверяются). */
export function parseDocFieldsAnswer(answer: string): DocFields | null {
  const m = /\{[\s\S]*\}/.exec(answer);
  if (!m) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]); } catch { return null; }
  const s = (v: unknown) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : null);
  const date = (v: unknown) => { const x = s(v); return x ? (/^\d{4}-\d{2}-\d{2}$/.test(x) ? x : parseRuDate(x)) : null; };
  const type = s(o.type);
  const number = s(o.number);
  return {
    type: type && LABELS.includes(type) ? type : null,
    number: number ? (number.startsWith("№") ? number : `№${number.replace(/^N\s*/, "")}`) : null,
    issueDate: date(o.issueDate), validUntil: date(o.validUntil), manufacturer: s(o.manufacturer),
  };
}

/** Нейросеть — главная, правила дополняют пропуски. */
export function mergeFields(ai: DocFields | null, rules: DocFields): DocFields {
  if (!ai) return rules;
  return {
    type: ai.type ?? rules.type, number: ai.number ?? rules.number, issueDate: ai.issueDate ?? rules.issueDate,
    validUntil: ai.validUntil ?? rules.validUntil, manufacturer: ai.manufacturer ?? rules.manufacturer,
  };
}

/** Текст пригоден (не пустой слой PDF из одних картинок). */
export const hasText = (text: string) => (text.match(/[А-Яа-яЁёA-Za-z]/g) ?? []).length >= 60;

// ---------- 0.29: документ и материалы по скану ----------

export interface IdentifyMat { name: string; mark?: string; article?: string; manufacturer?: string }

/** Запрос: реквизиты документа и номера материалов книги, к которым он относится. images — модель видит скан. */
export function docIdentifyPrompt(text: string, mats: IdentifyMat[], hasImages: boolean): { system: string; user: string } {
  const list = mats.slice(0, 400).map((m, i) => `${i + 1}. ${[m.name, m.mark, m.article, m.manufacturer].map((x) => (x ?? "").trim()).filter(Boolean).join(" | ")}`).join("\n");
  return {
    system: "Ты специалист ПТО. По документу качества строительного материала (паспорт, сертификат, декларация, письмо) определи его реквизиты и материалы объекта, к которым он относится. " +
      (hasImages ? "Тебе даны изображения страниц документа — читай реквизиты с изображений; распознанный текст ниже может содержать ошибки. " : "Текст получен распознаванием (OCR) и может содержать ошибки: похожие буквы и цифры (О/0, З/3, l/1), латиница вместо кириллицы. ") +
      `Ответь ТОЛЬКО объектом JSON без пояснений: {"type": одно из ${JSON.stringify(LABELS)} или null, "number": номер документа как в документе, с «№», или null, ` +
      '"issueDate": дата документа (выдачи, регистрации, изготовления для паспорта) "ГГГГ-ММ-ДД" или null, "validUntil": срок действия "ГГГГ-ММ-ДД" или null, ' +
      '"manufacturer": изготовитель кратко или null, "materials": [номера материалов из списка, к которым относится документ]}. ' +
      "Материал подходит, если его марка, тип или наименование указаны в документе (сертификат на серию подходит всем сечениям этой серии). Не выдумывай: чего нет — null или пустой список.",
    user: `Материалы объекта:\n${list || "(список пуст)"}\n\nРаспознанный текст документа:\n${text.slice(0, 10000)}`,
  };
}

/** Ответ → поля и номера материалов (с 0, только из списка). */
export function parseIdentifyAnswer(answer: string, count: number): { fields: DocFields; materials: number[] } | null {
  const fields = parseDocFieldsAnswer(answer);
  if (!fields) return null;
  let materials: number[] = [];
  try {
    const o = JSON.parse(/\{[\s\S]*\}/.exec(answer)![0]);
    if (Array.isArray(o.materials)) materials = [...new Set(o.materials.map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= count).map((n: number) => n - 1))] as number[];
  } catch { /* поля есть, материалов нет */ }
  return { fields, materials };
}

/** Даты, которых не может быть: документ из будущего, срок действия раньше даты документа. */
export function saneDates(f: DocFields, today: string): { fields: DocFields; warnings: string[] } {
  const warnings: string[] = [];
  const out = { ...f };
  if (out.issueDate && out.issueDate > today) { warnings.push(`Дата документа ${out.issueDate.split("-").reverse().join(".")} позже сегодняшней — проверьте`); }
  if (out.issueDate && out.validUntil && out.validUntil < out.issueDate) { warnings.push("Срок действия раньше даты документа — проверьте даты"); }
  return { fields: out, warnings };
}
