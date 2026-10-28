// Распознавание скана документа качества (0.28): текст (слой PDF или OCR Windows) → поля для формы «Новый документ».
// С подключённой нейросетью поля разбирает она (правила дополняют пропуски), без неё — правила. Ничего не записывает.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { docFieldsByRules, docFieldsPrompt, parseDocFieldsAnswer, mergeFields, hasText, docIdentifyPrompt, parseIdentifyAnswer, saneDates } from "@idk/shared/scan/docText";
import { matchMaterials, fixOcrDates } from "@idk/shared/scan/match";
import type { Provider } from "@idk/shared/ai/model";
import type { Db } from "../db.ts";
import { Router, HttpError, notFound } from "../http/router.ts";
import { getFile } from "../files/store.ts";
import type { AiStore } from "../ai/store.ts";
import { chat, type Post } from "../ai/providers.ts";
import { readScan, windowsOcr, type OcrRunner } from "../scan/read.ts";

export function scanRoutes(r: Router, db: Db, dataDir: string, ai: AiStore, deps: { ocr?: OcrRunner; post?: Post } = {}) {
  const ocr = deps.ocr ?? windowsOcr();
  r.post("/api/files/:id/recognize", async (c) => {
    const { material } = await c.body(z.object({ material: z.string().default("") }));
    const f = getFile(db, c.id());
    if (!f) throw notFound("Файл");
    let buf: Buffer;
    try { buf = await readFile(join(dataDir, "files", f.path)); } catch { throw new HttpError(404, "Файл скана отсутствует на диске"); }
    const scan = await readScan(buf, f.mime, ocr);
    scan.text = fixOcrDates(scan.text);
    const warnings = [...scan.warnings];
    if (!hasText(scan.text)) warnings.push("Текста почти не найдено — проверьте, что скан чёткий и не повёрнут");
    const rules = docFieldsByRules(scan.text);
    let via: "ai" | "rules" = "rules", provider = "";
    let fields = rules;
    let p: ReturnType<AiStore["active"]> | null = null;
    try { p = ai.active(); } catch { p = null; }
    if (p && hasText(scan.text)) {
      try {
        const q = docFieldsPrompt(scan.text, material);
        const out = await chat(p, { messages: [{ role: "system", content: q.system }, { role: "user", content: q.user }], tools: [] }, { post: deps.post });
        ai.logUsage(p, out.usage);
        const got = parseDocFieldsAnswer(out.message.content);
        if (got) { fields = mergeFields(got, rules); via = "ai"; provider = p.name; }
        else warnings.push("Нейросеть ответила не по форме — поля заполнены по правилам");
      } catch (e) {
        warnings.push(`Нейросеть недоступна (${(e as Error).message.slice(0, 160)}) — поля заполнены по правилам`);
      }
    }
    return { fields, pages: scan.pages, method: scan.method, via, provider, warnings, text: scan.text.slice(0, 4000) };
  });

  // 0.29: документ и материалы по скану. Нейросеть, которая видит изображения (OpenAI-совместимая, локальная), получает
  // страницы картинками; не принимает — повтор только с текстом. Без нейросети — правила и подбор по совпадениям.
  const Mat = z.object({ name: z.string(), mark: z.string().optional(), article: z.string().optional(), manufacturer: z.string().optional() });
  r.post("/api/files/:id/identify", async (c) => {
    const { materials, today } = await c.body(z.object({ materials: z.array(Mat).max(2000).default([]), today: z.string().default(new Date().toISOString().slice(0, 10)) }), 4 * 1024 * 1024);
    const f = getFile(db, c.id());
    if (!f) throw notFound("Файл");
    let buf: Buffer;
    try { buf = await readFile(join(dataDir, "files", f.path)); } catch { throw new HttpError(404, "Файл скана отсутствует на диске"); }
    let p: Provider | null = null;
    try { p = ai.active(); } catch { p = null; }
    const canSee = !!p && (p.kind === "openai" || p.kind === "local");
    const scan = await readScan(buf, f.mime, ocr, { images: canSee });
    const text = fixOcrDates(scan.text);
    const warnings = [...scan.warnings];
    if (!hasText(text) && !scan.images.length) warnings.push("Текста почти не найдено — проверьте, что скан чёткий и не повёрнут");
    const rules = docFieldsByRules(text);
    const hits = matchMaterials(text, materials);
    let fields = rules, via: "ai" | "rules" = "rules", provider = "", seen = false;
    let aiMats: number[] | null = null;
    if (p && (hasText(text) || scan.images.length)) {
      const ask = async (images: string[]) => {
        const q = docIdentifyPrompt(text, materials, images.length > 0);
        const out = await chat(p!, { messages: [{ role: "system", content: q.system }, { role: "user", content: q.user, ...(images.length ? { images } : {}) }], tools: [] }, { post: deps.post });
        ai.logUsage(p!, out.usage);
        return parseIdentifyAnswer(out.message.content, Math.min(materials.length, 400));
      };
      try {
        let got: Awaited<ReturnType<typeof ask>> = null;
        try { got = await ask(scan.images); seen = scan.images.length > 0; }
        catch (e) {
          if (!scan.images.length) throw e;
          warnings.push("Нейросеть не принимает изображения — разобран распознанный текст");
          got = await ask([]);
        }
        if (got) { fields = mergeFields(got.fields, rules); aiMats = got.materials; via = "ai"; provider = p.name; }
        else warnings.push("Нейросеть ответила не по форме — поля заполнены по правилам");
      } catch (e) {
        warnings.push(`Нейросеть недоступна (${(e as Error).message.slice(0, 160)}) — поля заполнены по правилам`);
      }
    }
    const sane = saneDates(fields, today);
    warnings.push(...sane.warnings);
    // Материалы: выбор нейросети (отмечены) + совпадения по тексту; без нейросети отмечены уверенные совпадения.
    const byName = new Map(hits.map((h) => [h.name, h]));
    const list: { name: string; score: number; why: string[]; checked: boolean }[] = [];
    if (aiMats) for (const i of aiMats) {
      const m = materials[i];
      const h = byName.get(m.name);
      list.push({ name: m.name, score: Math.max(h?.score ?? 0, 0.7), why: ["нейросеть", ...(h?.why ?? [])], checked: true });
    }
    for (const h of hits) if (!list.some((x) => x.name === h.name)) list.push({ ...h, checked: !aiMats && h.score >= 0.5 });
    return { fields: sane.fields, pages: scan.pages, method: scan.method, via, provider, seen, warnings, materials: list.slice(0, 30), text: text.slice(0, 4000) };
  });
}
