# Добавляет запуск сервера Конструктора ИД в автозагрузку текущего пользователя (папка shell:startup).
$root = Split-Path -Parent $PSScriptRoot
$startup = [Environment]::GetFolderPath("Startup")
$link = Join-Path $startup "Конструктор ИД.lnk"
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($link)
$sc.TargetPath = Join-Path $root "scripts\start.cmd"
$sc.WorkingDirectory = $root
$sc.WindowStyle = 7  # свёрнутое окно
$sc.Save()
Write-Host "Ярлык создан: $link"
