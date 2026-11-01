#!/bin/sh
# Plató: arranca la base (servidor local + ventana propia). Uso: ./plato.sh   (añade --kiosk para pantalla completa)
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Necesitas Node.js 18 o superior: https://nodejs.org"; exit 1; }
exec node mcp/server.mjs --base "$@"
