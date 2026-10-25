#!/bin/sh
# Резервная копия базы раз в сутки; хранятся 14 последних (папка deploy/backups на сервере).
while true; do
  f="/backups/idk-$(date +%Y-%m-%d_%H%M).sql.gz"
  if pg_dump -h db -U idk idk | gzip > "$f.tmp"; then mv "$f.tmp" "$f"; echo "Резервная копия: $f"; else rm -f "$f.tmp"; echo "Ошибка резервной копии"; fi
  ls -1t /backups/idk-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
  sleep 86400
done
