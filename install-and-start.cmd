@echo off
rem Konstruktor ID: install dependencies, build the panel and start the server.
rem Double-click this file. Closing the server window stops the server.
cd /d "%~dp0"
title Konstruktor ID: install and start

if not exist "%~dp0package.json" (
  echo The program files were not found next to this file.
  echo Probably it was started right from the zip archive.
  echo Right-click the zip, choose "Extract All...", then run install-and-start.cmd from the extracted folder.
  pause
  exit /b 1
)

where node >nul 2>nul
if not "%errorlevel%"=="0" (
  echo Node.js not found. Install Node.js 22 LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

echo [1/3] npm install
call npm install
if not "%errorlevel%"=="0" goto :failed

echo [2/3] npm run build
call npm run build
if not "%errorlevel%"=="0" goto :failed

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
