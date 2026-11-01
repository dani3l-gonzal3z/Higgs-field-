@echo off
rem Plató: arranca la base (servidor local + ventana propia)
cd /d "%~dp0"
where node >nul 2>nul || (echo Necesitas Node.js 18 o superior: https://nodejs.org & pause & exit /b 1)
start "Plato" /min node mcp\server.mjs --base %*
