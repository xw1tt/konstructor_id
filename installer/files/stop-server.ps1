# Konstruktor ID: stops the server (installed one and one started from sources with npm start).
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $c = $_.CommandLine
  $c -and ($c -like '*KonstruktorID*app\server.mjs*' -or $c -like '*packages\server\src\main.ts*' -or $c -like '*packages/server/src/main.ts*')
}
foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500
