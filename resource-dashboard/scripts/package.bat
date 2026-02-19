@echo off
setlocal enabledelayedexpansion
echo ====================================
echo  Packaging Resource Dashboard
echo ====================================
echo.

cd /d "%~dp0\.."

:: Release directory (parent of resource-dashboard)
set "RELEASE_DIR=..\release"
if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"

:: Read version from package.json
for /f "tokens=2 delims=:, " %%a in ('findstr /c:"\"version\"" package.json') do set RAW_VER=%%~a
set "VERSION=%RAW_VER:"=%"
set "ZIP_NAME=resource-dashboard-%VERSION%.zip"

:: Check if this version was already built
if exist "%RELEASE_DIR%\%ZIP_NAME%" (
    echo  Current version: %VERSION%
    echo  WARNING: v%VERSION% already exists in release.
    echo.
    echo  Enter a new version number, or press Enter to rebuild %VERSION% anyway.
    echo.
    set /p "NEW_VER=  New version (e.g. 1.1.0): "

    if defined NEW_VER (
        set "NEW_VER=!NEW_VER: =!"
        echo.
        echo  Updating package.json: %VERSION% -^> !NEW_VER!
        node -e "var f='package.json',p=JSON.parse(require('fs').readFileSync(f));p.version='!NEW_VER!';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
        set "VERSION=!NEW_VER!"
        set "ZIP_NAME=resource-dashboard-!NEW_VER!.zip"
    ) else (
        echo.
        echo  Rebuilding v%VERSION%...
    )
    echo.
)

echo  Version: %VERSION%
echo.

:: Build the app
echo [1/4] Building app...
call npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    exit /b 1
)

:: Stage the package
echo [2/4] Staging package...
if exist "package" rmdir /s /q package
mkdir package
mkdir package\server
mkdir package\app
mkdir package\docs

:: Copy built app (exclude lp-exports from app folder)
xcopy /s /e /q /i dist\* package\app\ /exclude:scripts\package-exclude.txt

:: Copy server script
if exist "server\server.ps1" (
    copy server\server.ps1 package\server\ >nul
    echo   server.ps1 copied
) else (
    echo.
    echo   WARNING: server\server.ps1 not found!
    echo.
)

:: Copy batch scripts and docs
copy scripts\Start_Dashboard.bat package\ >nul
copy scripts\Stop_Dashboard.bat package\ >nul
copy scripts\README.txt package\ >nul
copy scripts\Quick_Start_Guide.txt package\docs\ >nul

:: Zip into release folder
echo [3/4] Packaging to release\%ZIP_NAME%...
powershell -command "Compress-Archive -Path 'package\*' -DestinationPath '%RELEASE_DIR%\%ZIP_NAME%' -Force"

:: Copy README alongside the zip
copy scripts\README.txt "%RELEASE_DIR%\README.txt" >nul

:: Clean up staging
rmdir /s /q package

:: Publish GitHub Release
echo [4/4] Publishing GitHub Release...
where gh >nul 2>&1
if %errorlevel% equ 0 (
    cd /d "%~dp0\..\.."
    gh release view v!VERSION! >nul 2>&1
    if !errorlevel! equ 0 (
        echo   Updating existing release v!VERSION!...
        gh release upload v!VERSION! "release\!ZIP_NAME!" --clobber
    ) else (
        echo   Creating release v!VERSION!...
        gh release create v!VERSION! "release\!ZIP_NAME!" --title "Resource Dashboard v!VERSION!" --notes "Download the zip, extract it, and double-click Start_Dashboard.bat."
    )
    if !errorlevel! equ 0 (
        echo   Release published!
        for /f "tokens=*" %%u in ('gh release view v!VERSION! --json assets --jq ".assets[0].url"') do set "DOWNLOAD_URL=%%u"
        if defined DOWNLOAD_URL (
            echo.
            echo   Download: !DOWNLOAD_URL!
        )
    ) else (
        echo   WARNING: GitHub release failed. You can publish manually with:
        echo   gh release create v!VERSION! "release\!ZIP_NAME!"
    )
    cd /d "%~dp0\.."
) else (
    echo   GitHub CLI (gh) not found - skipping release publish.
    echo   Install from: https://cli.github.com
)

echo.
echo ====================================
echo  Build complete!  v%VERSION%
echo ====================================
echo.
echo  Package:  release\%ZIP_NAME%
for %%A in ("%RELEASE_DIR%\%ZIP_NAME%") do echo  Size:     %%~zA bytes
echo.
pause
