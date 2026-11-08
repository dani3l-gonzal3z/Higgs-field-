// Servicios locales de Plató: montaje con FFmpeg, voces gratis y proxy para los proveedores (sin Cloudflare).
// Solo atienden a este ordenador (127.0.0.1) y a los orígenes de la app.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { speak, kokoroStatus, kokoroFiles, KOKORO_VOICES, EDGE_VOICES, voiceStudioStatus } from './tts.mjs';
import { deviceRoute, pairKey } from './inbox.mjs';

const CONF = path.join(os.homedir(), '.plato-studio');
const MEDIA = path.join(CONF, 'media'), JOBS = path.join(CONF, 'render');

/* ---------- FFmpeg ---------- */
let FF = null;
function findFFmpeg() {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const cands = [process.env.PLATO_FFMPEG, path.join(CONF, 'bin', exe), 'ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg', 'C:\\ffmpeg\\bin\\ffmpeg.exe'].filter(Boolean);
  for (const c of cands) { try { const r = spawnSync(c, ['-hide_banner', '-version'], { timeout: 8000 }); if (r.status === 0) return { bin: c, version: String(r.stdout).split('\n')[0].replace(/^ffmpeg version /, '').split(' ')[0] }; } catch (e) {} }
  return null;
}
export function ffmpegInfo() {
  if (FF) return FF; const f = findFFmpeg(); if (!f) return (FF = { ok: false });
  const filters = String(spawnSync(f.bin, ['-hide_banner', '-filters']).stdout || ''); const encs = String(spawnSync(f.bin, ['-hide_banner', '-encoders']).stdout || '');
  const has = n => new RegExp(`\\s${n}\\s`).test(encs);
  // Codificador por hardware si existe y funciona de verdad; si no, libx264.
  const tryEnc = enc => spawnSync(f.bin, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=256x144:d=0.2', '-c:v', enc, '-f', 'null', '-'], { timeout: 15000 }).status === 0;
  let encoder = 'libx264';
  if (process.env.PLATO_ENCODER) encoder = process.env.PLATO_ENCODER;
  else for (const e of process.platform === 'darwin' ? ['h264_videotoolbox'] : ['h264_nvenc', 'h264_qsv']) if (has(e) && tryEnc(e)) { encoder = e; break; }
  if (encoder === 'libx264' && !has('libx264')) encoder = has('h264_v4l2m2m') ? 'h264_v4l2m2m' : 'mpeg4';
  return (FF = { ok: true, bin: f.bin, version: f.version, encoder, ass: /\sass\s/.test(filters), sidechain: /\ssidechaincompress\s/.test(filters) });
}
const encArgs = enc => enc === 'libx264' ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'] : enc === 'h264_nvenc' ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '21', '-pix_fmt', 'yuv420p'] : enc === 'h264_videotoolbox' ? ['-c:v', 'h264_videotoolbox', '-b:v', '10M', '-pix_fmt', 'yuv420p'] : enc === 'h264_qsv' ? ['-c:v', 'h264_qsv', '-global_quality', '22'] : ['-c:v', enc, '-b:v', '8M', '-pix_fmt', 'yuv420p'];

function probe(file) { // duración y si tiene audio (sin depender de ffprobe)
  const r = spawnSync(ffmpegInfo().bin, ['-hide_banner', '-i', file], { timeout: 20000 }); const t = String(r.stderr || '');
  const d = t.match(/Duration: (\d+):(\d+):([\d.]+)/); return { dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : null, audio: /Stream #.*Audio:/.test(t), video: /Stream #.*Video:/.test(t) };
}
const keyOk = k => /^[\w.-]{1,140}$/.test(k || '');
const mediaPath = k => path.join(MEDIA, k);
const n3 = v => (+v).toFixed(3);

/* Construye y lanza FFmpeg. spec: { W, H, fps, segments:[{kind:'title',dur}|{kind:'clip',key,in,out,fadeIn,fadeOut,vol}], tracks:[{key,at,vol,kind:'voice'|'music'|'fx'}], music:{key,vol}|null, ass, duck } */
function buildGraph(spec, jobDir) {
  const ff = ffmpegInfo(); const W = Math.round(spec.W / 2) * 2, H = Math.round(spec.H / 2) * 2, fps = spec.fps || 30;
  const inputs = [], fc = [], cat = []; let total = 0; const iIn = () => inputs.filter(x => x === '-i').length;
  const add = (...a) => { const idx = iIn(); inputs.push(...a); return idx; };
  spec.segments.forEach((sg, n) => {
    if (sg.kind === 'title') { const d = +sg.dur || 2; const vi = add('-f', 'lavfi', '-t', n3(d), '-i', `color=c=black:s=${W}x${H}:r=${fps}`); const ai = add('-f', 'lavfi', '-t', n3(d), '-i', 'anullsrc=r=48000:cl=stereo');
      fc.push(`[${vi}:v]setsar=1,format=yuv420p[v${n}]`, `[${ai}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${n}]`); cat.push(`[v${n}][a${n}]`); total += d; return; }
    const f = mediaPath(sg.key); if (!fs.existsSync(f)) throw new Error('Falta el archivo de un plano en el servidor');
    const info = probe(f); const d = Math.max(0.1, (+sg.out || info.dur || 5) - (+sg.in || 0));
    const vi = add('-ss', n3(sg.in || 0), '-t', n3(d), '-i', f);
    const fades = [sg.fadeIn ? `fade=t=in:st=0:d=${n3(sg.fadeIn)}` : null, sg.fadeOut ? `fade=t=out:st=${n3(Math.max(0, d - sg.fadeOut))}:d=${n3(sg.fadeOut)}` : null].filter(Boolean);
    fc.push(`[${vi}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p,trim=duration=${n3(d)},setpts=PTS-STARTPTS${fades.length ? ',' + fades.join(',') : ''}[v${n}]`);
    const afades = [sg.fadeIn ? `afade=t=in:st=0:d=${n3(sg.fadeIn)}` : null, sg.fadeOut ? `afade=t=out:st=${n3(Math.max(0, d - sg.fadeOut))}:d=${n3(sg.fadeOut)}` : null].filter(Boolean);
    if (info.audio) fc.push(`[${vi}:a]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${n3(d)},asetpts=PTS-STARTPTS,volume=${n3(sg.vol ?? 1)}${afades.length ? ',' + afades.join(',') : ''}[a${n}]`);
    else { const ai = add('-f', 'lavfi', '-t', n3(d), '-i', 'anullsrc=r=48000:cl=stereo'); fc.push(`[${ai}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${n}]`); }
    cat.push(`[v${n}][a${n}]`); total += d;
  });
  fc.push(`${cat.join('')}concat=n=${spec.segments.length}:v=1:a=1[vcat][acat]`);
  let vout = '[vcat]';
  if (spec.ass && ff.ass) { fs.writeFileSync(path.join(jobDir, 'subs.ass'), spec.ass); fc.push(`[vcat]ass=subs.ass[vsub]`); vout = '[vsub]'; }
  // Audio: voces, música (con «ducking»: baja sola cuando hablan) y efectos.
  const voices = [], musics = [], fx = [];
  (spec.tracks || []).forEach((t, k) => { const f = mediaPath(t.key); if (!fs.existsSync(f)) return; const ii = add('-i', f); const ms = Math.max(0, Math.round((+t.at || 0) * 1000));
    fc.push(`[${ii}:a]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,volume=${n3(t.vol ?? 1)},adelay=delays=${ms}:all=1[t${k}]`); (t.kind === 'voice' ? voices : t.kind === 'music' ? musics : fx).push(`[t${k}]`); });
  if (spec.music && spec.music.key && fs.existsSync(mediaPath(spec.music.key))) { const ii = add('-stream_loop', '-1', '-i', mediaPath(spec.music.key));
    fc.push(`[${ii}:a]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration=${n3(total)},volume=${n3(spec.music.vol ?? 0.6)},afade=t=out:st=${n3(Math.max(0, total - 1.5))}:d=1.5[mbg]`); musics.push('[mbg]'); }
  const mix = (arr, name) => { if (!arr.length) return null; if (arr.length === 1) return arr[0]; fc.push(`${arr.join('')}amix=inputs=${arr.length}:duration=longest:normalize=0[${name}]`); return `[${name}]`; };
  const vox = mix(voices, 'vox'), mus = mix(musics, 'mus'), efx = mix(fx, 'efx'); const bus = ['[acat]'];
  if (vox && mus && spec.duck !== false && ff.sidechain) { fc.push(`${vox}asplit=2[vox1][voxsc]`, `${mus}[voxsc]sidechaincompress=threshold=0.02:ratio=10:attack=30:release=500:makeup=1[mducked]`); bus.push('[vox1]', '[mducked]'); }
  else { if (vox) bus.push(vox); if (mus) bus.push(mus); }
  if (efx) bus.push(efx);
  fc.push(`${bus.join('')}amix=inputs=${bus.length}:duration=first:normalize=0,alimiter=limit=0.95,atrim=duration=${n3(total)}[aout]`);
  return { inputs, graph: fc.join(';'), vout, total, W, H };
}

const JOBP = new Map(); // progreso de cada montaje
async function render(spec, res) {
  const ff = ffmpegInfo(); if (!ff.ok) throw new Error('No encuentro FFmpeg en este ordenador');
  const job = String(spec.job || crypto.randomUUID()).replace(/[^\w-]/g, '').slice(0, 40); const dir = path.join(JOBS, job); fs.mkdirSync(dir, { recursive: true });
  const g = buildGraph(spec, dir); const out = path.join(dir, 'out.mp4');
  const gf = path.join(dir, 'graph.txt'); fs.writeFileSync(gf, g.graph);
  const args = ['-hide_banner', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', ...g.inputs, '-filter_complex_script', 'graph.txt', '-map', g.vout, '-map', '[aout]', ...encArgs(ff.encoder), '-r', String(spec.fps || 30), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', n3(g.total), out];
  const t0 = Date.now(); JOBP.set(job, { p: 0, total: g.total, encoder: ff.encoder });
  await new Promise((ok, ko) => {
    const p = spawn(ff.bin, args, { cwd: dir }); let err = '';
    p.stdout.on('data', d => { const m = String(d).match(/out_time_(?:us|ms)=(\d+)/g); if (m) { const us = +m[m.length - 1].split('=')[1]; JOBP.set(job, { p: Math.min(0.99, us / 1e6 / g.total), total: g.total, encoder: ff.encoder }); } });
    p.stderr.on('data', d => { err = (err + d).slice(-4000); });
    res.on('close', () => { if (!res.writableEnded) p.kill('SIGKILL'); });
    p.on('exit', code => code === 0 ? ok() : ko(new Error('FFmpeg falló: ' + (err.trim().split('\n').slice(-3).join(' · ') || 'código ' + code))));
  });
  JOBP.set(job, { p: 1, total: g.total, done: true, secs: (Date.now() - t0) / 1000 });
  // Copia en la carpeta del usuario y respuesta con el vídeo.
  let saved = null; try { const d = path.join(spec.outDir, 'Montajes'); fs.mkdirSync(d, { recursive: true }); saved = path.join(d, `${String(spec.title || 'montaje').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'montaje'} ${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.mp4`); fs.copyFileSync(out, saved); } catch (e) { saved = null; }
  const size = fs.statSync(out).size;
  res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': size, 'x-render-secs': ((Date.now() - t0) / 1000).toFixed(1), 'x-encoder': ff.encoder, ...(saved ? { 'x-saved-to': encodeURIComponent(saved) } : {}) });
  await new Promise(r => fs.createReadStream(out).on('end', r).on('error', r).pipe(res));
  fs.rm(dir, { recursive: true, force: true }, () => {}); setTimeout(() => JOBP.delete(job), 60000);
}

/* ---------- Proxy local para proveedores (lo que en la web hace el Cloudflare Worker) ---------- */
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?|\[?f[cd])/i;
async function proxy(req, res, target) {
  let t; try { t = new URL(target); } catch (e) { res.writeHead(400); res.end('Destino no válido'); return; }
  if (t.protocol !== 'https:' || PRIVATE.test(t.hostname)) { res.writeHead(403); res.end('Solo https a servicios externos'); return; }
  const h = {}; for (const [k, v] of Object.entries(req.headers)) if (!['host', 'origin', 'referer', 'cookie', 'connection', 'content-length', 'accept-encoding', 'x-proxy-token', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest'].includes(k) && !k.startsWith('sec-ch-')) h[k] = v;
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req);
  let r; try { r = await fetch(t, { method: req.method, headers: h, body, duplex: body ? 'half' : undefined, redirect: 'follow' }); } catch (e) { res.writeHead(502); res.end('No se pudo conectar con ' + t.hostname + ': ' + (e.cause && e.cause.code || e.message)); return; }
  const out = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'access-control-allow-origin', 'access-control-allow-credentials', 'set-cookie'].includes(k)) out[k] = v; });
  res.writeHead(r.status, out); if (!r.body) { res.end(); return; } Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
}

/* ---------- Entrada HTTP ---------- */
function readJSON(req, max = 20e6) { return new Promise((ok, ko) => { const c = []; let n = 0; req.on('data', d => { n += d.length; if (n > max) { ko(new Error('Demasiado grande')); req.destroy(); } else c.push(d); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(c).toString('utf8') || '{}')); } catch (e) { ko(new Error('JSON inválido')); } }); req.on('error', ko); }); }
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };

export function cleanupMedia() { // borra lo que lleva más de 10 días sin usarse
  for (const d of [MEDIA, JOBS]) { try { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (Date.now() - st.mtimeMs > 10 * 864e5) fs.rmSync(p, { recursive: true, force: true }); } } catch (e) {} }
}

export function mediaHandler({ ORIGINS, isLocal, OUT, log }) {
  fs.mkdirSync(MEDIA, { recursive: true }); fs.mkdirSync(JOBS, { recursive: true }); cleanupMedia();
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/')) return false;
    const origin = req.headers.origin; const okOrigin = !origin || ORIGINS.has(origin);
    if (origin && okOrigin) res.setHeader('access-control-allow-origin', origin), res.setHeader('vary', 'origin'), res.setHeader('access-control-expose-headers', '*');
    if (req.method === 'OPTIONS') { if (!okOrigin) { res.writeHead(403); res.end(); return true; } res.writeHead(204, { 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': req.headers['access-control-request-headers'] || '*', 'access-control-allow-private-network': 'true', 'access-control-max-age': '600' }); res.end(); return true; }
    if (!isLocal(req) || !okOrigin) { res.writeHead(403); res.end('Solo desde este ordenador'); return true; }
    const p = url.pathname;
    try {
      if (await deviceRoute(req, res, url)) return true;
      if (p === '/api/caps') { const ff = ffmpegInfo(); const k = kokoroFiles() ? await kokoroStatus() : { ok: false, why: 'sin instalar' }; const vs = await voiceStudioStatus(new URL(req.url, 'http://x').searchParams.has('fresh'));
        return json(res, 200, { proxy: true, pair: pairKey(), ffmpeg: ff.ok ? { ok: true, version: ff.version, encoder: ff.encoder, subtitles: ff.ass } : { ok: false }, tts: { kokoro: k, edge: { ok: typeof WebSocket !== 'undefined', experimental: true }, voicestudio: { ok: vs.ok, why: vs.why, url: vs.url } }, voices: { kokoro: KOKORO_VOICES, edge: EDGE_VOICES, voicestudio: vs.voices || [] } }), true; }
      if (p.startsWith('/api/proxy/')) { await proxy(req, res, req.url.slice('/api/proxy/'.length)); return true; }
      if (p === '/api/media/have' && req.method === 'POST') { const { keys = [] } = await readJSON(req); return json(res, 200, { missing: keys.filter(k => !keyOk(k) || !fs.existsSync(mediaPath(k))) }), true; }
      if (p.startsWith('/api/media/') && req.method === 'PUT') { const k = decodeURIComponent(p.slice('/api/media/'.length)); if (!keyOk(k)) return json(res, 400, { error: 'clave no válida' }), true;
        const tmp = mediaPath(k) + '.' + process.pid + '.part'; await new Promise((ok, ko) => { const f = fs.createWriteStream(tmp); req.pipe(f); f.on('finish', ok); f.on('error', ko); req.on('error', ko); }); fs.renameSync(tmp, mediaPath(k)); return json(res, 200, { ok: true }), true; }
      if (p === '/api/render' && req.method === 'POST') { const spec = await readJSON(req); spec.outDir = OUT; log(`montaje: ${spec.segments?.length || 0} planos con ${ffmpegInfo().encoder}`); await render(spec, res); return true; }
      if (p === '/api/render/progress') { return json(res, 200, JOBP.get(url.searchParams.get('job')) || { p: 0 }), true; }
      if (p === '/api/tts' && req.method === 'POST') { const q = await readJSON(req, 1e6); const r = await speak(q); return json(res, 200, { audio: r.audio.toString('base64'), mime: r.mime, dur: r.dur, words: r.words }), true; }
      json(res, 404, { error: 'No existe ' + p }); return true;
    } catch (e) { log('api', p, e.message); if (!res.headersSent) json(res, 500, { error: e.message }); else res.destroy(); return true; }
  };
}
