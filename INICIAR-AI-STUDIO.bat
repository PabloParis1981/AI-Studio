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

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "$deadline=(Get-Date).AddMinutes(2); while((Get-Date) -lt $deadline){try{$r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000/api/health' -TimeoutSec 2; if($r.StatusCode -eq 200){Start-Process 'http://localhost:3000'; exit}}catch{}; Start-Sleep -Seconds 1}"
call npm run dev
pause
