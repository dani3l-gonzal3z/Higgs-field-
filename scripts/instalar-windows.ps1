# Instalador de Plató para Windows (x64 y ARM64). También sirve para actualizar: vuelve a ejecutarlo.
#   irm https://raw.githubusercontent.com/dani3l-gonzal3z/Higgs-field-/main/scripts/instalar-windows.ps1 | iex
# Tus clases, juegos y ajustes no se tocan (viven en el navegador y en %USERPROFILE%\.plato-studio).
$ErrorActionPreference = 'Stop'
$dest = Join-Path $env:USERPROFILE 'Plato'
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Need-Winget { if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'No encuentro winget (Instalador de aplicaciones). Instálalo desde la Microsoft Store y vuelve a ejecutar esto.' } }

Write-Host "`n== Plató ==" -ForegroundColor Yellow

Write-Host '1/4 · Node.js' -ForegroundColor Cyan
if (Get-Command node -ErrorAction SilentlyContinue) { Write-Host "  Ya está: $(node -v)" }
else { Need-Winget; winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent; Refresh-Path
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js se instaló pero esta ventana no lo ve: ciérrala, abre otra PowerShell y vuelve a ejecutar el instalador.' } }

Write-Host '2/4 · FFmpeg (para exportar montajes en segundos)' -ForegroundColor Cyan
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) { Write-Host '  Ya está.' }
else { try { Need-Winget; winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements --silent; Refresh-Path } catch { Write-Host "  (Me lo salto: $($_.Exception.Message). Plató funciona igual, solo exporta más lento.)" -ForegroundColor DarkYellow } }

Write-Host '3/4 · Descargo Plató' -ForegroundColor Cyan
$zip = Join-Path $env:TEMP 'plato-main.zip'; $tmp = Join-Path $env:TEMP 'plato-main'
Invoke-WebRequest 'https://github.com/dani3l-gonzal3z/Higgs-field-/archive/refs/heads/main.zip' -OutFile $zip -UseBasicParsing
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive $zip $tmp -Force
$src = Get-ChildItem $tmp -Directory | Select-Object -First 1
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $src.FullName '*') $dest -Recurse -Force
Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "  En $dest"

Write-Host '4/4 · Acceso directo en el escritorio' -ForegroundColor Cyan
$desk = [Environment]::GetFolderPath('Desktop'); $lnk = Join-Path $desk 'Plató.lnk'
$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut($lnk)
$s.TargetPath = Join-Path $dest 'Plato.cmd'; $s.WorkingDirectory = $dest; $s.WindowStyle = 7; $s.Description = 'Plató: aprende, cuenta, juega y crea'
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) { $s.IconLocation = "$edge,0" }
$s.Save(); Write-Host "  $lnk"

Write-Host "`nListo. Abro Plató…" -ForegroundColor Green
Write-Host 'Voces gratis sin internet (opcional, tarda unos minutos):  node "$env:USERPROFILE\Plato\mcp\server.mjs" --setup-voices' -ForegroundColor DarkGray
Start-Process (Join-Path $dest 'Plato.cmd') -WorkingDirectory $dest
