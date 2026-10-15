import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(here, "src/main.tsx")],
  bundle: true,
  outfile: join(out, "main.js"),
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  minify: true,
  sourcemap: true,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
for (const f of ["index.html", "styles.css", "assets"]) cpSync(join(here, "src", f), join(out, f), { recursive: true });
cpSync(join(here, "manifest.xml"), join(out, "manifest.xml"));
console.log("Панель собрана:", out);
