// IA local de Plató: detecta el equipo, instala por packs (Python con uv, Ollama, ComfyUI y sus modelos, audio, agentes),
// arranca los servicios y hace de puente. Todo queda en ~/.plato-studio/ai y se puede borrar desde Ajustes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONF = path.join(os.homedir(), '.plato-studio');
export const AI = path.join(CONF, 'ai');
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const ARM = process.arch === 'arm64';
const exe = n => WIN ? n + '.exe' : n;
const HF = 'https://huggingface.co/';
const GH = 'https://github.com/';
fs.mkdirSync(AI, { recursive: true });

/* ---------- Equipo ---------- */
let HW = null;
function run(cmd, args, timeout = 8000) { try { const r = spawnSync(cmd, args, { timeout, encoding: 'utf8', windowsHide: true }); return r.status === 0 ? String(r.stdout || '').trim() : ''; } catch (e) { return ''; } }
function freeGB(dir) { try { const s = fs.statfsSync(dir); return Math.round(s.bavail * s.bsize / 1e9); } catch (e) { return null; } }
export function hardware(force = false) {
  if (HW && !force) return HW;
  const ram = Math.round(os.totalmem() / 1e9), cpus = os.cpus() || [];
  const h = { os: process.platform, arch: process.arch, ram, cpu: (cpus[0] && cpus[0].model || '').trim(), cores: cpus.length, disk: freeGB(AI), gpu: null };
  const nv = run('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits']);
  if (nv) { const [name, mem, driver] = nv.split('\n')[0].split(',').map(s => s.trim()); h.gpu = { vendor: 'nvidia', name, vram: Math.round(+mem / 1024), driver }; }
  else if (MAC && ARM) h.gpu = { vendor: 'apple', name: run('sysctl', ['-n', 'machdep.cpu.brand_string']) || 'Apple Silicon', vram: ram, unified: true };
  else if (WIN) { const n = run('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)']); if (n) h.gpu = { vendor: /amd|radeon/i.test(n) ? 'amd' : /intel/i.test(n) ? 'intel' : /qualcomm|adreno/i.test(n) ? 'qualcomm' : 'other', name: n, vram: 0 }; }
  const v = h.gpu && h.gpu.vendor === 'nvidia' ? h.gpu.vram : 0;
  // Qué puede hacer de verdad este equipo (sin humo).
  h.tier = v >= 20 ? 'alta' : v >= 14 ? 'media' : v >= 10 ? 'justa' : v >= 6 ? 'baja' : h.gpu && h.gpu.vendor === 'apple' ? 'mac' : 'cpu';
  h.can = {
    llm: true, mask: true, audio: true,
    objeto: v >= 8 || (h.tier === 'mac' && ram >= 32),
    personaje: (v >= 16 && ram >= 32) || (v >= 12 && ram >= 48) || (h.tier === 'mac' && ram >= 64),
  };
  h.verdict = {
    alta: 'Gráfica de sobra: vídeo local cómodo (borrador en pocos minutos).',
    media: 'Vídeo local bien. Personaje en fp8 con descarga parcial a la RAM.',
    justa: 'Vídeo local lento. Personaje solo con 48 GB de RAM o más; objetos sí.',
    baja: 'Máscaras, audio y objetos pequeños. El cambio de personaje no cabe.',
    mac: 'Apple Silicon: máscaras, audio y LLM bien; vídeo experimental y lento.',
    cpu: 'Sin gráfica NVIDIA: máscaras, audio, voces y LLM sí; vídeo con IA no.',
  }[h.tier];
  // LLM recomendado según memoria (la RAM manda si no hay gráfica).
  const mem = v ? v : ram * 0.6;
  h.llm = mem >= 22 ? ['qwen3:30b', 'hermes3:8b', 'gemma3:27b'] : mem >= 12 ? ['qwen3:14b', 'gemma3:12b', 'hermes3:8b'] : mem >= 7 ? ['qwen3:8b', 'gemma3:4b', 'hermes3:8b'] : ['qwen3:4b', 'gemma3:4b', 'qwen3:1.7b'];
  return (HW = h);
}

/* ---------- Descargas con progreso, reanudables ---------- */
export async function download(url, dest, onp = () => {}, { minSize = 1 } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.statSync(dest).size >= minSize) { onp(1, 'ya estaba: ' + path.basename(dest)); return dest; }
  const tmp = dest + '.part'; let have = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
  const r = await fetch(url, { headers: have ? { range: `bytes=${have}-` } : {}, redirect: 'follow' });
  if (r.status === 416) { fs.renameSync(tmp, dest); return dest; }
  if (!r.ok) throw new Error(`No pude descargar ${path.basename(dest)} (${r.status}). ¿Hay internet?`);
  if (have && r.status !== 206) have = 0; // el servidor no admite reanudar
  const total = have + (+r.headers.get('content-length') || 0); const f = fs.createWriteStream(tmp, { flags: have ? 'a' : 'w' }); let n = have, t = 0;
  for await (const chunk of r.body) { if (!f.write(chunk)) await new Promise(ok => f.once('drain', ok)); n += chunk.length; const now = Date.now(); if (now - t > 400) { t = now; onp(total ? n / total : 0, `${path.basename(dest)} · ${(n / 1e9).toFixed(2)} / ${(total / 1e9).toFixed(2)} GB`); } }
  await new Promise(ok => f.end(ok)); fs.renameSync(tmp, dest); onp(1, 'descargado: ' + path.basename(dest)); return dest;
}
function extract(file, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const args = file.endsWith('.zst') ? ['--zstd', '-xf', file, '-C', dir] : ['-xf', file, '-C', dir]; // tar de Windows 10+ también abre .zip
  const r = spawnSync('tar', args, { stdio: 'pipe', windowsHide: true });
  if (r.status !== 0) throw new Error('No pude descomprimir ' + path.basename(file) + (file.endsWith('.zst') ? ' (instala zstd: sudo apt install zstd)' : '') + ': ' + String(r.stderr || '').slice(0, 200));
}
function sh(cmd, args, { cwd, env, log = () => {}, timeout = 0 } = {}) {
  return new Promise((ok, ko) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, shell: WIN && /\.(cmd|bat)$/i.test(cmd) });
    let tail = ''; const eat = d => { const s = String(d); tail = (tail + s).slice(-4000); for (const l of s.split(/\r?\n/)) if (l.trim()) log(l.trim().slice(0, 200)); };
    p.stdout.on('data', eat); p.stderr.on('data', eat); let to = timeout ? setTimeout(() => p.kill(), timeout) : null;
    p.on('error', e => { clearTimeout(to); ko(e); }); p.on('close', c => { clearTimeout(to); c === 0 ? ok(tail) : ko(new Error(`${path.basename(cmd)} terminó con error ${c}: ${tail.slice(-400)}`)); });
  });
}

/* ---------- Python con uv (no hace falta tener Python instalado) ---------- */
const UVDIR = path.join(AI, 'uv'), UV = path.join(UVDIR, exe('uv'));
const UVENV = { UV_PYTHON_INSTALL_DIR: path.join(AI, 'python'), UV_CACHE_DIR: path.join(AI, 'cache', 'uv'), UV_LINK_MODE: 'copy' };
const envDir = n => path.join(AI, 'envs', n);
export const envPy = n => path.join(envDir(n), WIN ? 'Scripts/python.exe' : 'bin/python');
function uvAsset() {
  const a = ARM ? 'aarch64' : 'x86_64';
  return WIN ? `uv-${a}-pc-windows-msvc.zip` : MAC ? `uv-${a}-apple-darwin.tar.gz` : `uv-${a}-unknown-linux-gnu.tar.gz`;
}
async function ensureUV(job) {
  if (fs.existsSync(UV)) return UV;
  const sys = run(WIN ? 'where' : 'which', ['uv']).split(/\r?\n/)[0]; if (sys) return sys;
  job.say('Descargando uv (gestor de Python, ~20 MB)…');
  const f = await download(GH + 'astral-sh/uv/releases/latest/download/' + uvAsset(), path.join(AI, 'cache', uvAsset()), job.dl);
  const tmp = path.join(AI, 'cache', 'uv-x'); fs.rmSync(tmp, { recursive: true, force: true }); extract(f, tmp);
  const found = walk(tmp).find(p => path.basename(p) === exe('uv')); if (!found) throw new Error('El paquete de uv no traía el ejecutable');
  fs.mkdirSync(UVDIR, { recursive: true }); for (const n of [exe('uv'), exe('uvx')]) { const s = path.join(path.dirname(found), n); if (fs.existsSync(s)) fs.copyFileSync(s, path.join(UVDIR, n)); }
  if (!WIN) fs.chmodSync(UV, 0o755); return UV;
}
function walk(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; }
async function ensureEnv(job, name, py = '3.12') {
  const uv = await ensureUV(job); if (fs.existsSync(envPy(name))) return envPy(name);
  job.say(`Preparando Python ${py} para «${name}»…`);
  await sh(uv, ['venv', envDir(name), '--python', py, '--seed'], { env: UVENV, log: job.log });
  return envPy(name);
}
async function pip(job, name, args) { const uv = await ensureUV(job); await sh(uv, ['pip', 'install', '--python', envPy(name), ...args], { env: UVENV, log: job.log }); }
function torchIndex() { const h = hardware(); if (h.gpu && h.gpu.vendor === 'nvidia') return 'https://download.pytorch.org/whl/cu128'; if (MAC) return null; return 'https://download.pytorch.org/whl/cpu'; }

/* ---------- Catálogo de packs ---------- */
const COMFY = path.join(AI, 'ComfyUI'), MODELS = path.join(COMFY, 'models');
export const COMFY_IN = path.join(AI, 'comfy-in'), COMFY_OUT = path.join(AI, 'comfy-out');
const M = (dir, name, url, gb) => ({ dir, name, url, gb });
const WAN_COMMON = [
  M('text_encoders', 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', HF + 'Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', 6.7),
  M('vae', 'wan_2.1_vae.safetensors', HF + 'Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors', 0.25),
];
export const PACKS = [
  { id: 'python', cat: 'base', title: 'Motor de Python', desc: 'Python propio con uv, aislado del sistema. Lo necesitan el vídeo y el audio.', gb: 0.1, license: 'MIT / PSF' },
  { id: 'ollama', cat: 'cerebro', title: 'Ollama', desc: 'Modelos de lenguaje en tu equipo: el director, el profe, las marcas y el asistente funcionan sin claves.', gb: 1.5, license: 'MIT' },
  { id: 'comfy', cat: 'video', needs: ['python'], title: 'Motor de vídeo (ComfyUI)', desc: 'Corre los modelos de vídeo optimizados (carga por partes, fp8). Plató lo maneja solo, no tienes que abrirlo.', gb: 4, license: 'GPL-3.0', gpu: true },
  { id: 'sam', cat: 'video', needs: ['comfy'], title: 'Máscaras (SAM 3.1)', desc: 'Toca a alguien o algo y lo sigue por todo el clip. Funciona hasta sin gráfica (más lento).', gb: 1.7, license: 'SAM License (Meta)',
    files: [M('checkpoints', 'sam3.1_multiplex_fp16.safetensors', HF + 'Comfy-Org/sam3.1/resolve/main/checkpoints/sam3.1_multiplex_fp16.safetensors', 1.7)] },
  { id: 'personaje', cat: 'video', needs: ['comfy', 'sam'], title: 'Cambiar persona por personaje (Wan 2.2 Animate)', desc: 'Sustituye a la persona por tu personaje copiando movimiento, cara y luz. 14B en fp8 con LoRA de 4-6 pasos.', gb: 28, license: 'Apache-2.0', gpu: true, can: 'personaje',
    nodes: [{ repo: 'kijai/ComfyUI-WanAnimatePreprocess', dir: 'ComfyUI-WanAnimatePreprocess' }],
    files: [
      M('diffusion_models', 'Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors', HF + 'Kijai/WanVideo_comfy_fp8_scaled/resolve/main/Wan22Animate/Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors', 18.4),
      ...WAN_COMMON,
      M('clip_vision', 'clip_vision_h.safetensors', HF + 'Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors', 1.26),
      M('loras', 'WanAnimate_relight_lora_fp16.safetensors', HF + 'Kijai/WanVideo_comfy/resolve/main/LoRAs/Wan22_relight/WanAnimate_relight_lora_fp16.safetensors', 1.4),
      M('loras', 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', HF + 'Kijai/WanVideo_comfy/resolve/main/Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', 0.74),
      M('detection', 'yolov10m.onnx', HF + 'Wan-AI/Wan2.2-Animate-14B/resolve/main/process_checkpoint/det/yolov10m.onnx', 0.06),
      M('detection', 'vitpose-l-wholebody.onnx', HF + 'JunkyByte/easy_ViTPose/resolve/main/onnx/wholebody/vitpose-l-wholebody.onnx', 1.2),
    ] },
  { id: 'objeto', cat: 'video', needs: ['comfy', 'sam'], title: 'Cambiar o borrar objetos (Wan VACE)', desc: 'Rellena la zona de la máscara con lo que pidas (o con el fondo). Modelo de 1,3B: cabe en 8 GB.', gb: 11, license: 'Apache-2.0', gpu: true, can: 'objeto',
    files: [M('diffusion_models', 'wan2.1_vace_1.3B_fp16.safetensors', HF + 'Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_vace_1.3B_fp16.safetensors', 4.1), ...WAN_COMMON] },
  { id: 'fluidez', cat: 'video', needs: ['comfy'], title: 'Fluidez (interpolación FILM)', desc: 'Dobla los fotogramas del resultado para que se mueva suave al ritmo del vídeo original.', gb: 0.07, license: 'Apache-2.0',
    files: [M('frame_interpolation', 'film_net_fp16.safetensors', HF + 'Comfy-Org/frame_interpolation/resolve/main/frame_interpolation/film_net_fp16.safetensors', 0.07)] },
  { id: 'audio', cat: 'audio', needs: ['python'], title: 'Separar voz y música', desc: 'Saca la voz de la música (modelos UVR/MDX). Va bien en procesador.', gb: 0.6, license: 'MIT' },
  { id: 'voz', cat: 'audio', needs: ['python', 'audio'], title: 'Cambiar la voz (Seed-VC)', desc: 'Convierte la voz de tu clip en otra a partir de 10-20 s de muestra (o de una voz de Kokoro). Con gráfica va al momento; en procesador, lento.', gb: 2, license: 'GPL-3.0 (proceso aparte)' },
  { id: 'taller', cat: 'taller', needs: ['python'], title: 'Taller: compilar y grabar', desc: 'arduino-cli para compilar el C++ del Arduino y grabar tu placa por USB, y mpremote para pasar el código a una Pico real. La Pico simulada no lo necesita.', gb: 0.35, license: 'GPL-3.0 (arduino-cli) · MIT (mpremote)' },
  { id: 'opencode', cat: 'agentes', needs: ['ollama'], title: 'opencode', desc: 'Agente que usa tu modelo local y maneja Plató por MCP: le pides cosas en lenguaje normal.', gb: 0.15, license: 'MIT' },
  { id: 'hermes', cat: 'agentes', needs: ['ollama'], title: 'Hermes Agent', desc: 'Agente de Nous Research con memoria y habilidades. Plató lo conecta con su MCP; se instala con su propio instalador.', gb: 0.5, license: 'MIT', external: true },
];
const pack = id => PACKS.find(p => p.id === id);
const fileOk = f => { try { return fs.statSync(path.join(MODELS, f.dir, f.name)).size > 1e5; } catch (e) { return false; } };

/* ---------- Estado de cada pack ---------- */
export const OLLAMA_URL = process.env.PLATO_OLLAMA || 'http://127.0.0.1:11434';
const OLLAMA_BIN = path.join(AI, 'ollama', WIN ? 'ollama.exe' : MAC ? 'ollama' : 'bin/ollama');
const OPENCODE_BIN = path.join(AI, 'node', 'node_modules', '.bin', WIN ? 'opencode.cmd' : 'opencode');
async function ping(url, ms = 1500) { try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); return r.ok ? r : null; } catch (e) { return null; } }
export async function ollamaInfo() {
  const v = await ping(OLLAMA_URL + '/api/version'); if (!v) return { running: false, installed: fs.existsSync(OLLAMA_BIN) || !!run(WIN ? 'where' : 'which', ['ollama']) };
  const version = (await v.json()).version; let models = [];
  try { models = ((await (await fetch(OLLAMA_URL + '/api/tags')).json()).models || []).map(m => ({ name: m.name, gb: +(m.size / 1e9).toFixed(1), family: m.details && m.details.family, params: m.details && m.details.parameter_size })); } catch (e) {}
  return { running: true, installed: true, version, models };
}
function hermesBin() { return run(WIN ? 'where' : 'which', ['hermes']).split(/\r?\n/)[0] || (fs.existsSync(path.join(os.homedir(), '.local/bin/hermes')) ? path.join(os.homedir(), '.local/bin/hermes') : ''); }
function packState(p) {
  if (JOBS.has(p.id) && !JOBS.get(p.id).done) return 'installing';
  switch (p.id) {
    case 'python': return fs.existsSync(UV) || run(WIN ? 'where' : 'which', ['uv']) ? 'ok' : 'missing';
    case 'ollama': return fs.existsSync(OLLAMA_BIN) || run(WIN ? 'where' : 'which', ['ollama']) ? 'ok' : 'missing';
    case 'comfy': return fs.existsSync(path.join(COMFY, 'main.py')) && fs.existsSync(envPy('comfy')) ? 'ok' : 'missing';
    case 'audio': return fs.existsSync(envPy('audio')) && fs.existsSync(path.join(envDir('audio'), '.ok')) ? 'ok' : 'missing';
    case 'voz': return fs.existsSync(path.join(AI, 'seed-vc', 'inference.py')) && fs.existsSync(path.join(envDir('seedvc'), '.ok')) ? 'ok' : 'missing';
    case 'taller': return fs.existsSync(path.join(AI, 'arduino', '.ok')) && fs.existsSync(envPy('taller')) ? 'ok' : fs.existsSync(path.join(AI, 'arduino', '.ok')) || fs.existsSync(envPy('taller')) ? 'partial' : 'missing';
    case 'opencode': return fs.existsSync(OPENCODE_BIN) || run(WIN ? 'where' : 'which', ['opencode']) ? 'ok' : 'missing';
    case 'hermes': return hermesBin() ? (hermesLinked() ? 'ok' : 'partial') : 'missing';
  }
  if (p.files) { const n = p.files.filter(fileOk).length; const nodesOk = (p.nodes || []).every(x => fs.existsSync(path.join(COMFY, 'custom_nodes', x.dir))); return n === p.files.length && nodesOk ? 'ok' : n || nodesOk && p.nodes ? 'partial' : 'missing'; }
  return 'missing';
}
function fit(p) {
  const h = hardware(); const need = (p.files || []).filter(f => !fileOk(f)).reduce((a, f) => a + f.gb, 0) || (packState(p) === 'ok' ? 0 : p.gb);
  if (h.disk != null && need > h.disk - 5) return { ok: false, why: `Necesita ~${Math.ceil(need)} GB y quedan ${h.disk} GB libres` };
  if (p.can && !h.can[p.can]) return { ok: false, why: p.can === 'personaje' ? 'Pide NVIDIA de 16 GB + 32 GB de RAM (o 12 GB + 48 GB)' : 'Pide una NVIDIA de 8 GB o más', soft: true };
  if (p.gpu && h.tier === 'cpu' && p.id === 'comfy') return { ok: true, why: 'Sin NVIDIA: solo para máscaras (en procesador)' };
  return { ok: true };
}
export async function aiStatus() {
  const h = hardware(); const ol = await ollamaInfo();
  return { hw: h, packs: PACKS.map(p => ({ id: p.id, cat: p.cat, title: p.title, desc: p.desc, license: p.license, gb: p.gb, needs: p.needs || [], external: !!p.external || (p.id === 'ollama' && ol.running && !fs.existsSync(OLLAMA_BIN)), state: p.id === 'ollama' && ol.running ? 'ok' : packState(p), fit: fit(p), job: JOBS.has(p.id) ? jobView(JOBS.get(p.id)) : null })),
    services: { ollama: ol, comfy: { running: !!(await ping(comfyURL() + '/system_stats')), url: comfyURL(), managed: !!COMFY_PROC }, opencode: { running: !!OC, url: OC ? OC.url : null }, hermes: { bin: hermesBin(), linked: hermesLinked() } } };
}

// Resumen rápido para /api/caps: qué hay listo para usar ahora mismo.
export async function aiCaps() { const ol = await ollamaInfo(); const st = id => packState(pack(id)) === 'ok';
  return { taller: st('taller'), ollama: { running: ol.running, installed: ol.installed, models: (ol.models || []).map(m => m.name) }, video: st('comfy'), sam: st('sam'), personaje: st('personaje'), objeto: st('objeto'), audio: st('audio'), voz: st('voz'), tier: hardware().tier }; }

/* ---------- Trabajos de instalación ---------- */
const JOBS = new Map();
const jobView = j => ({ id: j.id, p: j.p, step: j.step, log: j.lines.slice(-12), done: j.done, error: j.error });
function newJob(id) {
  const j = { id, p: 0, step: '', lines: [], done: false, error: null };
  j.log = l => { j.lines.push(l); if (j.lines.length > 400) j.lines.splice(0, 100); };
  j.say = s => { j.step = s; j.log('▶ ' + s); };
  j.dl = (p, s) => { j.p = Math.max(0, Math.min(1, p)); if (s) j.step = s; };
  JOBS.set(id, j); return j;
}
export function jobStatus(id) { const j = JOBS.get(id); return j ? jobView(j) : null; }
export function install(id) {
  const p = pack(id); if (!p) throw new Error('No existe el pack ' + id);
  if (JOBS.has(id) && !JOBS.get(id).done) return jobView(JOBS.get(id));
  const j = newJob(id);
  (async () => {
    try {
      for (const d of p.needs || []) if (packState(pack(d)) !== 'ok') { j.say('Antes: ' + pack(d).title); await (INSTALL[d] || installFiles)(j, pack(d)); }
      j.say(p.title); await (INSTALL[id] || installFiles)(j, p); j.p = 1; j.step = 'Listo'; j.log('✅ ' + p.title + ' instalado');
    } catch (e) { j.error = e.message; j.log('❌ ' + e.message); }
    j.done = true; HW = null;
  })();
  return jobView(j);
}
async function installFiles(j, p) {
  for (const n of p.nodes || []) await customNode(j, n);
  const files = (p.files || []).filter(f => !fileOk(f)); const total = files.reduce((a, f) => a + f.gb, 0) || 1; let done = 0;
  for (const f of files) { j.say(`Descargando ${f.name} (~${f.gb} GB)`); await download(f.url, path.join(MODELS, f.dir, f.name), (q, s) => j.dl((done + q * f.gb) / total, s), { minSize: 1e5 }); done += f.gb; }
}
async function customNode(j, n) {
  const dir = path.join(COMFY, 'custom_nodes', n.dir); if (fs.existsSync(dir)) return;
  j.say('Nodos: ' + n.repo);
  if (run('git', ['--version'])) await sh('git', ['clone', '--depth', '1', GH + n.repo + '.git', dir], { log: j.log });
  else { const z = await download(`${GH}${n.repo}/archive/refs/heads/main.zip`, path.join(AI, 'cache', n.dir + '.zip'), j.dl); const tmp = dir + '.x'; extract(z, tmp); fs.renameSync(path.join(tmp, fs.readdirSync(tmp)[0]), dir); fs.rmSync(tmp, { recursive: true, force: true }); }
  const req = path.join(dir, 'requirements.txt');
  if (fs.existsSync(req)) { const nv = hardware().gpu && hardware().gpu.vendor === 'nvidia'; const lines = fs.readFileSync(req, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')).map(s => !nv && s === 'onnxruntime-gpu' ? 'onnxruntime' : s); if (lines.length) await pip(j, 'comfy', lines); }
}
const INSTALL = {
  async python(j) { await ensureUV(j); },
  async ollama(j) {
    if (packState(pack('ollama')) === 'ok') return;
    const asset = WIN ? `ollama-windows-${ARM ? 'arm64' : 'amd64'}.zip` : MAC ? 'ollama-darwin.tgz' : `ollama-linux-${ARM ? 'arm64' : 'amd64'}.tar.zst`;
    j.say('Descargando Ollama (' + asset + ')…');
    const f = await download(GH + 'ollama/ollama/releases/latest/download/' + asset, path.join(AI, 'cache', asset), j.dl);
    let arc = f; if (f.endsWith('.zst') && zlib.createZstdDecompress) { j.say('Descomprimiendo…'); arc = f.replace(/\.zst$/, ''); await pipeline(fs.createReadStream(f), zlib.createZstdDecompress(), fs.createWriteStream(arc)); fs.rmSync(f, { force: true }); }
    extract(arc, path.join(AI, 'ollama')); fs.rmSync(arc, { force: true }); if (!WIN) try { fs.chmodSync(OLLAMA_BIN, 0o755); } catch (e) {}
    await startOllama(j);
  },
  async comfy(j) {
    if (!fs.existsSync(path.join(COMFY, 'main.py'))) {
      j.say('Descargando ComfyUI…');
      if (run('git', ['--version'])) await sh('git', ['clone', '--depth', '1', GH + 'comfyanonymous/ComfyUI.git', COMFY], { log: j.log });
      else { const z = await download(GH + 'comfyanonymous/ComfyUI/archive/refs/heads/master.zip', path.join(AI, 'cache', 'comfyui.zip'), j.dl); const tmp = COMFY + '.x'; extract(z, tmp); fs.renameSync(path.join(tmp, fs.readdirSync(tmp)[0]), COMFY); fs.rmSync(tmp, { recursive: true, force: true }); }
    }
    await ensureEnv(j, 'comfy', '3.12');
    const idx = torchIndex(); j.say('Instalando PyTorch ' + (idx ? (idx.includes('cu') ? 'con CUDA' : 'para procesador') : 'para Mac') + ' (lo más pesado, ~2-3 GB)…');
    await pip(j, 'comfy', ['torch', 'torchvision', 'torchaudio', ...(idx ? ['--index-url', idx] : [])]);
    j.say('Instalando lo que pide ComfyUI…'); await pip(j, 'comfy', ['-r', path.join(COMFY, 'requirements.txt')]);
    for (const d of [COMFY_IN, COMFY_OUT]) fs.mkdirSync(d, { recursive: true });
  },
  async audio(j) {
    await ensureEnv(j, 'audio', '3.11'); const nv = hardware().gpu && hardware().gpu.vendor === 'nvidia';
    j.say('Instalando el separador de audio…'); await pip(j, 'audio', [nv ? 'audio-separator[gpu]' : 'audio-separator[cpu]']);
    fs.writeFileSync(path.join(envDir('audio'), '.ok'), new Date().toISOString());
  },
  async voz(j) {
    const dir = path.join(AI, 'seed-vc');
    if (!fs.existsSync(path.join(dir, 'inference.py'))) { j.say('Descargando Seed-VC…');
      if (run('git', ['--version'])) await sh('git', ['clone', '--depth', '1', GH + 'Plachtaa/seed-vc.git', dir], { log: j.log });
      else { const z = await download(GH + 'Plachtaa/seed-vc/archive/refs/heads/main.zip', path.join(AI, 'cache', 'seed-vc.zip'), j.dl); const tmp = dir + '.x'; extract(z, tmp); fs.renameSync(path.join(tmp, fs.readdirSync(tmp)[0]), dir); fs.rmSync(tmp, { recursive: true, force: true }); } }
    await ensureEnv(j, 'seedvc', '3.10'); const idx = torchIndex();
    j.say('PyTorch para Seed-VC…'); await pip(j, 'seedvc', ['torch', 'torchaudio', ...(idx ? ['--index-url', idx] : [])]);
    j.say('Dependencias de Seed-VC…'); const req = path.join(dir, MAC ? 'requirements-mac.txt' : 'requirements.txt');
    const lines = fs.readFileSync(fs.existsSync(req) ? req : path.join(dir, 'requirements.txt'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#') && !s.startsWith('--') && !/^torch(audio|vision)?\b/.test(s));
    await pip(j, 'seedvc', lines); fs.writeFileSync(path.join(envDir('seedvc'), '.ok'), new Date().toISOString());
  },
  async taller(j) {
    const { installTaller } = await import('./taller.mjs');
    if (!fs.existsSync(path.join(AI, 'arduino', '.ok'))) await installTaller(j, download, extract);
    if (!fs.existsSync(envPy('taller'))) { await ensureEnv(j, 'taller', '3.12'); j.say('Instalando mpremote (para la Pico real)…'); await pip(j, 'taller', ['mpremote']); }
  },
  async opencode(j) {
    if (packState(pack('opencode')) === 'ok') return; const npm = WIN ? 'npm.cmd' : 'npm';
    j.say('Instalando opencode con npm…'); fs.mkdirSync(path.join(AI, 'node'), { recursive: true });
    await sh(npm, ['install', '--prefix', path.join(AI, 'node'), 'opencode-ai@latest'], { log: j.log });
  },
  async hermes(j) {
    if (!hermesBin()) throw new Error('Hermes se instala con su instalador oficial. Con Ollama instalado, abre una terminal y escribe: ollama launch hermes. Después vuelve y pulsa «Conectar con Plató».');
    linkHermes(); j.log('Conectado con Plató por MCP.');
  },
};
export function remove(id) {
  const p = pack(id); if (!p) throw new Error('No existe el pack ' + id);
  const rm = x => fs.rmSync(x, { recursive: true, force: true });
  if (id === 'ollama') { stopOllama(); rm(path.join(AI, 'ollama')); }
  else if (id === 'comfy') { stopComfy(); rm(COMFY); rm(envDir('comfy')); }
  else if (id === 'python') { rm(UVDIR); rm(path.join(AI, 'python')); }
  else if (id === 'audio') rm(envDir('audio'));
  else if (id === 'voz') { rm(path.join(AI, 'seed-vc')); rm(envDir('seedvc')); }
  else if (id === 'opencode') { stopOpencode(); rm(path.join(AI, 'node')); }
  else if (id === 'taller') { rm(path.join(AI, 'arduino')); rm(envDir('taller')); }
  else if (id === 'hermes') unlinkHermes();
  else { const shared = new Set(PACKS.filter(q => q.id !== id && packState(q) !== 'missing').flatMap(q => (q.files || []).map(f => f.name)));
    for (const f of p.files || []) if (!shared.has(f.name)) rm(path.join(MODELS, f.dir, f.name));
    for (const n of p.nodes || []) rm(path.join(COMFY, 'custom_nodes', n.dir)); }
  JOBS.delete(id); return { ok: true };
}

/* ---------- Servicios ---------- */
let OLLAMA_PROC = null, COMFY_PROC = null, OC = null;
export async function startOllama(j) {
  if (await ping(OLLAMA_URL + '/api/version')) return true;
  const bin = fs.existsSync(OLLAMA_BIN) ? OLLAMA_BIN : run(WIN ? 'where' : 'which', ['ollama']).split(/\r?\n/)[0]; if (!bin) throw new Error('Ollama no está instalado');
  j && j.say('Arrancando Ollama…');
  OLLAMA_PROC = spawn(bin, ['serve'], { env: { ...process.env, OLLAMA_HOST: new URL(OLLAMA_URL).host, OLLAMA_KEEP_ALIVE: '10m', OLLAMA_FLASH_ATTENTION: '1' }, stdio: 'ignore', windowsHide: true });
  OLLAMA_PROC.on('exit', () => { OLLAMA_PROC = null; });
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 500)); if (await ping(OLLAMA_URL + '/api/version')) return true; }
  throw new Error('Ollama no arrancó');
}
export function stopOllama() { try { OLLAMA_PROC && OLLAMA_PROC.kill(); } catch (e) {} OLLAMA_PROC = null; }
export const comfyURL = () => process.env.PLATO_COMFY || 'http://127.0.0.1:8188';
export const comfyManaged = () => !process.env.PLATO_COMFY;
export async function startComfy(log = () => {}) {
  if (await ping(comfyURL() + '/system_stats')) return comfyURL();
  if (!comfyManaged()) throw new Error('Tu ComfyUI (' + comfyURL() + ') no responde');
  if (packState(pack('comfy')) !== 'ok') throw new Error('Falta el motor de vídeo: instálalo en Ajustes → IA local');
  const h = hardware(); const args = ['main.py', '--listen', '127.0.0.1', '--port', String(new URL(comfyURL()).port || 8188), '--disable-auto-launch', '--input-directory', COMFY_IN, '--output-directory', COMFY_OUT, '--preview-method', 'none'];
  if (h.tier === 'cpu') args.push('--cpu'); else if (h.tier === 'baja' || h.tier === 'justa') args.push('--reserve-vram', '0.8');
  log('Arrancando el motor de vídeo…');
  COMFY_PROC = spawn(envPy('comfy'), args, { cwd: COMFY, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const lines = []; const eat = d => { for (const l of String(d).split(/\r?\n/)) if (l.trim()) { lines.push(l); if (lines.length > 200) lines.shift(); } };
  COMFY_PROC.stdout.on('data', eat); COMFY_PROC.stderr.on('data', eat); COMFY_PROC.on('exit', () => { COMFY_PROC = null; });
  for (let i = 0; i < 240; i++) { await new Promise(r => setTimeout(r, 1000)); if (!COMFY_PROC) throw new Error('El motor de vídeo se cerró al arrancar: ' + lines.slice(-6).join(' | ')); if (await ping(comfyURL() + '/system_stats')) return comfyURL(); }
  throw new Error('El motor de vídeo tarda demasiado en arrancar');
}
export function stopComfy() { try { COMFY_PROC && COMFY_PROC.kill(); } catch (e) {} COMFY_PROC = null; }

/* ---------- Agentes: opencode y Hermes, con tu modelo local y el MCP de Plató ---------- */
const MCP_CMD = [process.execPath, path.join(ROOT, 'mcp', 'server.mjs')];
function opencodeConfig(model) {
  const cfg = { $schema: 'https://opencode.ai/config.json', model: 'ollama/' + model,
    provider: { ollama: { npm: '@ai-sdk/openai-compatible', name: 'Ollama (local)', options: { baseURL: OLLAMA_URL + '/v1' }, models: { [model]: { name: model } } } },
    mcp: { plato: { type: 'local', command: MCP_CMD, enabled: true } } };
  const f = path.join(AI, 'opencode.json'); fs.writeFileSync(f, JSON.stringify(cfg, null, 2)); return f;
}
export async function startOpencode(model) {
  if (OC) return OC; if (!model) throw new Error('Elige primero un modelo local (Ollama)');
  await startOllama(); const bin = fs.existsSync(OPENCODE_BIN) ? OPENCODE_BIN : run(WIN ? 'where' : 'which', ['opencode']).split(/\r?\n/)[0]; if (!bin) throw new Error('Instala opencode en Ajustes → IA local');
  const ws = path.join(AI, 'workspace'); fs.mkdirSync(ws, { recursive: true }); const port = 4096 + Math.floor(Math.random() * 400); const pass = crypto.randomBytes(12).toString('hex');
  const p = spawn(bin, ['serve', '--port', String(port), '--hostname', '127.0.0.1'], { cwd: ws, env: { ...process.env, OPENCODE_CONFIG: opencodeConfig(model), OPENCODE_SERVER_PASSWORD: pass }, stdio: 'ignore', windowsHide: true, shell: WIN });
  OC = { proc: p, url: `http://127.0.0.1:${port}`, auth: 'Basic ' + Buffer.from('opencode:' + pass).toString('base64'), model, session: null };
  p.on('exit', () => { OC = null; });
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 500)); try { const r = await fetch(OC.url + '/global/health', { headers: { authorization: OC.auth } }); if (r.ok) return OC; } catch (e) {} if (!OC) break; }
  stopOpencode(); throw new Error('opencode no arrancó');
}
export function stopOpencode() { try { OC && OC.proc.kill(); } catch (e) {} OC = null; }
export async function askAgent(text, model) {
  const oc = await startOpencode(model); const H = { authorization: oc.auth, 'content-type': 'application/json' };
  if (!oc.session) { const r = await fetch(oc.url + '/session', { method: 'POST', headers: H, body: JSON.stringify({ title: 'Plató' }) }); if (!r.ok) throw new Error('opencode: no pude abrir sesión'); oc.session = (await r.json()).id; }
  const r = await fetch(`${oc.url}/session/${oc.session}/message`, { method: 'POST', headers: H, body: JSON.stringify({ parts: [{ type: 'text', text }], model: { providerID: 'ollama', modelID: oc.model } }) });
  if (!r.ok) throw new Error('opencode: ' + (await r.text()).slice(0, 200));
  const m = await r.json(); const parts = m.parts || (m.info && m.parts) || [];
  return { text: parts.filter(x => x.type === 'text').map(x => x.text).join('\n').trim() || '(sin respuesta de texto)', tools: parts.filter(x => x.type === 'tool').map(x => x.tool) };
}
const HERMES_CFG = path.join(os.homedir(), '.hermes', 'config.yaml');
function hermesLinked() { try { return fs.readFileSync(HERMES_CFG, 'utf8').includes('plato-studio'); } catch (e) { return false; } }
function linkHermes() {
  fs.mkdirSync(path.dirname(HERMES_CFG), { recursive: true }); let y = fs.existsSync(HERMES_CFG) ? fs.readFileSync(HERMES_CFG, 'utf8') : '';
  if (y.includes('plato-studio')) return;
  const entry = `  plato-studio:  # añadido por Plató\n    command: ${JSON.stringify(MCP_CMD[0])}\n    args: [${JSON.stringify(MCP_CMD[1])}]\n`;
  y = /^mcp_servers:\s*$/m.test(y) ? y.replace(/^mcp_servers:\s*$/m, m => m + '\n' + entry.trimEnd()) : y.replace(/\s*$/, '\n') + 'mcp_servers:\n' + entry;
  if (fs.existsSync(HERMES_CFG)) fs.copyFileSync(HERMES_CFG, HERMES_CFG + '.antes-de-plato'); fs.writeFileSync(HERMES_CFG, y);
}
function unlinkHermes() { try { const y = fs.readFileSync(HERMES_CFG, 'utf8').replace(/ {2}plato-studio:.*\n(?: {4}.*\n?)+/, ''); fs.writeFileSync(HERMES_CFG, y); } catch (e) {} }

/* ---------- Rutas /api/ai/* y puente /api/ollama/* ---------- */
export async function aiRoute(req, res, url, { readJSON, json }) {
  const p = url.pathname;
  if (p.startsWith('/api/ollama/')) { // puente tal cual (incluye streaming de /api/pull y /v1/chat/completions)
    if (!(await ping(OLLAMA_URL + '/api/version'))) { try { await startOllama(); } catch (e) { json(res, 503, { error: 'Ollama no está en marcha: ' + e.message }); return true; } }
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await new Promise((ok, ko) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', ko); });
    const r = await fetch(OLLAMA_URL + p.slice('/api/ollama'.length) + url.search, { method: req.method, headers: { 'content-type': req.headers['content-type'] || 'application/json' }, body });
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
    if (r.body) for await (const chunk of r.body) res.write(chunk); res.end(); return true;
  }
  if (!p.startsWith('/api/ai/')) return false;
  if (p === '/api/ai/status') return json(res, 200, await aiStatus()), true;
  if (p === '/api/ai/install' && req.method === 'POST') { const { id } = await readJSON(req); return json(res, 200, install(id)), true; }
  if (p === '/api/ai/job') return json(res, 200, jobStatus(url.searchParams.get('id')) || { done: true }), true;
  if (p === '/api/ai/remove' && req.method === 'POST') { const { id } = await readJSON(req); return json(res, 200, remove(id)), true; }
  if (p === '/api/ai/service' && req.method === 'POST') { const { name, action, model } = await readJSON(req);
    if (name === 'ollama') action === 'stop' ? stopOllama() : await startOllama();
    else if (name === 'comfy') action === 'stop' ? stopComfy() : await startComfy();
    else if (name === 'opencode') action === 'stop' ? stopOpencode() : await startOpencode(model);
    return json(res, 200, await aiStatus()), true; }
  if (p === '/api/ai/agent' && req.method === 'POST') { const { text, model } = await readJSON(req); return json(res, 200, await askAgent(text, model)), true; }
  json(res, 404, { error: 'No existe ' + p }); return true;
}
export function stopAll() { stopOllama(); stopComfy(); stopOpencode(); }
