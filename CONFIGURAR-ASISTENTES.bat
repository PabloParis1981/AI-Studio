@echo off
setlocal
cd /d "%~dp0"
title Configurar AI Studio Personal

echo ==========================================
echo   CONFIGURACION INICIAL - AI STUDIO
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo No encuentro Node.js. Instalalo desde https://nodejs.org/ y volve a ejecutar este archivo.
  pause
  exit /b 1
)

echo [1/3] Instalando dependencias de AI Studio...
call npm install
if errorlevel 1 (
  echo No se pudieron instalar las dependencias.
  pause
  exit /b 1
)

echo.
echo [2/3] Instalando los dos asistentes...
call npm run setup:agents
if errorlevel 1 (
  echo No se pudieron instalar los asistentes.
  pause
  exit /b 1
)

echo.
echo [3/3] Iniciando sesion de ChatGPT (Codex)...
call codex login
if errorlevel 1 (
  echo No se pudo completar el inicio de sesion de ChatGPT.
  pause
  exit /b 1
)

echo.
echo Ahora se abrira Gemini. Elegi "Sign in with Google".
echo Cuando termine la autorizacion, cerra Gemini con Ctrl+C.
call gemini

echo.
echo Configuracion terminada. Para abrir AI Studio, hace doble clic en INICIAR-AI-STUDIO.bat.
pause
