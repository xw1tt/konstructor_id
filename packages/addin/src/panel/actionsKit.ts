// 0.49: действия программы для помощника. Без изменения книги — сразу (печать, проверка, навигация, папка сканов,
// распознавание скана); меняющие книгу или собирающие комплект — предложением propose_action, выполняются при применении
// по порядку (после правок книги), каждое читает книгу заново.
import type { ToolCall, ToolDef } from "@idk/shared/ai/model";
import type { Proposal, ToolContext } from "@idk/shared/ai/tools";
import type { PrintOptions, TemplateCode } from "@idk/shared/templates";
import type { PrintKind } from "@idk/shared/acts/schemas";
import type { UserTemplate } from "@idk/shared/forms/template";
import type { ImportantMap } from "@idk/shared/workbook/important";
import { readBook, type Book } from "@idk/shared/workbook/records";
import { cellText } from "@idk/shared/workbook/values";
import { column, type TableName } from "@idk/shared/workbook/schema";
import { kitActs, syncRegistry } from "@idk/shared/kit/registry";
import { planKitActs } from "@idk/shared/kit/compose";
import { syncOjr, ojrPrintRequest } from "@idk/shared/ojr";
import { addNextAct } from "@idk/shared/acts/nextAct";
import { allActs, checkActs } from "@idk/shared/check/predelivery";
import { QUALITY_DOC_LABELS, QUALITY_DOC_TYPES } from "@idk/shared/roles";
import type { BookPort } from "../book/bookPort.ts";
import { apiSend } from "../api.ts";
import { docState, openPreview, printAct, printForm } from "./print.ts";
import { templateButtons } from "./templatesApi.ts";
import { assembleCommonRegistry, assembleKit, previewUrl } from "./kit.ts";
import { relinkScans } from "./relinkScans.tsx";
import { addQualityDoc } from "./extras/addDoc.ts";
import type { ToolKit } from "./assistant.ts";
import type { ScreenId } from "./screens.ts";

export interface ActionEnv {
  port: BookPort;
  important(): ImportantMap;
  code(): TemplateCode;
  options(): PrintOptions;
  template(): UserTemplate;
  /** Перейти к экрану или строке книги в окне программы. */
  open(screen: ScreenId, at?: { table: TableName; row: number | null; column: string }): void;
  /** Итог действия — в чат и в историю разговора (модель его видит). */
  report(text: string): void;
  refresh(): void;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const str = (description: string) => ({ type: "string", description });
const strs = (description: string) => ({ type: "array", items: { type: "string" }, description });
const json = (v: unknown) => JSON.stringify(v);
const err = (message: string) => json({ error: message });

export const ACTIONS = [
  "create_kit",
  "set_kit_acts",
  "fill_registry",
  "build_kit",
  "build_common_registry",
  "fill_ojr",
  "next_act",
  "relink_scans",
  "add_quality_doc",
] as const;
type Action = (typeof ACTIONS)[number];

const SCREENS: ScreenId[] = ["overview", "home", "acts", "delivery", "assistant", "templates", "fields", "normativ", "library", "settings"];

export const ACTION_TOOLS: ToolDef[] = [
  { name: "list_kits", description: "Комплекты ИД книги: номер, том, акты по порядку, строк реестра, замечаний перед сдачей.", parameters: obj({}) },
  {
    name: "list_act_documents",
    description: "Документы акта по шаблону книги (ключ doc для print_document) и готовность каждого: печатается, нужны данные (с причинами), не нужен.",
    parameters: obj({ act: str("Номер акта") }, ["act"]),
  },
  {
    name: "print_document",
    description:
      "Сформировать документ и открыть пользователю предпросмотр (PDF; оттуда — скачать PDF и Word/Excel). Документ акта — act и doc из list_act_documents; документ комплекта (протоколы «на комплект») — kit и doc. Книгу не меняет.",
    parameters: obj(
      { act: str("Номер акта"), kit: str("Номер комплекта (для документов на комплект)"), doc: str("Ключ документа из list_act_documents, например aosr") },
      ["doc"],
    ),
  },
  {
    name: "print_ojr",
    description:
      "Сформировать общий журнал работ (раздел 3 или 5) по текущим таблицам ОЖР и открыть предпросмотр. Если журнал не совпадает с актами — сначала propose_action fill_ojr.",
    parameters: obj({ section: { type: "integer", enum: [3, 5] } }, ["section"]),
  },
  {
    name: "check_before_delivery",
    description:
      "Проверка перед сдачей (как кнопка «Проверить все акты»): сроки документов качества, полномочия подписантов, даты, сканы. Без acts — все акты.",
    parameters: obj({ acts: strs("Номера актов (необязательно)") }),
  },
  {
    name: "open_in_window",
    description: `Показать пользователю экран программы (${SCREENS.join(", ")}) или строку книги (table и row из read_rows — откроется карточка строки).`,
    parameters: obj({
      screen: str("Экран"),
      table: str("Таблица (для строки)"),
      row: { type: "integer", description: "Номер строки из read_rows" },
      column: str("Поле"),
    }),
  },
  {
    name: "list_scan_folder",
    description: "Файлы «Папки сканов» объекта (PDF, JPG, PNG, с подпапками): путь относительно папки. Отбор — по части имени или пути.",
    parameters: obj({ contains: str("Часть имени (необязательно)"), limit: { type: "integer", description: "До 500, по умолчанию 100" } }),
  },
  {
    name: "identify_scan",
    description:
      "Распознать скан документа качества из папки сканов (путь из list_scan_folder): вид, номер, даты, листы и материалы книги, к которым он относится. Книгу не меняет — затем propose_action add_quality_doc.",
    parameters: obj({ file: str("Путь файла из list_scan_folder") }, ["file"]),
  },
  {
    name: "propose_action",
    description: [
      "Предложить действие программы (пользователь применит). action:",
      "create_kit — новый комплект (number — по умолчанию следующий; volume, part, section — шифр, works — перечень работ);",
      "set_kit_acts — состав комплекта kit: acts по порядку (заменяет прежний состав), реестр сверяется;",
      "fill_registry — обновить реестр комплекта kit из актов;",
      "build_kit — собрать комплект kit (реестр, сквозная нумерация, один PDF);",
      "build_common_registry — общий реестр всех комплектов;",
      "fill_ojr — заполнить ОЖР (разделы 3 и 5) из актов;",
      "next_act — следующий акт по образцу act (номер +1, даты продолжаются, схемы и материалы без количества);",
      "relink_scans — привязать сканы книги к файлам этого компьютера (книга с другого компьютера);",
      `add_quality_doc — документ качества со сканом file (путь из list_scan_folder): type (${QUALITY_DOC_TYPES.map((t) => QUALITY_DOC_LABELS[t]).join(" | ")}), number, date и valid (ДД.ММ.ГГГГ), sheets, materials — наименования из «Материалов».`,
    ].join(" "),
    parameters: obj(
      {
        action: { type: "string", enum: [...ACTIONS] },
        kit: str("Номер комплекта"),
        act: str("Номер акта"),
        acts: strs("Номера актов по порядку"),
        number: str("Номер нового комплекта"),
        volume: str("Том"),
        part: str("Часть"),
        section: str("Шифр"),
        works: str("Перечень работ"),
        file: str("Путь скана из list_scan_folder"),
        type: str("Вид документа качества"),
        docNumber: str("Номер документа качества"),
        date: str("Дата документа"),
        valid: str("Действует до"),
        sheets: str("Листов"),
        materials: strs("Наименования материалов"),
      },
      ["action"],
    ),
  },
];

const word = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
const today = () => new Date().toISOString().slice(0, 10);
const issueText = (i: { table: string; row: number | null; column: string; message: string }) =>
  `«${i.table}»${i.row !== null ? `, строка ${i.row + 1}` : ""}, «${i.column}»: ${i.message}`;
const isoDate = (s: string) => {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s.trim();
};
const kitsOf = (b: Book) => [...new Set((b.tables["Комплекты"] ?? []).map((r) => cellText(r.v.number)).filter(Boolean))];
const actsOf = (b: Book) => allActs(b);

interface Uploaded {
  id: number;
  sha256: string;
  name: string;
}
/** Файл папки сканов → в хранилище программы (как «Привязать сканы»). */
async function uploadFromFolder(b: Book, file: string): Promise<Uploaded> {
  const { items } = await apiSend<{ items: (({ ok: true } & Uploaded) | { ok: false; message: string })[] }>("POST", "/api/files/relink", {
    scanFolder: cellText(b.object.scanFolder ?? null),
    items: [{ link: null, name: file }],
  });
  const a = items[0];
  if (!a || !a.ok) throw new Error(a && !a.ok ? a.message : `Файл «${file}» не найден в папке сканов`);
  return a;
}

export function actionsKit(env: ActionEnv): ToolKit {
  /** Состав комплекта: учитывает комплекты, предложенные раньше в этом же ответе. */
  const proposedKits = (ctx: ToolContext) =>
    ctx.proposals.flatMap((p) => (p.change.kind === "action" && p.change.action === "create_kit" ? [String(p.change.args.number)] : []));

  const describe = (ctx: ToolContext, a: Record<string, unknown>): { lines: string[]; args: Record<string, unknown> } | string => {
    const b = ctx.book;
    const action = String(a.action ?? "") as Action;
    const kits = [...kitsOf(b), ...proposedKits(ctx)];
    const acts = actsOf(b);
    const needKit = () => {
      const k = cellText((a.kit as string) ?? null);
      if (!k) return "Укажите kit — номер комплекта";
      if (!kits.includes(k)) return `Нет комплекта «${k}». Комплекты: ${kits.join(", ") || "нет"} (новый — create_kit)`;
      return k;
    };
    switch (action) {
      case "create_kit": {
        const nums = kits.map(Number).filter(Number.isFinite);
        const number = cellText((a.number as string) ?? null) || String(nums.length ? Math.max(...nums) + 1 : kits.length + 1);
        if (kits.includes(number)) return `Комплект «${number}» уже есть`;
        const args = { number, volume: a.volume ?? "", part: a.part ?? "", section: a.section ?? "", works: a.works ?? "" };
        const extra = [args.volume && `том ${args.volume}`, args.part && `часть ${args.part}`, args.section && `шифр ${args.section}`]
          .filter(Boolean)
          .join(", ");
        return { args, lines: [`Создать комплект ${number}${extra ? ` (${extra})` : ""}.`, ...(args.works ? [`Перечень работ: ${String(args.works)}`] : [])] };
      }
      case "set_kit_acts": {
        const k = needKit();
        if (k !== cellText((a.kit as string) ?? null)) return k;
        const list = (Array.isArray(a.acts) ? a.acts : []).map((x) => cellText(String(x))).filter(Boolean);
        const bad = list.filter((x) => !acts.includes(x));
        if (bad.length) return `Нет актов: ${bad.join(", ")} — номера точно как в «Актах» (read_rows)`;
        const before = kitActs(b, k).acts;
        return {
          args: { kit: k, acts: [...new Set(list)] },
          lines: [
            `Состав комплекта ${k}: ${list.length} ${word(list.length, "акт", "акта", "актов")} по порядку — ${list.join(", ") || "пусто"}.`,
            ...(before.length ? [`Было: ${before.join(", ")}.`] : []),
            "Реестр комплекта сверится с новым составом.",
          ],
        };
      }
      case "fill_registry":
      case "build_kit": {
        const k = needKit();
        if (k !== cellText((a.kit as string) ?? null)) return k;
        return {
          args: { kit: k },
          lines: [
            action === "fill_registry"
              ? `Обновить реестр комплекта ${k} из актов.`
              : `Собрать комплект ${k}: реестр, сквозная нумерация, один PDF (откроется предпросмотр).`,
          ],
        };
      }
      case "build_common_registry":
        return { args: {}, lines: ["Собрать общий реестр по всем комплектам с реестром."] };
      case "fill_ojr":
        return { args: {}, lines: ["Заполнить общий журнал работ (разделы 3 и 5) из актов."] };
      case "next_act": {
        const act = cellText((a.act as string) ?? null);
        if (!acts.includes(act)) return `Нет акта «${act}» — номер точно как в «Актах»`;
        return {
          args: { act },
          lines: [`Добавить следующий акт по образцу ${act}: номер +1, даты продолжаются, схемы и материалы — без количества. Без отмены.`],
        };
      }
      case "relink_scans":
        return { args: {}, lines: ["Привязать сканы книги к файлам этого компьютера («Папка сканов» и хранилище программы). Без отмены."] };
      case "add_quality_doc": {
        const file = cellText((a.file as string) ?? null);
        const type = cellText((a.type as string) ?? null);
        const number = cellText((a.docNumber as string) ?? null);
        const materials = (Array.isArray(a.materials) ? a.materials : []).map((x) => cellText(String(x))).filter(Boolean);
        const names = new Set((b.tables["Материалы"] ?? []).map((r) => cellText(r.v.name)));
        if (!file) return "Укажите file — путь скана из list_scan_folder";
        if (!QUALITY_DOC_TYPES.some((t) => QUALITY_DOC_LABELS[t] === type))
          return `Вид документа — один из: ${QUALITY_DOC_TYPES.map((t) => QUALITY_DOC_LABELS[t]).join(", ")}`;
        if (!number) return "Укажите docNumber";
        if (!materials.length) return "Укажите materials — наименования из «Материалов»";
        const bad = materials.filter((m) => !names.has(m));
        if (bad.length) return `Нет материалов: ${bad.join("; ")} — наименования точно как в «Материалах»`;
        const args = {
          file,
          type,
          number,
          date: cellText((a.date as string) ?? null),
          valid: cellText((a.valid as string) ?? null),
          sheets: cellText((a.sheets as string) ?? null) || "1",
          materials,
        };
        return {
          args,
          lines: [
            `${type} № ${number}${args.date ? ` от ${args.date}` : ""}${args.valid ? `, действует до ${args.valid}` : ""}, листов ${args.sheets}; скан «${file}».`,
            `Материалы: ${materials.join("; ")}.`,
          ],
        };
      }
      default:
        return `Нет действия «${String(a.action)}». Есть: ${ACTIONS.join(", ")}`;
    }
  };

  const exec = async (call: ToolCall, ctx: ToolContext): Promise<string | null> => {
    const a = call.arguments ?? {};
    const b = ctx.book;
    switch (call.name) {
      case "list_kits":
        return json(
          kitsOf(b).map((k) => {
            const row = (b.tables["Комплекты"] ?? []).find((r) => cellText(r.v.number) === k);
            const acts = kitActs(b, k).acts;
            return {
              kit: k,
              volume: cellText(row?.v.volume ?? null),
              section: cellText(row?.v.section ?? null),
              acts,
              registryRows: (b.tables["РеестрИД"] ?? []).filter((r) => cellText(r.v.kit) === k).length,
              warnings: acts.length ? checkActs(b, acts, today()).length : 0,
            };
          }),
        );
      case "list_act_documents": {
        const act = cellText((a.act as string) ?? null);
        if (!actsOf(b).includes(act)) return err(`Нет акта «${act}»`);
        return json(
          templateButtons(env.template()).map((x) => {
            const s = docState(b, act, env.important(), x.doc, env.options());
            return {
              doc: x.key,
              label: x.label,
              state: s.state === "ok" ? "печатается" : s.state === "absent" ? "не нужен" : "нужны данные",
              ...(s.issues.length ? { issues: s.issues.slice(0, 8).map(issueText) } : {}),
            };
          }),
        );
      }
      case "print_document": {
        const key = cellText((a.doc as string) ?? null);
        const act = cellText((a.act as string) ?? null);
        const kit = cellText((a.kit as string) ?? null);
        const btn = [...templateButtons(env.template()), ...templateButtons(env.template(), "kit")].find((x) => x.key === key);
        if (!btn) return err(`Нет документа «${key}» в шаблоне — смотри list_act_documents`);
        const where = kit ? { kit } : { act };
        if (!kit && !actsOf(b).includes(act)) return err(`Нет акта «${act}»`);
        if (btn.form) {
          const r = await printForm(b, act, env.important(), env.template().id, btn.key, btn.doc, where, env.options());
          if (r.issues.length) return json({ printed: false, issues: r.issues.slice(0, 15).map(issueText) });
          return json({ printed: true, name: r.job?.name, warnings: r.job?.warnings ?? [], note: "Предпросмотр открыт у пользователя" });
        }
        const issues = await printAct(b, act, env.important(), btn.doc as PrintKind, env.code(), env.options(), where);
        if (issues.length) return json({ printed: false, issues: issues.slice(0, 15).map(issueText) });
        return json({ printed: true, note: "Предпросмотр открыт у пользователя (оттуда — скачать PDF и Word/Excel)" });
      }
      case "print_ojr": {
        const section = Number(a.section) === 5 ? 5 : 3;
        const q = ojrPrintRequest(b, section);
        if (!q) return err(`Раздел ${section} пуст — предложи fill_ojr`);
        const r = await apiSend<{ id: string }>("POST", "/api/ojr-jobs", q);
        openPreview(previewUrl(`/api/ojr-jobs/${r.id}`, location.origin));
        return json({ printed: true, note: "Предпросмотр открыт у пользователя" });
      }
      case "check_before_delivery": {
        const list = Array.isArray(a.acts) && a.acts.length ? a.acts.map((x) => cellText(String(x))) : actsOf(b);
        const w = checkActs(b, list, today());
        return ctx.mask.mask(json({ acts: list.length, warnings: w.length, items: w.slice(0, 60).map((x) => `${x.act}: ${issueText(x)}`) }));
      }
      case "open_in_window": {
        const table = cellText((a.table as string) ?? null) as TableName;
        if (table) {
          if (!(table in (b.tables as object)) && !b.missing.includes(table)) return err(`Нет таблицы «${table}»`);
          const row = a.row === undefined || a.row === null ? null : Number(a.row) - 1;
          env.open("home", { table, row, column: cellText((a.column as string) ?? null) });
          return json({ ok: true });
        }
        const screen = String(a.screen ?? "") as ScreenId;
        if (!SCREENS.includes(screen)) return err(`Экраны: ${SCREENS.join(", ")}`);
        env.open(screen);
        return json({ ok: true });
      }
      case "list_scan_folder": {
        const folder = cellText(b.object.scanFolder ?? null);
        if (!folder) return err("В «Объекте» не указана «Папка сканов»");
        const r = await apiSend<{ total: number; files: { path: string; size: number }[] }>("POST", "/api/files/folder", {
          scanFolder: folder,
          contains: cellText((a.contains as string) ?? null),
          limit: Math.min(500, Math.max(1, Number(a.limit) || 100)),
        });
        return json({ total: r.total, files: r.files.map((f) => f.path) });
      }
      case "identify_scan": {
        const file = cellText((a.file as string) ?? null);
        if (!file) return err("Укажите file");
        const up = await uploadFromFolder(b, file);
        const mats = (b.tables["Материалы"] ?? [])
          .map((m) => ({ name: cellText(m.v.name), mark: cellText(m.v.mark), article: cellText(m.v.article), manufacturer: cellText(m.v.manufacturer) }))
          .filter((m) => m.name);
        const r = await apiSend<{
          fields: { type?: string; number?: string; issueDate?: string; validUntil?: string };
          pages: number;
          warnings: string[];
          materials: { name: string; checked: boolean; why: string[] }[];
        }>("POST", `/api/files/${up.id}/identify`, { materials: mats, today: today() });
        const ru = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join(".") : (s ?? ""));
        return json({
          file,
          type: r.fields.type ?? "",
          number: r.fields.number ?? "",
          date: ru(r.fields.issueDate),
          valid: ru(r.fields.validUntil),
          sheets: r.pages || 1,
          materials: r.materials.filter((m) => m.checked).map((m) => m.name),
          maybe: r.materials
            .filter((m) => !m.checked)
            .slice(0, 8)
            .map((m) => m.name),
          warnings: r.warnings,
        });
      }
      case "propose_action": {
        const d = describe(ctx, a);
        if (typeof d === "string") return err(d);
        const id = ctx.proposals.length + 1;
        ctx.proposals.push({ id, change: { kind: "action", action: String(a.action), args: d.args }, lines: d.lines });
        return json({ ok: true, proposal: id, note: "Предложение будет показано пользователю; он сам решит, применять ли его." });
      }
      default:
        return null;
    }
  };

  const fresh = () => readBook(env.port);

  /** Выполнение действия; возвращает отмену (или ничего — без отмены). */
  const run = async (action: Action, args: Record<string, unknown>): Promise<(() => Promise<void>) | null> => {
    const { port } = env;
    const b = await fresh();
    const s = (k: string) => cellText((args[k] as string) ?? null);
    switch (action) {
      case "create_kit": {
        const H = (k: string) => column("Комплекты", k).header;
        const base = (b.tables["Комплекты"] ?? []).at(-1);
        const at = (b.tables["Комплекты"] ?? []).length;
        await port.insert("Комплекты", at, [
          {
            [H("number")]: s("number"),
            [H("section")]: s("section") || cellText(base?.v.section ?? null),
            [H("city")]: cellText(base?.v.city ?? null),
            [H("year")]: cellText(base?.v.year ?? null),
            ...(s("volume") ? { [H("volume")]: s("volume") } : {}),
            ...(s("part") ? { [H("part")]: s("part") } : {}),
            ...(s("works") ? { [H("works")]: s("works") } : {}),
          },
        ]);
        env.report(`Создан комплект ${s("number")}.`);
        return async () => {
          const now = await fresh();
          const r = (now.tables["Комплекты"] ?? []).find((x) => cellText(x.v.number) === s("number"));
          if (r) await port.remove("Комплекты", [r.row]);
        };
      }
      case "set_kit_acts": {
        const kit = s("kit");
        const before = kitActs(b, kit).acts;
        const write = async (book: Book, list: string[]) => {
          const plan = planKitActs(book, kit, list);
          const H = (k: string) => column("АктыКомплектов", k).header;
          if (await port.isFiltered("АктыКомплектов")) await port.clearFilters("АктыКомплектов");
          for (const w of plan.write) await port.write("АктыКомплектов", w.row, { [H("kit")]: kit, [H("act")]: w.act });
          if (plan.insert) {
            const at = plan.insert.after === null ? (book.tables["АктыКомплектов"] ?? []).length : plan.insert.after + 1;
            await port.insert(
              "АктыКомплектов",
              at,
              plan.insert.acts.map((x) => ({ [H("kit")]: kit, [H("act")]: x })),
            );
          }
          if (plan.remove.length)
            await port.remove(
              "АктыКомплектов",
              [...plan.remove].sort((x, y) => y - x),
            );
        };
        await write(b, args.acts as string[]);
        const r = await syncRegistry(port, await fresh(), kit, env.template());
        env.report(
          `Состав комплекта ${kit} записан: ${(args.acts as string[]).length} ${word((args.acts as string[]).length, "акт", "акта", "актов")}.` +
            (r.issues.length ? ` Реестр не сверен: ${r.issues.slice(0, 3).map(issueText).join("; ")}` : r.changed ? " Реестр обновлён." : ""),
        );
        return async () => {
          await write(await fresh(), before);
          await syncRegistry(port, await fresh(), kit, env.template());
        };
      }
      case "fill_registry": {
        const kit = s("kit");
        if (await port.isFiltered("РеестрИД")) await port.clearFilters("РеестрИД");
        const r = await syncRegistry(port, b, kit, env.template());
        env.report(
          r.issues.length
            ? `Реестр комплекта ${kit} не обновлён: ${r.issues.slice(0, 5).map(issueText).join("; ")}`
            : r.changed
              ? `Реестр комплекта ${kit} обновлён: добавлено ${r.added}, убрано ${r.removed}.`
              : `Реестр комплекта ${kit} уже совпадает с актами.`,
        );
        return null;
      }
      case "build_kit": {
        const kit = s("kit");
        if (await port.isFiltered("РеестрИД")) await port.clearFilters("РеестрИД");
        const sy = await syncRegistry(port, b, kit, env.template());
        if (sy.issues.length) {
          env.report(`Комплект ${kit} не собран — реестр: ${sy.issues.slice(0, 5).map(issueText).join("; ")}`);
          return null;
        }
        const r = await assembleKit(await fresh(), kit, env.important(), env.code(), env.options(), env.template());
        if (r.kind === "issues") env.report(`Комплект ${kit} не собран: ${r.issues.slice(0, 8).map(issueText).join("; ")}`);
        else if (r.kind === "files")
          env.report(
            `Комплект ${kit} не собран — файлы: ${r.issues
              .slice(0, 8)
              .map((i) => `строка реестра ${(i.row ?? 0) + 1}: ${i.message}`)
              .join("; ")}`,
          );
        else {
          env.report(`Комплект ${kit} собран: ${r.name}, страниц ${r.pages}. Предпросмотр открыт.`);
          openPreview(previewUrl(`/api/kit-jobs/${r.id}`, location.origin));
        }
        return null;
      }
      case "build_common_registry": {
        const r = await assembleCommonRegistry(b, env.important(), env.code(), env.options(), env.template());
        if (r.kind === "empty") env.report("Общий реестр: ни у одного комплекта нет строк реестра.");
        else if (r.kind === "issues") env.report(`Общий реестр не собран: ${r.issues.slice(0, 8).map(issueText).join("; ")}`);
        else {
          env.report(`Общий реестр собран: комплектов ${r.kits}, документов ${r.docs}, листов ${r.sheets}.`);
          openPreview(previewUrl(`/api/common-registry-jobs/${r.id}`, location.origin));
        }
        return null;
      }
      case "fill_ojr": {
        for (const t of ["ОЖР3", "ОЖР5"] as TableName[]) if (await port.isFiltered(t)) await port.clearFilters(t);
        const r = await syncOjr(port, b);
        const after = await fresh();
        env.report(
          `${r.changed ? "ОЖР обновлён из актов" : "ОЖР уже совпадает с актами"}: раздел 3 — дней ${after.tables["ОЖР3"]?.length ?? 0}, раздел 5 — документов ${after.tables["ОЖР5"]?.length ?? 0}.` +
            (r.rows.issues.length ? ` Замечания: ${r.rows.issues.slice(0, 5).map(issueText).join("; ")}` : ""),
        );
        return null;
      }
      case "next_act": {
        if (await port.isFiltered("Акты")) await port.clearFilters("Акты");
        const row = (b.tables["Акты"] ?? []).find((r) => cellText(r.v.baseNumber) === s("act"))?.row;
        if (row === undefined) throw new Error(`Акт ${s("act")} не найден`);
        const r = await addNextAct(port, row);
        env.report(`Добавлен акт ${r.number} (схем: ${r.schemes}, материалов: ${r.materials} — без количества). Проверьте «Работы (п.1)», даты и номера схем.`);
        return null;
      }
      case "relink_scans": {
        const r = await relinkScans(port, b, location.origin);
        env.report(
          `Сканы: проверено ${r.checked}, привязано ${r.relinked}` +
            (r.missing.length
              ? `, не найдено ${r.missing.length}: ${r.missing
                  .slice(0, 5)
                  .map((m) => `${m.table}, строка ${m.row + 1}: ${m.name}`)
                  .join("; ")}`
              : "") +
            ".",
        );
        return null;
      }
      case "add_quality_doc": {
        const up = await uploadFromFolder(b, s("file"));
        const out = await addQualityDoc(port, {
          type: s("type"),
          number: s("number"),
          date: isoDate(s("date")),
          valid: isoDate(s("valid")),
          sheets: s("sheets"),
          materials: args.materials as string[],
          scan: up,
        });
        env.report(`${s("type")} № ${s("number")}: ${out}.`);
        return null;
      }
    }
  };

  return {
    tools: ACTION_TOOLS,
    exec,
    async apply(p: Proposal) {
      if (p.change.kind !== "action") return null;
      try {
        const undo = await run(p.change.action as Action, p.change.args);
        env.refresh();
        return undo ?? (async () => undefined);
      } catch (e) {
        env.report(`Действие №${p.id} не выполнено: ${(e as Error).message}`);
        return async () => undefined;
      }
    },
  };
}
