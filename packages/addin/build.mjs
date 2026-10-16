import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");
mkdirSync(out, { recursive: true });
await build({
  entryPoints: { main: join(here, "src/main.tsx"), preview: join(here, "src/preview.ts"), portal: join(here, "src/portal.ts") },
  bundle: true,
  outdir: out,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  minify: true,
  sourcemap: true,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
for (const f of ["index.html", "preview.html", "portal.html", "styles.css", "assets"]) cpSync(join(here, "src", f), join(out, f), { recursive: true });
cpSync(join(here, "manifest.xml"), join(out, "manifest.xml"));
console.log("Панель собрана:", out);
