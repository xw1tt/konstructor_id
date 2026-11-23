// 0.52: сборка «Сервера сканов» для Linux-VPS: dist/konstruktor-hub.tar.gz — server.mjs, миграции, установка (setup.sh),
// служба systemd и Caddy (HTTPS). Наружу открыты только /api/hub/* — с ключом доступа.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "konstruktor-hub");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "app"), { recursive: true });
await build({
  entryPoints: [join(root, "packages", "server", "src", "main.ts")],
  outfile: join(out, "app", "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["playwright-core", "pdfjs-dist"],
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "warning",
});
cpSync(join(root, "packages", "server", "src", "migrations"), join(out, "app", "migrations"), { recursive: true });
cpSync(join(root, "packages", "server", "src", "print", "print.css"), join(out, "print.css"));
for (const f of ["setup.sh", "Caddyfile", "konstruktor-hub.service"]) cpSync(join(root, "deploy", "hub", f), join(out, f));
cpSync(join(root, "docs", "Сервер сканов.md"), join(out, "README.md"));
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version ?? "";
writeFileSync(join(out, "VERSION"), `${process.env.IDK_VERSION ?? version}\n`);
execFileSync("tar", ["-czf", join(root, "dist", "konstruktor-hub.tar.gz"), "-C", join(root, "dist"), "konstruktor-hub"]);
console.log("Сервер сканов:", join(root, "dist", "konstruktor-hub.tar.gz"));
