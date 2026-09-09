@echo off
title Pathian Ram - Deploy to Cloudflare (LIVE PRODUCTION)
cd /d "%~dp0"

echo ===================================================
echo   Deploying to Cloudflare (LIVE PRODUCTION)
echo   Project Name: thawhlawmptr
echo ===================================================
echo.

echo 1. Building latest production files...
call npm.cmd run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed. Please check the errors above.
    pause
    exit /b 1
)

echo.
echo 2. Uploading to Cloudflare Pages (thawhlawmptr)...
call npx.cmd wrangler pages deploy dist --project-name=thawhlawmptr --branch=main --commit-dirty=true

echo.
echo ===================================================
echo   Deployment completed!
echo   Live URL: https://thawhlawmptr.pages.dev
echo ===================================================
pause
