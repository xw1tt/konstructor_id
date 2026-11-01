// Демо исполнительной схемы трассы: JSON → SVG (+ HTML для печати в PDF из браузера).
// npm run scheme:demo [-- путь/к/схеме.json [папка вывода]]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseRoute } from "../packages/shared/src/scheme/route.ts";
import { renderRouteSvg } from "../packages/shared/src/scheme/render.ts";

const input = process.argv[2] ?? "packages/shared/test/fixtures/route.example.json";
const outDir = resolve(process.argv[3] ?? "out");
const parsed = parseRoute(JSON.parse(readFileSync(input, "utf8")));
if (!parsed.ok) {
  console.error("Ошибки в схеме:\n" + parsed.errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
const r = renderRouteSvg(parsed.scheme);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "schema-trassy.svg"), r.svg);
writeFileSync(join(outDir, "schema-trassy.html"),
  `<!doctype html><meta charset="utf-8"><title>Схема трассы</title><style>@page{size:${r.width}mm ${r.height}mm;margin:0}html,body{margin:0}svg{display:block}</style>${r.svg}`);
console.log(`Масштаб 1:${r.scale}, лист ${r.width}×${r.height} мм → ${outDir}`);
for (const w of r.warnings) console.warn("! " + w);
