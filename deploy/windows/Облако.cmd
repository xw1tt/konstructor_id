@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
title Облако «Конструктора ИД»
cd /d "%~dp0"

rem Установка и обслуживание облака «Конструктора ИД» на ВМ Yandex Cloud (Ubuntu 24.04).
rem Лежит в одной папке с архивом konstruktor-cloud-*.tar.gz. Настройки запоминаются в cloud-settings.txt.

set "CFG=%~dp0cloud-settings.txt"
set "KEY=%USERPROFILE%\.ssh\konstruktor-id-key"
set "IP=" & set "USER=admin" & set "EMAIL=" & set "DOMAIN="
if exist "%CFG%" for /f "usebackq tokens=1,* delims==" %%a in ("%CFG%") do set "%%a=%%b"

for %%f in ("%~dp0konstruktor-cloud-*.tar.gz") do set "ARCHIVE=%%~nxf"
if not defined ARCHIVE (
  echo Не найден архив konstruktor-cloud-*.tar.gz рядом с этим файлом.
  goto :end
)
where ssh >nul 2>nul || (
  echo В Windows нет клиента OpenSSH. Параметры Windows → Приложения → Дополнительные компоненты → «Клиент OpenSSH».
  goto :end
)

echo.
echo   Облако «Конструктора ИД»   (архив: %ARCHIVE%)
echo   1 — установить на новую ВМ
echo   2 — обновить сервер этим архивом
echo   3 — новая ссылка для входа владельца
echo   4 — журнал сервера (последние 100 строк)
echo   5 — скачать резервные копии базы в эту папку
echo   6 — начать заново: забыть IP, логин, почту, домен и ключ
echo.
set /p "MODE=Выберите (1–6): "
if "%MODE%"=="6" goto :reset

rem Каждый ответ можно поправить: Enter — оставить прежний (в квадратных скобках).
set "V=" & set /p "V=Публичный IP-адрес ВМ (Yandex Cloud → ВМ → Обзор) [!IP!]: "
if not "!V!"=="" set "IP=!V!"
if "!IP!"=="" goto :end
set "V=" & set /p "V=Логин на ВМ [!USER!]: "
if not "!V!"=="" set "USER=!V!"
if exist "%KEY%" (
  set "V=" & set /p "V=Ключ SSH уже сохранён. Заменить другим файлом? (д/Enter — нет): "
  if /i "!V!"=="д" del "%KEY%"
  if /i "!V!"=="y" del "%KEY%"
)

if not exist "%KEY%" (
  echo.
  echo Укажите файл SSH-ключа, скачанный при создании ВМ ^(можно перетащить файл в это окно^):
  set /p "SRC=Файл ключа: "
  set "SRC=!SRC:"=!"
  if not exist "!SRC!" ( echo Файл не найден: !SRC! & goto :end )
  if not exist "%USERPROFILE%\.ssh" mkdir "%USERPROFILE%\.ssh"
  copy /y "!SRC!" "%KEY%" >nul
  rem OpenSSH не принимает ключ, доступный другим пользователям: оставляем права только себе.
  icacls "%KEY%" /inheritance:r >nul
  icacls "%KEY%" /grant:r "%USERNAME%:R" >nul
)
set "SSH=ssh -i "%KEY%" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 !USER!@!IP!"
set "SCP=scp -i "%KEY%" -o StrictHostKeyChecking=accept-new"

if "%MODE%"=="1" goto :install
if "%MODE%"=="2" goto :update
if "%MODE%"=="3" goto :owner
if "%MODE%"=="4" goto :logs
if "%MODE%"=="5" goto :backups
goto :end

:install
set "V=" & set /p "V=Ваша почта (вход владельца сервиса) [!EMAIL!]: "
if not "!V!"=="" set "EMAIL=!V!"
if "!EMAIL!"=="" goto :end
echo.
echo Свой домен (например id.firma.ru, A-запись на !IP!) — или «-», если домена нет: адрес будет вида IP.sslip.io
set "V=" & set /p "V=Домен [!DOMAIN!]: "
if "!V!"=="-" set "DOMAIN="
if not "!V!"=="" if not "!V!"=="-" set "DOMAIN=!V!"
call :reset
if exist "%CFG%" del "%CFG%"
if exist "%KEY%" del "%KEY%"
echo Настройки и сохранённый ключ удалены — запустите файл заново.
goto :end

:save
echo.
echo ВАЖНО: в Yandex Cloud → Virtual Private Cloud → Группы безопасности у группы ВМ должны быть открыты
echo входящие TCP-порты 80 и 443 (источник 0.0.0.0/0). Без них не выпустится сертификат HTTPS.
pause
echo.
echo == Проверяю подключение к ВМ
%SSH% "echo ok" || ( echo Не удалось подключиться к !USER!@!IP!. Проверьте IP, логин и ключ. & goto :end )
echo == Загружаю архив
%SCP% "%~dp0%ARCHIVE%" !USER!@!IP!:~/ || goto :end
echo == Устанавливаю (5–10 минут)
%SSH% -t "tar -xzf ~/%ARCHIVE% -C ~ && cd ~/konstruktor-cloud && sudo bash deploy/install.sh '!EMAIL!' '!DOMAIN!'" || goto :fail
goto :done

:update
echo == Загружаю архив
%SCP% "%~dp0%ARCHIVE%" !USER!@!IP!:~/ || goto :end
echo == Обновляю сервер
%SSH% -t "tar -xzf ~/%ARCHIVE% -C ~ && cd ~/konstruktor-cloud && sudo bash deploy/update.sh" || goto :fail
call :save
goto :done

:owner
set "V=" & set /p "V=Почта владельца сервиса [!EMAIL!]: "
if not "!V!"=="" set "EMAIL=!V!"
%SSH% -t "cd ~/konstruktor-cloud/deploy && sudo docker compose exec -T app npx tsx packages/cloud/src/main.ts create-owner '!EMAIL!'"
call :save
goto :done

:logs
%SSH% -t "cd ~/konstruktor-cloud/deploy && sudo docker compose ps && sudo docker compose logs --tail 100 app caddy"
call :save
goto :done

:backups
if not exist "%~dp0backups" mkdir "%~dp0backups"
%SCP% "!USER!@!IP!:~/konstruktor-cloud/deploy/backups/*" "%~dp0backups\" && echo Копии — в папке backups рядом с этим файлом.
call :save
goto :done

:save
> "%CFG%" (
  echo IP=!IP!
  echo USER=!USER!
  echo EMAIL=!EMAIL!
  echo DOMAIN=!DOMAIN!
)
exit /b 0

:fail
echo.
echo Команда на сервере завершилась с ошибкой — пришлите текст выше разработчику (можно выбрать пункт 4 — журнал).
goto :end

:done
echo.
echo Готово.

:end
echo.
pause
