#!/usr/bin/env bash
# Установка облака «Конструктора ИД» на чистую ВМ Ubuntu 22.04/24.04 (запуск от root из папки с распакованным архивом):
#   sudo bash deploy/install.sh <почта владельца> [домен]
# Без домена адрес будет <IP-через-дефисы>.sslip.io — HTTPS работает и без покупки домена.
set -euo pipefail
cd "$(dirname "$0")"
OWNER="${1:-}"
DOMAIN="${2:-}"
if [ -z "$OWNER" ]; then echo "Укажите почту владельца: sudo bash deploy/install.sh you@example.ru [домен]"; exit 2; fi

if ! command -v docker >/dev/null 2>&1; then
  echo "== Устанавливаю Docker"
  curl -fsSL https://get.docker.com | sh
fi

if [ -z "$DOMAIN" ]; then
  IP="$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)"
  DOMAIN="$(echo "$IP" | tr . -).sslip.io"
fi

if [ ! -f .env ]; then
  echo "DOMAIN=$DOMAIN" > .env
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
  chmod 600 .env
else
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" .env
fi
mkdir -p backups

echo "== Собираю и запускаю (несколько минут)"
docker compose up -d --build

echo "== Жду сервер"
for i in $(seq 1 60); do
  if docker compose exec -T app node -e "fetch('http://localhost:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then break; fi
  sleep 5
done

echo "== Ссылка для первого входа владельца:"
docker compose exec -T app npx tsx packages/cloud/src/main.ts create-owner "$OWNER"
echo
echo "Готово. Консоль: https://$DOMAIN/console/  Адрес облака для панели Excel: https://$DOMAIN"
echo "Сертификат HTTPS выпускается при первом обращении (до минуты). Резервные копии — $(pwd)/backups"
