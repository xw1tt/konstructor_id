@echo off
rem Konstruktor ID server. Closing this window stops the server.
cd /d "%~dp0.."
title Konstruktor ID server
call npm start
