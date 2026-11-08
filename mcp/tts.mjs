// Voces gratis para Plató: Kokoro en local (sin internet) y, opcional, las voces en línea de Microsoft Edge.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONF = path.join(os.homedir(), '.plato-studio');
const KDIR = process.env.PLATO_KOKORO_DIR || path.join(CONF, 'kokoro');
const TMP = path.join(CONF, 'tmp');

/* ---------- Kokoro (proceso de Python que se queda cargado) ---------- */
export const KOKORO_VOICES = [
  { id: 'ef_dora', label: 'Dora (mujer, español)', lang: 'es' }, { id: 'em_alex', label: 'Álex (hombre, español)', lang: 'es' }, { id: 'em_santa', label: 'Santa (hombre mayor, español)', lang: 'es' },
  { id: 'af_heart', label: 'Heart (mujer, inglés)', lang: 'en' }, { id: 'af_bella', label: 'Bella (mujer, inglés)', lang: 'en' }, { id: 'am_michael', label: 'Michael (hombre, inglés)', lang: 'en' }, { id: 'am_puck', label: 'Puck (niño, inglés)', lang: 'en' },
  { id: 'bf_emma', label: 'Emma (mujer, británico)', lang: 'en' }, { id: 'bm_george', label: 'George (hombre, británico)', lang: 'en' },
  { id: 'ff_siwis', label: 'Siwis (mujer, francés)', lang: 'fr' }, { id: 'if_sara', label: 'Sara (mujer, italiano)', lang: 'it' }, { id: 'im_nicola', label: 'Nicola (hombre, italiano)', lang: 'it' },
  { id: 'pf_dora', label: 'Dora (mujer, portugués)', lang: 'pt' }, { id: 'pm_alex', label: 'Alex (hombre, portugués)', lang: 'pt' },
];
function pythonBin() {
  const cands = [process.env.PLATO_PYTHON, path.join(CONF, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'), process.platform === 'win32' ? 'python' : 'python3', 'python'].filter(Boolean);
  for (const c of cands) { if (c.includes(path.sep) && !fs.existsSync(c)) continue; try { const r = spawnSync(c, ['-c', 'import numpy, onnxruntime'], { timeout: 20000 }); if (r.status === 0) return c; } catch (e) {} }
  return null;
}
let K = null; // { proc, ready, voices, pending, error, starting }
export function kokoroFiles() { return fs.existsSync(path.join(KDIR, 'voices-v1.0.bin')) && ['kokoro-v1.0.int8.onnx', 'kokoro-v1.0.fp16.onnx', 'kokoro-v1.0.onnx'].some(n => fs.existsSync(path.join(KDIR, n))); }
function startKokoro() {
  if (K && (K.ready || K.starting)) return K.starting || Promise.resolve(K);
  K = { pending: new Map(), ready: false, error: null };
  K.starting = new Promise(res => {
    if (!kokoroFiles()) { K.error = 'Faltan el modelo y las voces. Ejecuta: node mcp/server.mjs --setup-voices'; K.starting = null; return res(K); }
    const py = pythonBin(); if (!py) { K.error = 'Falta Python con numpy y onnxruntime (pip install numpy onnxruntime)'; K.starting = null; return res(K); }
    const p = spawn(py, [path.join(HERE, 'tts_kokoro.py'), KDIR], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }); K.proc = p;
    let buf = '', err = '';
    p.stderr.on('data', d => { err = (err + d).slice(-2000); });
    p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m.ready) { K.ready = true; K.voices = m.voices; K.starting = null; res(K); continue; }
      if (m.error && !m.id && !K.ready) { K.error = m.error; K.starting = null; res(K); continue; }
      const q = K.pending.get(m.id); if (q) { K.pending.delete(m.id); m.error ? q.rej(new Error(m.error)) : q.res(m); } } });
    p.on('exit', code => { const was = K; K = null; for (const q of was.pending.values()) q.rej(new Error('La voz local se ha cerrado' + (err ? ': ' + err.split('\n').filter(Boolean).pop() : ''))); if (!was.ready) { was.error = was.error || ('No arranca Kokoro: ' + (err.split('\n').filter(Boolean).pop() || 'código ' + code)); was.starting = null; res(was); } });
  });
  return K.starting;
}
export async function kokoroStatus() { if (!kokoroFiles()) return { ok: false, why: 'sin instalar' }; const k = await startKokoro(); return k.ready ? { ok: true, voices: KOKORO_VOICES.filter(v => !k.voices || k.voices.includes(v.id)) } : { ok: false, why: k.error }; }
async function kokoroSay(text, voice, speed) {
  const k = await startKokoro(); if (!k.ready) throw new Error(k.error || 'Kokoro no está listo');
  fs.mkdirSync(TMP, { recursive: true }); const id = crypto.randomUUID(); const out = path.join(TMP, id + '.wav');
  const r = await new Promise((res, rej) => { k.pending.set(id, { res, rej }); k.proc.stdin.write(JSON.stringify({ id, text, voice, speed, out }) + '\n'); setTimeout(() => { if (k.pending.has(id)) { k.pending.delete(id); rej(new Error('La voz local tarda demasiado')); } }, 180000); });
  const audio = fs.readFileSync(out); fs.unlink(out, () => {}); return { audio, mime: 'audio/wav', dur: r.dur, words: r.words };
}

/* ---------- Edge (en línea, gratis, no oficial: puede dejar de funcionar) ---------- */
const TRUSTED = '6A5AA1D4EAFF4E9FB37E23D68491D6F4', CHROMIUM = '130.0.2849.68';
export const EDGE_VOICES = [
  { id: 'es-ES-ElviraNeural', label: 'Elvira (España)' }, { id: 'es-ES-AlvaroNeural', label: 'Álvaro (España)' }, { id: 'es-ES-XimenaNeural', label: 'Ximena (España)' },
  { id: 'es-MX-DaliaNeural', label: 'Dalia (México)' }, { id: 'es-MX-JorgeNeural', label: 'Jorge (México)' }, { id: 'es-AR-ElenaNeural', label: 'Elena (Argentina)' },
  { id: 'es-CO-SalomeNeural', label: 'Salomé (Colombia)' }, { id: 'en-US-AriaNeural', label: 'Aria (inglés)' }, { id: 'en-US-GuyNeural', label: 'Guy (inglés)' },
];
function secMsGec() { let t = Math.floor(Date.now() / 1000) + 11644473600; t -= t % 300; const ticks = BigInt(t) * 10000000n; return crypto.createHash('sha256').update(`${ticks}${TRUSTED}`, 'ascii').digest('hex').toUpperCase(); }
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
async function edgeSay(text, voice = 'es-ES-ElviraNeural', speed = 1) {
  if (typeof WebSocket === 'undefined') throw new Error('Las voces de Edge necesitan Node 22 o superior');
  const conn = crypto.randomUUID().replace(/-/g, '');
  const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED}&ConnectionId=${conn}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${CHROMIUM}`;
  const headers = { Pragma: 'no-cache', 'Cache-Control': 'no-cache', Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold', 'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM.split('.')[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM.split('.')[0]}.0.0.0`, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'muid=' + crypto.randomBytes(16).toString('hex').toUpperCase() + ';' };
  const ws = new WebSocket(url, { headers }); ws.binaryType = 'arraybuffer';
  const chunks = [], words = []; const date = new Date().toString();
  const rate = `${speed >= 1 ? '+' : ''}${Math.round((speed - 1) * 100)}%`;
  await new Promise((res, rej) => {
    const to = setTimeout(() => { try { ws.close(); } catch (e) {} rej(new Error('Edge no responde')); }, 60000);
    ws.onerror = () => { clearTimeout(to); rej(new Error('No se pudo conectar con las voces de Edge (pueden haber cambiado el acceso)')); };
    ws.onopen = () => {
      ws.send(`X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`);
      ws.send(`X-RequestId:${crypto.randomUUID().replace(/-/g, '')}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${date}Z\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${xmlEsc(voice)}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${xmlEsc(text)}</prosody></voice></speak>`);
    };
    ws.onmessage = e => {
      if (typeof e.data === 'string') {
        if (e.data.includes('Path:turn.end')) { clearTimeout(to); ws.close(); res(); return; }
        if (e.data.includes('Path:audio.metadata')) { try { const j = JSON.parse(e.data.slice(e.data.indexOf('\r\n\r\n') + 4)); for (const m of j.Metadata || []) if (m.Type === 'WordBoundary') { const s = m.Data.Offset / 1e7, d = m.Data.Duration / 1e7; words.push({ w: m.Data.text.Text, s: +s.toFixed(3), e: +(s + d).toFixed(3) }); } } catch (er) {} }
        return; }
      const b = Buffer.from(e.data); const hl = b.readUInt16BE(0); const head = b.subarray(2, 2 + hl).toString(); if (head.includes('Path:audio')) chunks.push(b.subarray(2 + hl));
    };
    ws.onclose = () => { clearTimeout(to); if (chunks.length) res(); else rej(new Error('Edge cerró la conexión sin audio')); };
  });
  const audio = Buffer.concat(chunks); if (!audio.length) throw new Error('Edge no devolvió audio');
  return { audio, mime: 'audio/mpeg', dur: words.length ? words[words.length - 1].e + 0.2 : null, words };
}

/* ---------- VoiceStudio (https://github.com/debpalash/VoiceStudio): si lo tienes abierto, Plató lo usa como voz ----------
   Es una aplicación aparte (AGPL) con su propia API local compatible con OpenAI; Plató solo le habla por HTTP, no la incluye.
   VOICESTUDIO_URL (por defecto http://localhost:3900) y VOICESTUDIO_KEY si la protegiste con clave. */
const VS = { url: (process.env.VOICESTUDIO_URL || 'http://localhost:3900').replace(/\/$/, ''), key: process.env.VOICESTUDIO_KEY || '' };
const vsH = (extra = {}) => ({ ...(VS.key ? { Authorization: 'Bearer ' + VS.key } : {}), ...extra });
let vsCache = { t: 0, v: null };
export async function voiceStudioStatus(force = false) {
  if (!force && vsCache.v && Date.now() - vsCache.t < 15000) return vsCache.v; let v;
  try { const h = await fetch(VS.url + '/health', { headers: vsH(), signal: AbortSignal.timeout(1500) }); if (!h.ok) throw new Error('HTTP ' + h.status);
    let voices = [];
    try { const r = await fetch(VS.url + '/v1/audio/voices', { headers: vsH(), signal: AbortSignal.timeout(4000) }); const j = await r.json();
      voices = (j.voices || []).map(x => ({ id: x.id || x.voice_id, label: (x.type === 'profile' ? '⭐ ' : '') + (x.name || x.id) + (x.language ? ` (${x.language})` : ''), profile: x.type === 'profile' }))
        .sort((a, b) => (b.profile ? 1 : 0) - (a.profile ? 1 : 0)); } catch (e) {}
    v = { ok: true, url: VS.url, voices: [{ id: 'default', label: 'Voz por defecto' }, ...voices.filter(x => x.profile)] };
  } catch (e) { v = { ok: false, why: `no está abierto en ${VS.url}` }; }
  vsCache = { t: Date.now(), v }; return v; }
function wavDur(buf) { try { if (buf.toString('ascii', 0, 4) !== 'RIFF') return null; let p = 12, rate = 0; while (p + 8 <= buf.length) { const id = buf.toString('ascii', p, p + 4), n = buf.readUInt32LE(p + 4);
  if (id === 'fmt ') rate = buf.readUInt32LE(p + 16); if (id === 'data') return rate ? Math.min(n, buf.length - p - 8) / rate : null; p += 8 + n + (n & 1); } } catch (e) {} return null; }
// Tiempos de palabra: reparte la duración por letras (con pausas en la puntuación)
function estWords(text, dur) { const ws = text.split(/\s+/).filter(Boolean); const wt = ws.map(w => Math.max(1.5, w.replace(/[^\p{L}\p{N}]/gu, '').length) + (/[.,;:!?…]$/.test(w) ? 3 : 0.6)); const tot = wt.reduce((a, b) => a + b, 0) || 1; let t = 0.05;
  const k = Math.max(0.1, (dur || ws.length * 0.38) - 0.1); return ws.map((w, i) => { const d = wt[i] / tot * k; const o = { w, s: +t.toFixed(3), e: +(t + d * 0.9).toFixed(3) }; t += d; return o; }); }
// Si VoiceStudio tiene un modelo de transcripción, le pedimos dónde empieza cada palabra de su propio audio: subtítulos clavados.
async function vsAlign(audio, mime, text, dur) {
  if (process.env.VOICESTUDIO_ALIGN === '0') return null;
  try { const fd = new FormData(); fd.append('file', new Blob([audio], { type: mime }), 'voz.' + (mime.includes('wav') ? 'wav' : 'mp3')); fd.append('model', 'whisper-1'); fd.append('response_format', 'verbose_json');  fd.append('timestamp_granularities[]', 'word');
    const r = await fetch(VS.url + '/v1/audio/transcriptions', { method: 'POST', headers: vsH(), body: fd, signal: AbortSignal.timeout(30000) }); if (!r.ok) return null; const j = await r.json();
    const tw = (j.words || (j.segments || []).flatMap(s => s.words || [])).map(x => ({ w: String(x.word || x.text || '').trim(), s: +x.start, e: +x.end })).filter(x => x.w && isFinite(x.s)); if (tw.length < 2) return null;
    // casamos por posición relativa en el texto (resiste pequeñas diferencias de transcripción)
    const ws = text.split(/\s+/).filter(Boolean); const cum = a => { let c = 0; return a.map(x => { const r0 = c; c += x.length + 1; return r0; }); }; const cw = cum(ws), ct = cum(tw.map(x => x.w)); const Cw = cw[cw.length - 1] + ws[ws.length - 1].length || 1, Ct = ct[ct.length - 1] + tw[tw.length - 1].w.length || 1;
    let k = 0; const S = ws.map((w, i) => { const f = cw[i] / Cw; while (k + 1 < tw.length && ct[k + 1] / Ct <= f + 1e-6) k++; return tw[k].s; });
    for (let i = 1; i < S.length; i++) if (S[i] < S[i - 1]) S[i] = S[i - 1]; const end = dur || tw[tw.length - 1].e;
    return ws.map((w, i) => ({ w, s: +S[i].toFixed(3), e: +Math.max(S[i] + 0.1, (i + 1 < ws.length ? S[i + 1] : end) - 0.02).toFixed(3) }));
  } catch (e) { return null; } }
async function voiceStudioSay(text, voice = 'default', speed = 1, instruct, lang) {
  const r = await fetch(VS.url + '/v1/audio/speech', { method: 'POST', headers: vsH({ 'Content-Type': 'application/json' }), body: JSON.stringify({ model: 'tts-1', voice: voice || 'default', input: text, response_format: 'wav', speed, language: lang || 'es', ...(instruct ? { instruct } : {}) }), signal: AbortSignal.timeout(180000) })
    .catch(e => { throw new Error(`VoiceStudio no responde en ${VS.url} (¿está abierto?)`); });
  if (!r.ok) { let m = ''; try { m = (await r.text()).slice(0, 200); } catch (e) {} throw new Error(`VoiceStudio: ${r.status} ${m}`); }
  const audio = Buffer.from(await r.arrayBuffer()); if (audio.length < 100) throw new Error('VoiceStudio no devolvió audio'); const mime = r.headers.get('content-type') || 'audio/wav';
  const dur = wavDur(audio); const words = (await vsAlign(audio, mime, text, dur)) || estWords(text, dur);
  return { audio, mime: mime.includes('wav') ? 'audio/wav' : mime, dur, words };
}

export async function speak({ engine = 'kokoro', text, voice, speed = 1, instruct, lang }) {
  text = String(text || '').trim(); if (!text) throw new Error('Texto vacío'); if (text.length > 5000) throw new Error('Texto demasiado largo (máx. 5000 caracteres por petición)');
  speed = Math.max(0.5, Math.min(2, +speed || 1));
  return engine === 'edge' ? edgeSay(text, voice, speed) : engine === 'voicestudio' ? voiceStudioSay(text, voice, speed, instruct && String(instruct).slice(0, 200), lang) : kokoroSay(text, voice, speed);
}
export function stopTTS() { try { K && K.proc && K.proc.kill(); } catch (e) {} }

/* ---------- Instalación de Kokoro ---------- */
const REL = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/';
async function download(url, dest, log) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1e6) { log('Ya está: ' + path.basename(dest)); return; }
  const r = await fetch(url); if (!r.ok) throw new Error(`No se pudo descargar ${url} (${r.status})`);
  const total = +r.headers.get('content-length') || 0; const tmp = dest + '.part'; const f = fs.createWriteStream(tmp); let n = 0, last = 0;
  for await (const chunk of r.body) { f.write(chunk); n += chunk.length; if (total && n - last > total / 10) { last = n; log(`  ${path.basename(dest)}: ${Math.round(n / total * 100)}%`); } }
  await new Promise(res => f.end(res)); fs.renameSync(tmp, dest); log('Descargado: ' + path.basename(dest));
}
export async function setupVoices(log = console.log) {
  fs.mkdirSync(KDIR, { recursive: true });
  log('1/3 · Modelo Kokoro-82M (int8, ~90 MB) y voces (~28 MB)…');
  await download(REL + 'kokoro-v1.0.int8.onnx', path.join(KDIR, 'kokoro-v1.0.int8.onnx'), log);
  await download(REL + 'voices-v1.0.bin', path.join(KDIR, 'voices-v1.0.bin'), log);
  log('2/3 · Python con numpy y onnxruntime…');
  let py = pythonBin();
  if (!py) { const sys = process.platform === 'win32' ? 'python' : 'python3'; const venv = path.join(CONF, 'venv');
    log('  Creo un entorno propio en ' + venv); let r = spawnSync(sys, ['-m', 'venv', venv], { stdio: 'inherit' }); if (r.status !== 0) throw new Error('No pude crear el entorno de Python. Instala Python 3 (y en Debian/Ubuntu: apt install python3-venv).');
    const vpy = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'); r = spawnSync(vpy, ['-m', 'pip', 'install', '--upgrade', 'numpy', 'onnxruntime'], { stdio: 'inherit' }); if (r.status !== 0) throw new Error('No pude instalar numpy/onnxruntime con pip.'); py = pythonBin(); }
  log('  Python: ' + py);
  log('3/3 · espeak-ng (convierte el texto en fonemas)…');
  const es = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['espeak-ng']); if (es.status !== 0 && !process.env.PLATO_ESPEAK) log('  ⚠️ Falta espeak-ng. Instálalo: Linux «sudo apt install espeak-ng» · Mac «brew install espeak-ng» · Windows: instalador .msi de https://github.com/espeak-ng/espeak-ng/releases');
  const st = await kokoroStatus(); stopTTS(); log(st.ok ? '✅ Voces locales listas.' : '⚠️ ' + st.why); return st;
}
