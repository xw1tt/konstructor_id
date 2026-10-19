' Konstruktor ID: starts the server without a window. Log: %LOCALAPPDATA%\KonstruktorID\server.log
Option Explicit
Dim fso, sh, dir, dataDir, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
dataDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\KonstruktorID"
If Not fso.FolderExists(dataDir) Then fso.CreateFolder dataDir
sh.Environment("PROCESS")("IDK_ADDIN_DIR") = dir & "\addin"
sh.CurrentDirectory = dir
cmd = "cmd /c """"" & dir & "\node\node.exe"" """ & dir & "\app\server.mjs"" > """ & dataDir & "\server.log"" 2>&1"""
sh.Run cmd, 0, False
