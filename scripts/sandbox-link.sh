#!/bin/sh
# Рабочая среда без доступа к npm: связывает node_modules с предустановленными пакетами.
set -e
cd "$(dirname "$0")/.."
mkdir -p node_modules/@idk
for p in react react-dom esbuild tsx typescript zod pdf-lib playwright playwright-core pdfjs-dist @esbuild scheduler @types; do
  [ -e "/opt/npm-tools/node_modules/$p" ] && ln -sfn "/opt/npm-tools/node_modules/$p" "node_modules/$p"
done
for p in shared server addin; do ln -sfn "../../packages/$p" "node_modules/@idk/$p"; done
