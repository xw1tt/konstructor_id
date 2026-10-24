// Сборка установщика Windows «Конструктор ИД»: сервер одним файлом, панель, Node.js и скрипты запуска
// упаковываются в payload.zip и встраиваются в установщик на Go (installer/).
//
//   node scripts/build-installer.mjs <путь к node.exe для Windows> [версия]
//
// Результат: dist/KonstruktorID-Setup-<версия>.exe
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nodeExe = process.argv[2];
const version = process.argv[3] ?? "0.14";
if (!nodeExe || !existsSync(nodeExe)) {
  console.error("Укажите путь к node.exe для Windows (Node.js 22.13 или новее).");
  process.exit(1);
}

const work = join(root, "build", "installer");
const payload = join(work, "payload");
rmSync(work, { recursive: true, force: true });
mkdirSync(join(payload, "app"), { recursive: true });

// 1. Панель.
execFileSync(process.execPath, [join(root, "packages", "addin", "build.mjs")], { stdio: "inherit" });
cpSync(join(root, "packages", "addin", "dist"), join(payload, "addin"), { recursive: true });
// Версия манифеста — версия установщика (Excel обновляет надстройку по <Version>, формат X.Y.Z.W).
{
  const m = join(payload, "addin", "manifest.xml");
  const parts = version.split(".").map((p) => String(parseInt(p, 10) || 0));
  while (parts.length < 4) parts.push("0");
  writeFileSync(m, readFileSync(m, "utf8").replace(/<Version>[^<]*<\/Version>/, `<Version>${parts.slice(0, 4).join(".")}</Version>`));
}

// 2. Сервер одним файлом (playwright-core — рядом, как пакет: он грузит свои файлы динамически).
await build({
  entryPoints: [join(root, "packages", "server", "src", "main.ts")],
  outfile: join(payload, "app", "server.mjs"),
  bundle: true, platform: "node", format: "esm", target: "node22",
  external: ["playwright-core"],
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "warning",
});
cpSync(join(root, "packages", "server", "src", "migrations"), join(payload, "app", "migrations"), { recursive: true });
// print.css ищется как new URL("../print.css", server.mjs) — на уровень выше app/.
cpSync(join(root, "packages", "server", "src", "print", "print.css"), join(payload, "print.css"));
cpSync(realpathSync(join(root, "node_modules", "playwright-core")), join(payload, "app", "node_modules", "playwright-core"), { recursive: true });

// 3. Node.js для Windows и лицензии.
mkdirSync(join(payload, "node"));
cpSync(nodeExe, join(payload, "node", "node.exe"));
cpSync(join(root, "installer", "files"), payload, { recursive: true });
// wscript читает не-ASCII только из UTF-16 с BOM: сообщения скриптов — по-русски.
for (const f of ["start-server.vbs", "restart-server.vbs"]) {
  const p = join(payload, f);
  writeFileSync(p, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(readFileSync(p, "utf8").replace(/\r?\n/g, "\r\n"), "utf16le")]));
}
writeFileSync(join(payload, "VERSION"), version);

// 4. Архив и установщик.
const zip = join(root, "installer", "payload.zip");
rmSync(zip, { force: true });
execFileSync("zip", ["-q", "-r", "-9", zip, "."], { cwd: payload, stdio: "inherit" });
mkdirSync(join(root, "dist"), { recursive: true });
const out = join(root, "dist", `KonstruktorID-Setup-${version}.exe`);
execFileSync("go", ["build", "-trimpath", "-ldflags", `-H windowsgui -s -w -X main.version=${version}`, "-o", out, "."], {
  cwd: join(root, "installer"), stdio: "inherit",
  env: { ...process.env, GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0", GOFLAGS: "-mod=mod", GOPROXY: "off" },
});
console.log(`Установщик: ${out} (${(readFileSync(out).length / 1048576).toFixed(1)} МБ)`);
