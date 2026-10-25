# Облако «Конструктора ИД»: установка и обслуживание на ВМ Yandex Cloud (Ubuntu 24.04) из Windows.
# Запускается из «Облако.cmd»; лежит в одной папке с архивом konstruktor-cloud-*.tar.gz. Ответы — в cloud-settings.json.
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8; [Console]::InputEncoding = [Text.Encoding]::UTF8 } catch {}
$Host.UI.RawUI.WindowTitle = "Облако «Конструктора ИД»"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here
$Cfg = Join-Path $Here "cloud-settings.json"
$SshDir = Join-Path $env:USERPROFILE ".ssh"
$Key = Join-Path $SshDir "konstruktor-id-key"

function Load-Settings {
  $s = @{ IP = ""; User = "admin"; Email = ""; Domain = "" }
  if (Test-Path $Cfg) {
    try { (Get-Content $Cfg -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $s[$_.Name] = [string]$_.Value } } catch {}
  }
  return $s
}
function Save-Settings($s) { $s | ConvertTo-Json | Set-Content $Cfg -Encoding UTF8 }
function Ask($text, $current) {
  $shown = if ($current) { $current } else { "" }
  $v = Read-Host "$text [$shown]"
  if ([string]::IsNullOrWhiteSpace($v)) { return $current } else { return $v.Trim() }
}
function Fail($text) { Write-Host ""; Write-Host $text -ForegroundColor Red; exit 1 }

$archive = Get-ChildItem -Path $Here -Filter "konstruktor-cloud-*.tar.gz" | Sort-Object Name | Select-Object -Last 1
if (-not $archive) { Fail "Не найден архив konstruktor-cloud-*.tar.gz рядом с этим файлом." }
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  Fail "В Windows нет клиента OpenSSH: Параметры → Приложения → Дополнительные компоненты → «Клиент OpenSSH»."
}

Write-Host ""
Write-Host "  Облако «Конструктора ИД»   (архив: $($archive.Name))"
Write-Host "  1 — установить на новую ВМ"
Write-Host "  2 — обновить сервер этим архивом"
Write-Host "  3 — новая ссылка для входа владельца"
Write-Host "  4 — журнал сервера (последние 100 строк)"
Write-Host "  5 — скачать резервные копии базы в эту папку"
Write-Host "  6 — начать заново: забыть IP, логин, почту, домен и ключ"
Write-Host ""
$mode = (Read-Host "Выберите (1–6)").Trim()

if ($mode -eq "6") {
  Remove-Item $Cfg -ErrorAction SilentlyContinue
  Remove-Item $Key -Force -ErrorAction SilentlyContinue
  Write-Host "Настройки и сохранённый ключ удалены — запустите файл заново."
  exit 0
}
if ($mode -notin @("1", "2", "3", "4", "5")) { exit 0 }

$s = Load-Settings
Write-Host "Каждый ответ можно поправить; Enter — оставить прежний (в квадратных скобках)."
$s.IP = Ask "Публичный IP-адрес ВМ (Yandex Cloud → ВМ → Обзор)" $s.IP
if (-not $s.IP) { Fail "IP не указан." }
$s.User = Ask "Логин на ВМ" $s.User

if (Test-Path $Key) {
  $r = Read-Host "Ключ SSH уже сохранён. Заменить другим файлом? (д — да, Enter — нет)"
  if ($r -match '^(д|y)') { Remove-Item $Key -Force }
}
if (-not (Test-Path $Key)) {
  Write-Host "Укажите файл SSH-ключа, скачанный при создании ВМ (можно перетащить файл в это окно):"
  $src = (Read-Host "Файл ключа").Trim().Trim('"')
  if (-not (Test-Path $src)) { Fail "Файл не найден: $src" }
  New-Item -ItemType Directory -Force -Path $SshDir | Out-Null
  Copy-Item $src $Key -Force
  # OpenSSH не принимает ключ, доступный другим пользователям: оставляем права только себе.
  icacls $Key /inheritance:r | Out-Null
  icacls $Key /grant:r "$($env:USERNAME):R" | Out-Null
}
Save-Settings $s

$target = "$($s.User)@$($s.IP)"
$opts = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "-o", "ServerAliveInterval=30")
function Remote($cmd) {
  & ssh @opts -t $target $cmd
  if ($LASTEXITCODE -ne 0) { Fail "Команда на сервере завершилась с ошибкой — пришлите текст выше разработчику (пункт 4 — журнал сервера)." }
}
function Upload {
  Write-Host "== Загружаю архив"
  & scp @opts $archive.FullName "$($target):~/"
  if ($LASTEXITCODE -ne 0) { Fail "Не удалось загрузить архив на $target." }
}

switch ($mode) {
  "1" {
    $s.Email = Ask "Ваша почта (вход владельца сервиса)" $s.Email
    if (-not $s.Email) { Fail "Почта не указана." }
    Write-Host ""
    Write-Host "Свой домен (например id.firma.ru, A-запись на $($s.IP)) — или «-», если домена нет: адрес будет вида IP.sslip.io"
    $d = Ask "Домен" $s.Domain
    $s.Domain = if ($d -eq "-") { "" } else { $d }
    Save-Settings $s
    Write-Host ""
    Write-Host "ВАЖНО: в Yandex Cloud → Virtual Private Cloud → Группы безопасности у группы ВМ должны быть открыты" -ForegroundColor Yellow
    Write-Host "входящие TCP-порты 80 и 443 (источник 0.0.0.0/0). Без них не выпустится сертификат HTTPS." -ForegroundColor Yellow
    Read-Host "Enter — продолжить"
    Write-Host "== Проверяю подключение к ВМ"
    & ssh @opts $target "echo ok"
    if ($LASTEXITCODE -ne 0) { Fail "Не удалось подключиться к $target. Проверьте IP, логин и ключ (пункт 6 — начать заново)." }
    Upload
    Write-Host "== Устанавливаю (5–10 минут)"
    Remote "tar -xzf ~/$($archive.Name) -C ~ && cd ~/konstruktor-cloud && sudo bash deploy/install.sh '$($s.Email)' '$($s.Domain)'"
  }
  "2" {
    Upload
    Write-Host "== Обновляю сервер"
    Remote "tar -xzf ~/$($archive.Name) -C ~ && cd ~/konstruktor-cloud && sudo bash deploy/update.sh"
  }
  "3" {
    $s.Email = Ask "Почта владельца сервиса" $s.Email
    Save-Settings $s
    Remote "cd ~/konstruktor-cloud/deploy && sudo docker compose exec -T app npx tsx packages/cloud/src/main.ts create-owner '$($s.Email)'"
  }
  "4" { Remote "cd ~/konstruktor-cloud/deploy && sudo docker compose ps && sudo docker compose logs --tail 100 app caddy" }
  "5" {
    $dir = Join-Path $Here "backups"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    & scp @opts "$($target):~/konstruktor-cloud/deploy/backups/*" $dir
    if ($LASTEXITCODE -eq 0) { Write-Host "Копии — в папке backups рядом с этим файлом." }
  }
}
Write-Host ""
Write-Host "Готово." -ForegroundColor Green
