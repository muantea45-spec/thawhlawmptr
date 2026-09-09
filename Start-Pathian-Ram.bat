@echo off
title Pathian Ram - Tithe Collection Web Application
echo ========================================================
echo   Starting Pathian Ram Tithe Collection Application...
echo ========================================================
echo.
cd /d "%~dp0"
if exist "dist" xcopy /E /I /Y "dist" "PTR\dist" >nul 2>&1
if exist "server" xcopy /E /I /Y "server" "PTR\server" >nul 2>&1
if exist "data" xcopy /E /I /Y "data" "PTR\data" >nul 2>&1
cmd /c npm run dev
pause

