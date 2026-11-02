#!/bin/sh
# Convierte una Jetson o una Raspberry Pi (con escritorio) en un aparato Plató que arranca solo a pantalla completa.
# Uso: sudo sh device/install-kiosk.sh   (desde la carpeta del repositorio)
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
HOME_DIR="$(getent passwd "$USER_NAME" | cut -d: -f6)"
echo "Instalando Node.js, Chromium, FFmpeg y lo necesario para las voces…"
apt-get update
apt-get install -y nodejs chromium-browser 2>/dev/null || apt-get install -y nodejs chromium
apt-get install -y ffmpeg espeak-ng python3 python3-venv python3-numpy || true
node -e "process.exit(+process.versions.node.split('.')[0] >= 18 ? 0 : 1)" || { echo "Node.js es antiguo (<18). Instala uno reciente desde https://nodejs.org o nodesource."; exit 1; }
echo "Descargando las voces locales (Kokoro, ~120 MB)…"
su "$USER_NAME" -c "cd '$REPO' && node mcp/server.mjs --setup-voices" || echo "⚠️ Las voces no se han podido instalar ahora; repite luego: node mcp/server.mjs --setup-voices"
mkdir -p "$HOME_DIR/.config/autostart"
cat > "$HOME_DIR/.config/autostart/plato.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Plató
Comment=Plató a pantalla completa
Exec=sh -c 'sleep 4; xset s off -dpms 2>/dev/null; cd "$REPO" && node mcp/server.mjs --base --kiosk'
X-GNOME-Autostart-enabled=true
DESK
chown -R "$USER_NAME" "$HOME_DIR/.config/autostart"
mkdir -p "$HOME_DIR/.local/share/applications"
cat > "$HOME_DIR/.local/share/applications/plato.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Plató
Icon=$REPO/icons/icon-512.png
Exec=sh -c 'cd "$REPO" && node mcp/server.mjs --base'
Categories=Graphics;Game;Education;
DESK
chown -R "$USER_NAME" "$HOME_DIR/.local/share/applications"
echo "Listo. Activa el inicio de sesión automático del usuario $USER_NAME y reinicia: Plató arrancará a pantalla completa."
echo "Los móviles se unen desde la misma wifi a http://<ip-del-aparato>:7821/play.html"
