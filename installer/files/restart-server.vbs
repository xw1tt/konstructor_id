' Konstruktor ID: restarts the server (stop, then start without a window).
Option Explicit
Dim fso, sh, dir
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\stop-server.ps1""", 0, True
sh.Run "wscript.exe """ & dir & "\start-server.vbs""", 0, False
MsgBox "Сервер Конструктора ИД перезапущен. Закройте и снова откройте панель в Excel.", 64, "Конструктор ИД"
