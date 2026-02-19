@echo off
echo  Stopping Dashboard server...

:: Kill any PowerShell process running server.ps1
powershell -NoProfile -Command "Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'server\.ps1' } | Stop-Process -Force -ErrorAction SilentlyContinue"

:: Fallback: kill anything listening on port 4173
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 4173 -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo  Dashboard stopped.
timeout /t 2 >nul
