// Taller (servidor local): compila C++ de Arduino con arduino-cli y graba la placa real por USB
// (Arduino con arduino-cli; Raspberry Pi Pico con MicroPython usando mpremote).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { AI, envPy } from './localai.mjs';

const WIN = process.platform === 'win32', MAC = process.platform === 'darwin', ARM = process.arch === 'arm64';
const DIR = path.join(AI, 'arduino'); const BIN = path.join(DIR, WIN ? 'arduino-cli.exe' : 'arduino-cli');
const ENV = { ARDUINO_DIRECTORIES_DATA: path.join(DIR, 'data'), ARDUINO_DIRECTORIES_USER: path.join(DIR, 'user'), ARDUINO_DIRECTORIES_DOWNLOADS: path.join(DIR, 'staging'), ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false' };
const FQBN = { uno: 'arduino:avr:uno' };
export const tallerAsset = () => `arduino-cli_latest_${WIN ? 'Windows_64bit.zip' : MAC ? (ARM ? 'macOS_ARM64.tar.gz' : 'macOS_64bit.tar.gz') : (ARM ? 'Linux_ARM64.tar.gz' : 'Linux_64bit.tar.gz')}`;
export const cliPath = () => fs.existsSync(BIN) ? BIN : (spawnSync(WIN ? 'where' : 'which', ['arduino-cli'], { encoding: 'utf8' }).stdout || '').split(/\r?\n/)[0].trim();
export const tallerReady = () => !!cliPath() && fs.existsSync(path.join(DIR, '.ok'));

function cli(args, { timeout = 600000, log = () => {} } = {}) {
  return new Promise((ok, ko) => { const p = spawn(cliPath(), args, { env: { ...process.env, ...ENV }, windowsHide: true }); let out = '', err = '';
    p.stdout.on('data', d => { out += d; log(String(d).trim().slice(-160)); }); p.stderr.on('data', d => { err += d; });
    const t = setTimeout(() => p.kill(), timeout); p.on('error', e => { clearTimeout(t); ko(e); }); p.on('close', c => { clearTimeout(t); c === 0 ? ok(out) : ko(Object.assign(new Error(clean(err || out)), { log: err || out })); }); });
}
// Mensajes de error de gcc más legibles: solo «línea N: mensaje».
function clean(s) { const lines = String(s).split(/\r?\n/).filter(l => /error|Error/.test(l)).map(l => l.replace(/^.*?sketch\.ino:(\d+):(\d+):\s*/, 'línea $1: ').replace(/^.*?error:\s*/, '')).slice(0, 6); return lines.join('\n') || String(s).trim().split('\n').slice(-4).join('\n'); }

// Se llama desde el pack «taller» de IA local.
export async function installTaller(j, download, extract) {
  fs.mkdirSync(DIR, { recursive: true });
  if (!cliPath()) { j.say('Descargando arduino-cli…'); const f = await download('https://downloads.arduino.cc/arduino-cli/' + tallerAsset(), path.join(AI, 'cache', tallerAsset()), j.dl); extract(f, DIR); if (!WIN) fs.chmodSync(BIN, 0o755); }
  j.say('Preparando el compilador de Arduino (núcleo AVR, ~150 MB)…');
  await cli(['core', 'update-index'], { log: j.log }); await cli(['core', 'install', 'arduino:avr'], { log: j.log });
  j.say('Librerías básicas (Servo, LiquidCrystal)…'); await cli(['lib', 'install', 'Servo', 'LiquidCrystal'], { log: j.log }).catch(e => j.log('Aviso: ' + e.message));
  fs.writeFileSync(path.join(DIR, '.ok'), new Date().toISOString());
}

async function compile(board, code) {
  if (!tallerReady()) throw new Error('Falta el compilador: instala «Taller: compilar y grabar» en Ajustes → IA local');
  const sk = path.join(DIR, 'build', 'sketch'); fs.rmSync(path.dirname(sk), { recursive: true, force: true }); fs.mkdirSync(sk, { recursive: true }); fs.writeFileSync(path.join(sk, 'sketch.ino'), code);
  const out = path.join(DIR, 'build', 'out'); const args = ['compile', '--fqbn', FQBN[board] || FQBN.uno, '--output-dir', out, sk];
  try { await cli(args); }
  catch (e) { // ¿falta una librería? La instalo y repito una vez
    const m = /fatal error: ([\w.\/-]+)\.h: No such file/.exec(e.log || ''); if (!m) throw e;
    await cli(['lib', 'install', m[1].split('/').pop()]).catch(() => { throw new Error(`Falta la librería «${m[1]}» y no la encuentro en el gestor de Arduino`); }); await cli(args); }
  const hex = path.join(out, 'sketch.ino.hex'); return { hex: fs.readFileSync(hex, 'utf8'), size: fs.statSync(path.join(out, 'sketch.ino.bin')).size || null, out };
}
async function upload(board, code) {
  if (board === 'pico') { // MicroPython: copio main.py y reinicio
    const py = envPy('taller'); if (!fs.existsSync(py)) throw new Error('Falta mpremote: instala «Taller: compilar y grabar» en Ajustes → IA local');
    const f = path.join(DIR, 'main.py'); fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(f, code);
    await new Promise((ok, ko) => { const p = spawn(py, ['-m', 'mpremote', 'connect', 'auto', 'fs', 'cp', f, ':main.py', '+', 'reset'], { windowsHide: true }); let e = ''; p.stderr.on('data', d => e += d); p.stdout.on('data', d => e += d);
      p.on('close', c => c === 0 ? ok() : ko(new Error(/no device found|failed to access/i.test(e) ? 'No encuentro la Pico: conéctala por USB (con MicroPython instalado) y cierra Thonny si lo tienes abierto.' : e.trim().split('\n').slice(-2).join(' ')))); });
    return { text: 'main.py copiado a la Pico y reiniciada: ya está funcionando.' };
  }
  const { out } = await compile(board, code);
  const list = JSON.parse(await cli(['board', 'list', '--format', 'json'])); const ports = (list.detected_ports || list || []).filter(p => p.port && /serial|usb/i.test(p.port.protocol + p.port.address));
  const pick = ports.find(p => (p.matching_boards || []).some(b => b.fqbn === FQBN[board])) || ports[0];
  if (!pick) throw new Error('No veo ninguna placa por USB. Conéctala y vuelve a probar.');
  await cli(['upload', '-p', pick.port.address, '--fqbn', FQBN[board], '--input-dir', out]);
  return { text: `Grabado en ${pick.port.address}${pick.matching_boards && pick.matching_boards[0] ? ' (' + pick.matching_boards[0].name + ')' : ''}.` };
}

export async function tallerRoute(req, res, url, { readJSON, json }) {
  const p = url.pathname; if (!p.startsWith('/api/taller/')) return false;
  try {
    if (p === '/api/taller/status') return json(res, 200, { ready: tallerReady(), cli: !!cliPath(), mpremote: fs.existsSync(envPy('taller')) }), true;
    if (p === '/api/taller/compile' && req.method === 'POST') { const b = await readJSON(req); const r = await compile(b.board || 'uno', String(b.code || '')); return json(res, 200, { hex: r.hex, size: r.size }), true; }
    if (p === '/api/taller/upload' && req.method === 'POST') { const b = await readJSON(req); return json(res, 200, await upload(b.board || 'uno', String(b.code || ''))), true; }
  } catch (e) { return json(res, 200, { error: e.message, log: e.log ? String(e.log).slice(-3000) : undefined }), true; }
  json(res, 404, { error: 'No existe ' + p }); return true;
}
