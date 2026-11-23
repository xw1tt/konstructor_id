#!/usr/bin/env bash
# Установка «Сервера сканов» Конструктора ИД на чистый Ubuntu 22.04/24.04 (VPS). Запуск: sudo bash setup.sh
# Адрес сервера — доменное имя или, если домена нет, <IP-через-дефисы>.sslip.io (например 203-0-113-5.sslip.io).
set -euo pipefail
cd "$(dirname "$0")"
IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
DEFAULT_HOST="$(echo "$IP" | tr . -).sslip.io"
read -rp "Адрес сервера [${DEFAULT_HOST}]: " HOST
HOST=${HOST:-$DEFAULT_HOST}

apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https
if ! node -v 2>/dev/null | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

id konstruktor >/dev/null 2>&1 || useradd --system --home /var/lib/konstruktor-hub --shell /usr/sbin/nologin konstruktor
mkdir -p /opt/konstruktor-hub /var/lib/konstruktor-hub
cp -r app print.css VERSION /opt/konstruktor-hub/
chown -R konstruktor: /var/lib/konstruktor-hub

if [ ! -f /etc/konstruktor-hub.env ]; then
  TOKEN=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)
  echo "IDK_HUB_TOKEN=${TOKEN}" > /etc/konstruktor-hub.env
  chmod 600 /etc/konstruktor-hub.env
fi
TOKEN=$(grep IDK_HUB_TOKEN /etc/konstruktor-hub.env | cut -d= -f2)

cp konstruktor-hub.service /etc/systemd/system/
sed "s/{\$HUB_HOST}/${HOST}/" Caddyfile > /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now konstruktor-hub
systemctl restart caddy
if command -v ufw >/dev/null; then ufw allow 80/tcp; ufw allow 443/tcp; fi

sleep 3
echo
echo "Готово. В программе: «Настройки» → «Сервер сканов»:"
echo "  Адрес: https://${HOST}"
echo "  Ключ:  ${TOKEN}"
echo "Ключ храните как пароль. Обновление: распакуйте новый архив и снова запустите setup.sh (ключ сохранится)."
