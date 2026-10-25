// Архив развёртывания облака и набор для Windows:
//   npx tsx scripts/build-cloud-bundle.ts [версия]
//   → dist/konstruktor-cloud-<версия>.tar.gz (исходники shared/server/cloud, package.json панели для npm ci, deploy/)
//   → dist/Облако-Конструктор-ИД-<версия>.zip (Облако.cmd + архив + «Развёртывание облака.md») — для запуска на ПК
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { writeZip } from "../packages/server/src/zip/zip.ts";

const version = process.argv[2] ?? "0.20";
const files = execFileSync("git", ["ls-files", "package.json", "package-lock.json", "tsconfig.base.json", "packages/shared", "packages/server", "packages/cloud", "packages/addin/package.json", "deploy"], { encoding: "utf8" })
  .split("\n").filter(Boolean).filter((f) => !/\/test\//.test(f) && !f.startsWith("deploy/windows/"));
mkdirSync("dist", { recursive: true });
const tgz = `konstruktor-cloud-${version}.tar.gz`;
execFileSync("tar", ["-czf", `dist/${tgz}`, "--transform", "s,^,konstruktor-cloud/,", ...files]);
console.log(`Архив облака: dist/${tgz} (${files.length} файлов)`);
const zip = `dist/Облако-Конструктор-ИД-${version}.zip`;
writeFileSync(zip, writeZip([
  ["Облако.cmd", readFileSync("deploy/windows/Облако.cmd")],
  [tgz, readFileSync(`dist/${tgz}`)],
  ["Развёртывание облака.md", readFileSync("docs/Развёртывание облака.md")],
]));
console.log(`Набор для Windows: ${zip}`);
