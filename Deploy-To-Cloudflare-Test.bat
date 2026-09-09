@echo off
title Pathian Ram - Deploy to Cloudflare (TEST / PLAYGROUND)
cd /d "%~dp0"

echo ===================================================
echo   Deploying to Cloudflare (TEST ENVIRONMENT)
echo   Project Name: pathian-ram-test
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
echo 2. Uploading to Cloudflare Pages (pathian-ram-test)...
call npx.cmd wrangler pages deploy dist --project-name=pathian-ram-test --branch=main --commit-dirty=true

echo.
echo ===================================================
echo   Deployment completed!
echo   Test URL: https://pathian-ram-test.pages.dev
echo ===================================================
pause
