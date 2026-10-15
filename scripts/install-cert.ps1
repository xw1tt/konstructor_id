# Добавляет корневой сертификат Конструктора ИД в доверенные корневые центры ТЕКУЩЕГО пользователя.
# Сертификат ограничен именами localhost и 127.0.0.1 и не годится для других сайтов.
$dataDir = if ($env:IDK_DATA_DIR) { $env:IDK_DATA_DIR } else { Join-Path $env:LOCALAPPDATA "KonstruktorID" }
$ca = Join-Path $dataDir "tls\ca.pem"
if (-not (Test-Path $ca)) { Write-Error "Нет $ca. Сначала запустите сервер (npm start)."; exit 1 }
certutil -user -addstore Root $ca
