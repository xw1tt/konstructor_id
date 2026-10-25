// Архив развёртывания облака: исходники shared/server/cloud, package.json панели (для npm ci), deploy/.
//   node scripts/build-cloud-bundle.mjs [версия] → dist/konstruktor-cloud-<версия>.tar.gz
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const version = process.argv[2] ?? "0.20";
const files = execFileSync("git", ["ls-files", "package.json", "package-lock.json", "tsconfig.base.json", "packages/shared", "packages/server", "packages/cloud", "packages/addin/package.json", "deploy"], { encoding: "utf8" })
  .split("\n").filter(Boolean).filter((f) => !/\/test\//.test(f));
mkdirSync("dist", { recursive: true });
const out = `dist/konstruktor-cloud-${version}.tar.gz`;
execFileSync("tar", ["-czf", out, "--transform", "s,^,konstruktor-cloud/,", ...files]);
console.log(`Архив облака: ${out} (${files.length} файлов)`);
