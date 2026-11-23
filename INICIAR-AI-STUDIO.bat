@echo off
setlocal
cd /d "%~dp0"
title AI Studio Personal

where node >nul 2>nul
if errorlevel 1 (
  echo No encuentro Node.js. Ejecuta primero CONFIGURAR-ASISTENTES.bat.
  pause
  exit /b 1
)

if not exist "node_modules\vite" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:3000'"
call npm run dev
pause
