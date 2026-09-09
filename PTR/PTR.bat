@echo off
title Pathian Ram - Tithe Collection System
setlocal EnableDelayedExpansion

set "CURR_DIR=%~dp0"
if "%CURR_DIR:~-1%"=="\" set "CURR_DIR=%CURR_DIR:~0,-1%"
cd /d "%CURR_DIR%"

set PORT=5000
set "DATA_DIR=%CURR_DIR%\data"
set "BACKUPS_DIR=%CURR_DIR%\backups"

rem Sync latest built files from parent directory if present
if exist "..\dist" xcopy /E /I /Y "..\dist" "dist" >nul 2>&1
if exist "..\server" xcopy /E /I /Y "..\server" "server" >nul 2>&1

rem Ensure data and backups directories exist
if not exist "data" mkdir "data" >nul 2>&1
if not exist "backups" mkdir "backups" >nul 2>&1

rem 1. Try launching with Electron if available
if exist "%CURR_DIR%\node_modules\.bin\electron.cmd" (
  start "" "%CURR_DIR%\node_modules\.bin\electron.cmd" "%CURR_DIR%"
  exit /b 0
)

rem 2. Fallback: Start background Express server and open Native App Window
start "" /b node "%CURR_DIR%\server\index.js"
timeout /t 1 /nobreak >nul

rem Try Microsoft Edge App Mode (clean standalone window without browser UI)
start "" msedge.exe --app=http://localhost:5000 --window-name="Pathian Ram Tithe Collection System" --window-size=1280,850 >nul 2>&1
if %errorlevel% equ 0 exit /b 0

rem Try Google Chrome App Mode
start "" chrome.exe --app=http://localhost:5000 --window-size=1280,850 >nul 2>&1
if %errorlevel% equ 0 exit /b 0

rem Default browser fallback
start http://localhost:5000
exit /b 0
