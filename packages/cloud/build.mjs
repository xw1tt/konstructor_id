// Сборка консоли облачного сервера: console/ → console-dist/.
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "console-dist");
mkdirSync(out, { recursive: true });
await build({
  entryPoints: { console: join(here, "console/main.tsx") }, bundle: true, outdir: out, format: "iife", target: "es2020", jsx: "automatic",
  minify: true, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning",
});
cpSync(join(here, "console/index.html"), join(out, "index.html"));
console.log("Консоль собрана:", out);
