@echo off
title Resource Dashboard — Fire Suppression Technology
echo.
echo  Starting Resource Dashboard...
echo.

cd /d "%~dp0"

:: Check if already running
netstat -an 2>nul | find "4173" | find "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo  Dashboard is already running!
    echo  Opening browser...
    start http://localhost:4173
    timeout /t 3 >nul
    exit
)

:: Launch PowerShell server
powershell -ExecutionPolicy Bypass -NoProfile -File "server\server.ps1" -Port 4173 -Root "app"
