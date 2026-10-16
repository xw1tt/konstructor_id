@echo off
rem Konstruktor ID: install dependencies, build the panel and start the server.
rem Double-click this file. Closing the server window stops the server.
cd /d "%~dp0"
title Konstruktor ID: install and start

where node >/dev/null 2>nul
if errorlevel 1 (
  echo Node.js not found. Install Node.js 22 LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

echo [1/3] npm install
call npm install
if errorlevel 1 goto :failed

echo [2/3] npm run build
call npm run build
if errorlevel 1 goto :failed

echo [3/3] Starting server...
title Konstruktor ID server
call npm start
pause
exit /b 0

:failed
echo.
echo ERROR: the step above failed. See the messages above.
pause
exit /b 1
