@echo off
title L1 Support for MR ^& CP
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo  Node.js was not found on this machine.
  echo  Install it from https://nodejs.org (the LTS version), then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies the first time this runs - this can take a minute...
  call npm install
)

set PORT=3002

echo.
echo Starting L1 Support for MR ^& CP ...
echo Once you see "is running" below, open http://localhost:3002 in your browser.
echo Leave this window open while you use the app. Close it to stop the server.
echo.

start "" http://localhost:3002
call npm start

pause
