// Распознавание скана документа качества (0.28): текст (слой PDF или OCR Windows) → поля для формы «Новый документ».
// С подключённой нейросетью поля разбирает она (правила дополняют пропуски), без неё — правила. Ничего не записывает.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { docFieldsByRules, docFieldsPrompt, parseDocFieldsAnswer, mergeFields, hasText } from "@idk/shared/scan/docText";
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
}
