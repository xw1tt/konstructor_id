// 0.38: сводка по объекту для главного экрана окна программы — акты по готовности, комплекты, документы качества,
// ОЖР и то, что требует внимания (акты, которые не собираются, и замечания проверки перед сдачей).
import type { Book } from "../workbook/records.ts";
import type { ImportantMap } from "../workbook/important.ts";
import type { Issue } from "../workbook/bundle.ts";
import { buildBundle } from "../workbook/bundle.ts";
import { checkActs } from "../check/predelivery.ts";
import { cellText, parseDateCell } from "../workbook/values.ts";
import { actsOverview } from "./overview.ts";

export interface AttentionItem extends Issue {
  act: string;
  level: "critical" | "warn";
}

export interface ObjectSummary {
  name: string;
  address: string;
  codes: string[];
  acts: { total: number; ready: number; warn: number; blocked: number };
  kits: { total: number; withRegistry: number };
  quality: { total: number; noScan: number; expiring: number };
  ojrDays: number;
  attention: AttentionItem[];
  /** Всего замечаний (в attention — первые limit). */
  attentionTotal: number;
}

const iso = (v: Parameters<typeof parseDateCell>[0]) => {
  const p = parseDateCell(v);
  return p.ok ? (p.value ?? "") : "";
};

export function objectSummary(book: Book, important: ImportantMap, today: string, limit = 8): ObjectSummary {
  const rows = (t: keyof Book["tables"]) => book.tables[t] ?? [];
  const list = actsOverview(book, important, today);
  const count = (s: string) => list.filter((a) => a.status === s).length;

  const kits = [
    ...new Set(
      rows("Комплекты")
        .map((r) => cellText(r.v.number))
        .filter(Boolean),
    ),
  ];
  const withRegistry = kits.filter((k) => rows("РеестрИД").some((r) => cellText(r.v.kit) === k)).length;

  // Документ качества «истекает», если действует меньше, чем идут работы по актам книги.
  const lastWork = list.reduce((m, a) => {
    const r = rows("Акты").find((x) => x.row === a.row);
    const end = r ? iso(r.v.dateEnd) : "";
    return end > m ? end : m;
  }, "");
  const docs = rows("ДокументыКачества").filter((r) => cellText(r.v.number) || cellText(r.v.type));
  const noScan = docs.filter((r) => !r.link.file && !cellText(r.v.file)).length;
  const expiring = docs.filter((r) => {
    const until = iso(r.v.validUntil);
    return !!until && !!lastWork && until < lastWork;
  }).length;

  const attention: AttentionItem[] = [];
  for (const a of list.filter((x) => x.status === "blocked")) {
    const first = buildBundle(book, a.number, important).issues[0];
    if (first) attention.push({ ...first, act: a.number, level: "critical" });
  }
  const warnings = checkActs(
    book,
    list.filter((a) => a.status === "warn").map((a) => a.number),
    today,
  );
  for (const w of warnings) attention.push({ ...w, level: "warn" });

  return {
    name: cellText(book.object.name),
    address: cellText(book.object.address),
    codes: rows("Шифры")
      .map((r) => cellText(r.v.code))
      .filter(Boolean),
    acts: { total: list.length, ready: count("ready"), warn: count("warn"), blocked: count("blocked") },
    kits: { total: kits.length, withRegistry },
    quality: { total: docs.length, noScan, expiring },
    ojrDays: new Set(
      rows("ОЖР3")
        .map((r) => iso(r.v.date))
        .filter(Boolean),
    ).size,
    attention: attention.slice(0, limit),
    attentionTotal: attention.length,
  };
}
