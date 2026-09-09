@echo off
title Pathian Ram - App Launcher
cd /d "%~dp0"

echo Syncing application build files...
if exist "dist" xcopy /E /I /Y "dist" "PTR\dist" >nul 2>&1
if exist "server" xcopy /E /I /Y "server" "PTR\server" >nul 2>&1
if exist "data" xcopy /E /I /Y "data" "PTR\data" >nul 2>&1

cd /d "%~dp0PTR"
start "" "%~dp0PTR\PTR.bat"
