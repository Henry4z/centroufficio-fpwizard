@echo off
title FP Wizard - server locale
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non trovato. Installalo da https://nodejs.org e riprova.
  pause
  exit /b 1
)
echo Lascia aperta questa finestra finche' usi l'app. Per fermare il server chiudila.
echo.
node serve.js 8080
pause
