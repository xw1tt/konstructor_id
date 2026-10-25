#!/usr/bin/env bash
# Обновление облака: распакуйте новый архив поверх старого (deploy/.env и deploy/backups сохраняются) и запустите
#   sudo bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")"
docker compose up -d --build
docker image prune -f >/dev/null
echo "Обновлено."
