// Recast local: cambia a una persona u objeto de un vídeo real sin mandar nada fuera.
// 1) SAM 3.1 hace la máscara (toques o texto) y la sigue por el clip. 2) Recorto solo la zona de la máscara.
// 3) Wan 2.2 Animate (personaje) o Wan VACE (objeto / borrar) generan ese recorte en ComfyUI.
// 4) Lo pego en el original con borde suave: fuera de la máscara quedan tus píxeles. 5) Audio original o voz cambiada.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { CONF, AI, COMFY_IN, COMFY_OUT, comfyURL, comfyManaged, startComfy, envPy, hardware } from './localai.mjs';
import { ffmpegInfo } from './media.mjs';
import { speak } from './tts.mjs';

const RC = path.join(CONF, 'recast'); fs.mkdirSync(RC, { recursive: true });
const WFPS = 16;          // fps de trabajo de los modelos Wan
const MAXSEC = 20;        // tope por clip (en trozos encadenados)
export const MODELS = {
  sam: 'sam3.1_multiplex_fp16.safetensors',
  animate: 'Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors', relight: 'WanAnimate_relight_lora_fp16.safetensors', lightx2v: 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
  umt5: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', vae: 'wan_2.1_vae.safetensors', clipv: 'clip_vision_h.safetensors', vitpose: 'vitpose-l-wholebody.onnx', yolo: 'yolov10m.onnx',
  vace: 'wan2.1_vace_1.3B_fp16.safetensors', film: 'film_net_fp16.safetensors',
};
const NEG = 'blurry, low quality, static, deformed, extra fingers, bad hands, bad face, watermark, subtitles, text, jpeg artifacts, overexposed, washed out';
const PACK_OF = { WanAnimateToVideo: 'personaje', OnnxDetectionModelLoader: 'personaje', PoseAndFaceDetection: 'personaje', DrawViTPose: 'personaje', SAM3_Detect: 'sam', SAM3_VideoTrack: 'sam', SAM3_TrackToMask: 'sam', WanVaceToVideo: 'objeto', FrameInterpolate: 'fluidez', FrameInterpolationModelLoader: 'fluidez' };
const PACK_OF_MODEL = { [MODELS.sam]: 'sam', [MODELS.animate]: 'personaje', [MODELS.relight]: 'personaje', [MODELS.lightx2v]: 'personaje', [MODELS.clipv]: 'personaje', [MODELS.vitpose]: 'personaje', [MODELS.yolo]: 'personaje', [MODELS.vace]: 'objeto', [MODELS.film]: 'fluidez' };

/* ---------- FFmpeg ---------- */
const ff = () => { const f = ffmpegInfo(); if (!f.ok) throw new Error('Falta FFmpeg (Ajustes → Este aparato)'); return f.bin; };
function ffrun(args, log = () => {}) {
  return new Promise((ok, ko) => { const p = spawn(ff(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true }); let err = '';
    p.stderr.on('data', d => { err = (err + d).slice(-3000); }); p.on('error', ko); p.on('close', c => c === 0 ? ok() : ko(new Error('FFmpeg: ' + err.trim().split('\n').slice(-3).join(' | ')))); });
}
function ffraw(args) { return new Promise((ok, ko) => { const p = spawn(ff(), ['-hide_banner', '-loglevel', 'error', ...args, '-'], { windowsHide: true }); const c = []; p.stdout.on('data', d => c.push(d)); p.on('error', ko); p.on('close', code => code === 0 ? ok(Buffer.concat(c)) : ko(new Error('FFmpeg no pudo leer la máscara'))); }); }
export function probeVideo(file) {
  const t = String(spawnSync(ff(), ['-hide_banner', '-i', file], { timeout: 20000 }).stderr || '');
  const d = t.match(/Duration: (\d+):(\d+):([\d.]+)/), v = t.match(/Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})[^\n]*?([\d.]+) (?:fps|tbr)/);
  if (!v) throw new Error('No reconozco ese vídeo');
  return { dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0, w: +v[1], h: +v[2], fps: Math.min(60, +v[3] || 30), audio: /Stream #[^\n]*Audio:/.test(t) };
}
const enc = () => { const e = ffmpegInfo().encoder; return e === 'h264_nvenc' ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '18'] : e === 'h264_videotoolbox' ? ['-c:v', 'h264_videotoolbox', '-q:v', '70'] : e === 'h264_qsv' ? ['-c:v', 'h264_qsv', '-global_quality', '20'] : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17']; };
const lossless = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10', '-pix_fmt', 'yuv420p'];

/* ---------- Trabajos ---------- */
const dir = id => { if (!/^[a-z0-9]{6,20}$/.test(id)) throw new Error('Trabajo no válido'); return path.join(RC, id); };
const meta = id => JSON.parse(fs.readFileSync(path.join(dir(id), 'meta.json'), 'utf8'));
const saveMeta = (id, m) => fs.writeFileSync(path.join(dir(id), 'meta.json'), JSON.stringify(m, null, 1));
const JOBS = new Map();
function job(id) { const j = { id, stage: '', p: 0, log: [], done: false, error: null, out: null }; j.say = (s, p) => { j.stage = s; if (p != null) j.p = p; j.log.push(s); }; JOBS.set(id, j); return j; }
export const recastJob = id => { const j = JOBS.get(id); return j ? { stage: j.stage, p: j.p, log: j.log.slice(-10), done: j.done, error: j.error, out: j.out } : null; };

// 1. Subir el clip (se guarda tal cual) y elegir el tramo.
export async function recastNew(stream, name = 'clip.mp4') {
  const id = crypto.randomBytes(5).toString('hex'); const d = dir(id); fs.mkdirSync(d, { recursive: true });
  const src = path.join(d, 'src' + (path.extname(name).toLowerCase() || '.mp4'));
  await new Promise((ok, ko) => { const f = fs.createWriteStream(src); stream.pipe(f); f.on('finish', ok); f.on('error', ko); stream.on('error', ko); });
  const info = probeVideo(src); const m = { id, name, src, ...info, created: Date.now() }; saveMeta(id, m);
  return { id, ...info, max: MAXSEC };
}
export async function recastFrame(id, t = 0) { const m = meta(id); const out = path.join(dir(id), 'thumb.jpg'); await ffrun(['-ss', String(Math.max(0, t)), '-i', m.src, '-frames:v', '1', '-vf', 'scale=min(1280\\,iw):-2', '-q:v', '3', out]); return out; }
// Corta el tramo (al fotograma exacto) y prepara la versión para SAM (≤720 p, hasta 30 fps).
export async function recastSegment(id, start = 0, dur = 5) {
  const m = meta(id); const d = dir(id); dur = Math.max(0.5, Math.min(MAXSEC, dur, m.dur - start || dur));
  const seg = path.join(d, 'seg.mp4'); await ffrun(['-ss', String(start), '-i', m.src, '-t', String(dur), ...lossless, '-c:a', 'aac', '-b:a', '256k', seg]);
  const info = probeVideo(seg); const sfps = Math.min(30, Math.round(info.fps));
  const long = Math.max(info.w, info.h), k = Math.min(1, 720 / long); const sw = Math.round(info.w * k / 2) * 2, sh = Math.round(info.h * k / 2) * 2;
  const samv = path.join(d, 'sam.mp4'); await ffrun(['-i', seg, '-vf', `fps=${sfps},scale=${sw}:${sh}:flags=area`, '-an', ...lossless, samv]);
  await ffrun(['-i', samv, '-frames:v', '1', path.join(d, 'f0.png')]);
  Object.assign(m, { start, segDur: info.dur, W: info.w, H: info.h, fps: info.fps, audio: info.audio, sfps, sw, sh, mask0: null, mask: null }); saveMeta(id, m);
  return { sw, sh, sfps, dur: info.dur, frame: path.join(d, 'f0.png') };
}

/* ---------- ComfyUI: grafo, validación y ejecución ---------- */
class Graph { constructor() { this.g = {}; this.n = 0; } add(cls, inputs) { const id = String(++this.n); this.g[id] = { class_type: cls, inputs }; return id; } }
const L = (id, i = 0) => [id, i];
let OBJINFO = null;
async function objectInfo(base) { if (OBJINFO) return OBJINFO; const r = await fetch(base + '/object_info'); if (!r.ok) throw new Error('El motor de vídeo no responde'); return (OBJINFO = await r.json()); }
function comboOpts(spec) { if (!Array.isArray(spec)) return null; if (Array.isArray(spec[0])) return spec[0]; if (spec[0] === 'COMBO' && spec[1] && Array.isArray(spec[1].options)) return spec[1].options; return null; }
export function validateGraph(g, info) {
  const errs = [];
  for (const [id, n] of Object.entries(g)) {
    const def = info[n.class_type];
    if (!def) { errs.push(`falta el nodo ${n.class_type}` + (PACK_OF[n.class_type] ? ` (instala «${PACK_OF[n.class_type]}» en Ajustes → IA local)` : ' (actualiza el motor de vídeo)')); continue; }
    const req = (def.input && def.input.required) || {}, opt = (def.input && def.input.optional) || {};
    for (const k of Object.keys(req)) if (!(k in n.inputs)) errs.push(`${n.class_type}: falta «${k}»`);
    for (const [k, v] of Object.entries(n.inputs)) {
      const spec = req[k] || opt[k]; if (!spec) { errs.push(`${n.class_type}: no conoce «${k}»`); continue; }
      const opts = comboOpts(spec); if (opts && !Array.isArray(v) && !opts.map(String).includes(String(v)))
        errs.push(PACK_OF_MODEL[v] ? `falta el modelo ${v} (instala «${PACK_OF_MODEL[v]}» en Ajustes → IA local)` : `${n.class_type}.${k}: «${v}» no está entre las opciones`);
    }
  }
  return [...new Set(errs)];
}
async function putInput(base, file, name) {
  if (comfyManaged()) { fs.mkdirSync(COMFY_IN, { recursive: true }); fs.copyFileSync(file, path.join(COMFY_IN, name)); OBJINFO = null; return name; }
  const fd = new FormData(); fd.append('image', new Blob([fs.readFileSync(file)]), name); fd.append('overwrite', 'true');
  const r = await fetch(base + '/upload/image', { method: 'POST', body: fd }); if (!r.ok) throw new Error('No pude pasar ' + name + ' al motor de vídeo'); OBJINFO = null; return (await r.json()).name || name;
}
async function comfyRun(g, j, span = [0, 1]) {
  const base = await startComfy(s => j.say(s)); OBJINFO = null; const errs = validateGraph(g, await objectInfo(base));
  if (errs.length) throw new Error(errs.slice(0, 3).join(' · '));
  const client_id = crypto.randomBytes(6).toString('hex'); let ws = null; let nodesDone = 0; const total = Object.keys(g).length;
  if (typeof WebSocket !== 'undefined') try { ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws?clientId=' + client_id);
    ws.onmessage = e => { try { const m = JSON.parse(typeof e.data === 'string' ? e.data : ''); if (m.type === 'progress' && m.data.max) j.p = span[0] + (span[1] - span[0]) * Math.min(0.99, (nodesDone + m.data.value / m.data.max) / total);
      if (m.type === 'executing' && m.data.node) { nodesDone++; const n = g[m.data.node]; if (n) j.stage = j.stage.replace(/ · .*$/, '') + ' · ' + n.class_type; } } catch (er) {} }; } catch (e) {}
  const r = await fetch(base + '/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: g, client_id }) });
  const pj = await r.json(); if (!r.ok || pj.error) { try { ws && ws.close(); } catch (e) {} throw new Error('El motor rechazó el flujo: ' + ((pj.error && pj.error.message) || '') + ' ' + JSON.stringify(pj.node_errors || {}).slice(0, 300)); }
  try {
    for (;;) { await new Promise(res => setTimeout(res, 1500));
      const h = (await (await fetch(base + '/history/' + pj.prompt_id)).json())[pj.prompt_id]; if (!h) continue;
      if (h.status && h.status.status_str === 'error') { const m = (h.status.messages || []).find(x => x[0] === 'execution_error'); throw new Error('Error en ' + (m ? m[1].node_type + ': ' + m[1].exception_message : 'el motor de vídeo').slice(0, 400)); }
      if (h.status && h.status.completed) { j.p = span[1]; return h.outputs; } }
  } finally { try { ws && ws.close(); } catch (e) {} }
}
async function outImages(base, outputs, nodeId) {
  const imgs = (outputs[nodeId] && outputs[nodeId].images) || [];
  return Promise.all(imgs.map(async im => { if (comfyManaged()) return path.join(COMFY_OUT, im.subfolder || '', im.filename);
    const q = new URLSearchParams({ filename: im.filename, subfolder: im.subfolder || '', type: im.type || 'output' }); const b = Buffer.from(await (await fetch(base + '/view?' + q)).arrayBuffer()); const p = path.join(RC, 'tmp-' + im.filename); fs.writeFileSync(p, b); return p; }));
}

/* ---------- 2. Máscara con SAM 3.1 ---------- */
export async function recastMask(id, { points = [], text = '' } = {}) {
  const m = meta(id); if (!m.sw) throw new Error('Primero elige el tramo'); const j = job(id + ':mask'); const base = await startComfy(s => j.say(s));
  const f0 = await putInput(base, path.join(dir(id), 'f0.png'), `plato_${id}_f0.png`);
  const pos = points.filter(p => p.pos !== false).map(p => ({ x: Math.round(p.x * m.sw), y: Math.round(p.y * m.sh) })), neg = points.filter(p => p.pos === false).map(p => ({ x: Math.round(p.x * m.sw), y: Math.round(p.y * m.sh) }));
  if (!pos.length && !text) throw new Error('Toca a quien quieras cambiar o escribe qué es');
  const { g, sv } = maskGraph({ image: f0, pos, neg, text, prefix: `plato/${id}_m0` });
  const out = await comfyRun(g.g, j); const [png] = await outImages(base, out, sv); if (!png) throw new Error('SAM no encontró nada ahí: prueba a tocar en otro sitio');
  const dst = path.join(dir(id), 'mask0.png'); fs.copyFileSync(png, dst); m.mask0 = dst; m.points = points; m.text = text; m.mask = null; saveMeta(id, m); j.done = true; return dst;
}
export function maskGraph({ image, pos = [], neg = [], text = '', prefix }) {
  const g = new Graph(); const ck = g.add('CheckpointLoaderSimple', { ckpt_name: MODELS.sam }); const img = g.add('LoadImage', { image });
  const det = { model: L(ck, 0), image: L(img, 0), threshold: text ? 0.4 : 0.5, refine_iterations: 2, individual_masks: false };
  if (pos.length) det.positive_coords = L(g.add('PrimitiveString', { value: JSON.stringify(pos) }));
  if (neg.length) det.negative_coords = L(g.add('PrimitiveString', { value: JSON.stringify(neg) }));
  if (text) det.conditioning = L(g.add('CLIPTextEncode', { text, clip: L(ck, 1) }));
  const sd = g.add('SAM3_Detect', det); const sv = g.add('SaveImage', { images: L(g.add('MaskToImage', { mask: L(sd, 0) })), filename_prefix: prefix });
  return { g, sv };
}
export function trackGraph({ video, mask0, prefix }) {
  const g = new Graph(); const ck = g.add('CheckpointLoaderSimple', { ckpt_name: MODELS.sam });
  const vid = g.add('GetVideoComponents', { video: L(g.add('LoadVideo', { file: video })) });
  const im = g.add('ImageToMask', { image: L(g.add('LoadImage', { image: mask0 })), channel: 'red' });
  const tr = g.add('SAM3_VideoTrack', { images: L(vid, 0), model: L(ck, 0), initial_mask: L(im, 0), detection_threshold: 0.5, max_objects: 1, detect_interval: 1 });
  const save = g.add('SaveImage', { images: L(g.add('MaskToImage', { mask: L(g.add('SAM3_TrackToMask', { track_data: L(tr, 0), object_indices: '' })) })), filename_prefix: prefix });
  return { g, save };
}
export async function maskOverlay(id) { const d = dir(id); const out = path.join(d, 'mask0-ov.png');
  await ffrun(['-i', path.join(d, 'f0.png'), '-i', path.join(d, 'mask0.png'), '-filter_complex', '[1:v]format=rgba,colorchannelmixer=ra=0:ga=0:ba=0:aa=0:ar=0.55,lutrgb=r=255:g=60:b=120[t];[0:v][t]overlay=format=auto', '-frames:v', '1', out]); return fs.readFileSync(out); }
// Sigue la máscara por todo el tramo → mask.mkv (gris, sin pérdidas) + vista previa.
export function recastTrack(id) {
  const j = job(id);
  (async () => {
    try {
      const m = meta(id); if (!m.mask0) throw new Error('Primero marca qué cambiar'); const d = dir(id); j.say('Siguiendo la máscara por el clip…', 0.02);
      const base = await startComfy(s => j.say(s)); const sv = await putInput(base, path.join(d, 'sam.mp4'), `plato_${id}_sam.mp4`); const m0 = await putInput(base, m.mask0, `plato_${id}_mask0.png`);
      const { g, save } = trackGraph({ video: sv, mask0: m0, prefix: `plato/${id}_trk` });
      const out = await comfyRun(g.g, j, [0.05, 0.85]); const pngs = (await outImages(base, out, save)).sort();
      if (!pngs.length) throw new Error('El seguimiento no devolvió máscaras');
      j.say('Guardando la máscara…', 0.9); const seq = path.join(d, 'trk'); fs.rmSync(seq, { recursive: true, force: true }); fs.mkdirSync(seq);
      pngs.forEach((p, i) => fs.copyFileSync(p, path.join(seq, String(i).padStart(6, '0') + '.png')));
      const mk = path.join(d, 'mask.mkv'); await ffrun(['-framerate', String(m.sfps), '-i', path.join(seq, '%06d.png'), '-vf', 'format=gray', '-c:v', 'ffv1', mk]);
      const pv = path.join(d, 'preview.mp4'); // vista previa: el clip con la máscara teñida
      await ffrun(['-i', path.join(d, 'sam.mp4'), '-i', mk, '-filter_complex', '[1:v]format=rgba,colorchannelmixer=ra=0:ga=0:ba=0:aa=0:ar=0.55,lutrgb=r=255:g=60:b=120[ov];[0:v][ov]overlay=format=auto,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', pv]);
      m.mask = mk; m.maskFrames = pngs.length; saveMeta(id, m); j.out = { preview: pv, frames: pngs.length }; j.say('Máscara lista', 1);
    } catch (e) { j.error = e.message; } j.done = true;
  })();
  return recastJob(id);
}

/* ---------- 3. Recorte: solo la zona que cambia ---------- */
async function maskBBox(m) {
  const w = Math.max(16, Math.round(m.sw / 4)), h = Math.max(16, Math.round(m.sh / 4)); const raw = await ffraw(['-i', m.mask, '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray']);
  let x0 = w, y0 = h, x1 = -1, y1 = -1; const fr = w * h;
  for (let o = 0; o + fr <= raw.length; o += fr) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (raw[o + y * w + x] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('La máscara está vacía');
  return { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h };
}
const BUCKETS = { draft: [[832, 480], [480, 832], [640, 640], [720, 544], [544, 720]], final: [[1280, 720], [720, 1280], [960, 960], [1088, 832], [832, 1088]] };
export function planCrop(bb, W, H, quality = 'draft') {
  let bw = (bb.x1 - bb.x0) * W, bh = (bb.y1 - bb.y0) * H; const cx = (bb.x0 + bb.x1) / 2 * W, cy = (bb.y0 + bb.y1) / 2 * H;
  const pad = 0.12 * Math.max(bw, bh) + 24; bw += pad * 2; bh += pad * 2;
  const [TW, TH] = BUCKETS[quality].slice().sort((a, b) => Math.abs(Math.log(a[0] / a[1] / (bw / bh))) - Math.abs(Math.log(b[0] / b[1] / (bw / bh))))[0];
  const ar = TW / TH; let w = bw, h = bh; if (w / h < ar) w = h * ar; else h = w / ar;
  if (w > W) { w = W; h = Math.min(H, w / ar); } if (h > H) { h = H; w = Math.min(W, h * ar); }
  w = Math.max(64, Math.round(w / 2) * 2); h = Math.max(64, Math.round(h / 2) * 2);
  const x = Math.round(Math.min(Math.max(0, cx - w / 2), W - w) / 2) * 2, y = Math.round(Math.min(Math.max(0, cy - h / 2), H - h) / 2) * 2;
  return { x, y, w, h, TW, TH, full: w >= W * 0.95 && h >= H * 0.95 };
}

/* ---------- 4. Grafos de generación ---------- */
export function animateGraph({ crop, bg, mask, ref, prompt, TW, TH, frames, steps, interp, prefix, cuda = true, seed = 42 }) {
  const g = new Graph(); const LEN = 77, OVER = 5;
  const unet = g.add('UNETLoader', { unet_name: MODELS.animate, weight_dtype: 'default' });
  const l1 = g.add('LoraLoaderModelOnly', { model: L(unet), lora_name: MODELS.relight, strength_model: 1.0 });
  const l2 = g.add('LoraLoaderModelOnly', { model: L(l1), lora_name: MODELS.lightx2v, strength_model: 1.0 });
  const model = g.add('ModelSamplingSD3', { model: L(l2), shift: 8 });
  const clip = g.add('CLIPLoader', { clip_name: MODELS.umt5, type: 'wan', device: 'default' });
  const pos = g.add('CLIPTextEncode', { text: prompt || 'the person moves naturally', clip: L(clip) }); const neg = g.add('ConditioningZeroOut', { conditioning: L(pos) });
  const vae = g.add('VAELoader', { vae_name: MODELS.vae });
  const refImg = g.add('LoadImage', { image: ref }); const cve = g.add('CLIPVisionEncode', { clip_vision: L(g.add('CLIPVisionLoader', { clip_name: MODELS.clipv })), image: L(refImg), crop: 'none' });
  const src = g.add('GetVideoComponents', { video: L(g.add('LoadVideo', { file: crop })) });
  const bgv = g.add('GetVideoComponents', { video: L(g.add('LoadVideo', { file: bg })) });
  const mk = g.add('ImageToMask', { image: L(g.add('GetVideoComponents', { video: L(g.add('LoadVideo', { file: mask })) })), channel: 'red' });
  const pm = g.add('OnnxDetectionModelLoader', { vitpose_model: MODELS.vitpose, yolo_model: MODELS.yolo, onnx_device: cuda ? 'CUDAExecutionProvider' : 'CPUExecutionProvider' });
  const pfd = g.add('PoseAndFaceDetection', { model: L(pm), images: L(src), width: TW, height: TH });
  const pose = g.add('DrawViTPose', { pose_data: L(pfd), width: TW, height: TH, retarget_padding: 16, body_stick_width: -1, hand_stick_width: -1, draw_head: true });
  const fim = interp ? g.add('FrameInterpolationModelLoader', { model_name: MODELS.film }) : null;
  const chunks = 1 + Math.ceil(Math.max(0, frames - LEN) / (LEN - OVER)); const saves = []; let prevWA = null, prevDec = null;
  for (let k = 0; k < chunks; k++) {
    const wa = g.add('WanAnimateToVideo', { positive: L(pos), negative: L(neg), vae: L(vae), width: TW, height: TH, length: LEN, batch_size: 1, continue_motion_max_frames: OVER,
      video_frame_offset: k ? L(prevWA, 5) : 0, clip_vision_output: L(cve), reference_image: L(refImg), face_video: L(pfd, 1), pose_video: L(pose), background_video: L(bgv), character_mask: L(mk), ...(k ? { continue_motion: L(prevDec) } : {}) });
    const ks = g.add('KSampler', { model: L(model), seed, steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple', positive: L(wa, 0), negative: L(wa, 1), latent_image: L(wa, 2), denoise: 1 });
    const dec = g.add('VAEDecode', { samples: L(g.add('TrimVideoLatent', { samples: L(ks), trim_amount: L(wa, 3) })), vae: L(vae) });
    let out = k ? g.add('ImageFromBatch', { image: L(dec), batch_index: L(wa, 4), length: 4096 }) : dec;
    if (fim) out = g.add('FrameInterpolate', { interp_model: L(fim), images: L(out), multiplier: 2 });
    saves.push(g.add('SaveImage', { images: L(out), filename_prefix: `${prefix}_c${String(k).padStart(2, '0')}` })); prevWA = wa; prevDec = dec;
  }
  return { graph: g.g, saves, chunks };
}
export function vaceGraph({ ctrl, mask, ref, prompt, TW, TH, frames, steps, interp, prefix, seed = 42 }) {
  const g = new Graph(); const LEN = 81;
  const model = g.add('ModelSamplingSD3', { model: L(g.add('UNETLoader', { unet_name: MODELS.vace, weight_dtype: 'default' })), shift: 5 });
  const clip = g.add('CLIPLoader', { clip_name: MODELS.umt5, type: 'wan', device: 'default' });
  const pos = g.add('CLIPTextEncode', { text: prompt, clip: L(clip) }), neg = g.add('CLIPTextEncode', { text: NEG, clip: L(clip) });
  const vae = g.add('VAELoader', { vae_name: MODELS.vae });
  const cv = g.add('GetVideoComponents', { video: L(g.add('LoadVideo', { file: ctrl })) }); const mv = g.add('GetVideoComponents', { video: L(g.add('LoadVideo', { file: mask })) });
  const refImg = ref ? g.add('LoadImage', { image: ref }) : null; const fim = interp ? g.add('FrameInterpolationModelLoader', { model_name: MODELS.film }) : null;
  const chunks = Math.ceil(frames / LEN); const saves = [];
  for (let k = 0; k < chunks; k++) {
    const n = Math.min(LEN, frames - k * LEN), len = Math.max(5, Math.ceil((n - 1) / 4) * 4 + 1);
    const cimg = g.add('ImageFromBatch', { image: L(cv), batch_index: k * LEN, length: n }); const cm = g.add('ImageToMask', { image: L(g.add('ImageFromBatch', { image: L(mv), batch_index: k * LEN, length: n })), channel: 'red' });
    const v = g.add('WanVaceToVideo', { positive: L(pos), negative: L(neg), vae: L(vae), width: TW, height: TH, length: len, batch_size: 1, strength: 1, control_video: L(cimg), control_masks: L(cm), ...(refImg ? { reference_image: L(refImg) } : {}) });
    const ks = g.add('KSampler', { model: L(model), seed, steps, cfg: 5, sampler_name: 'uni_pc', scheduler: 'simple', positive: L(v, 0), negative: L(v, 1), latent_image: L(v, 2), denoise: 1 });
    let out = g.add('ImageFromBatch', { image: L(g.add('VAEDecode', { samples: L(g.add('TrimVideoLatent', { samples: L(ks), trim_amount: L(v, 3) })), vae: L(vae) })), batch_index: 0, length: n });
    if (fim) out = g.add('FrameInterpolate', { interp_model: L(fim), images: L(out), multiplier: 2 });
    saves.push(g.add('SaveImage', { images: L(out), filename_prefix: `${prefix}_c${String(k).padStart(2, '0')}` }));
  }
  return { graph: g.g, saves, chunks };
}

/* ---------- Audio: original, voz cambiada o sin voz (todo local) ---------- */
function pyrun(py, args, cwd, j) { return new Promise((ok, ko) => { const p = spawn(py, args, { cwd, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }); let out = '', err = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err = (err + d).slice(-3000); const l = String(d).trim().split('\n').pop(); if (l && j) j.stage = j.stage.replace(/ · .*$/, '') + ' · ' + l.slice(0, 80); });
  p.on('error', ko); p.on('close', c => c === 0 ? ok(out) : ko(new Error(err.trim().split('\n').slice(-2).join(' | ') || 'Python falló'))); }); }
async function separate(wav, outDir, j) {
  if (!fs.existsSync(envPy('audio'))) throw new Error('Para tocar la voz instala «Separar voz y música» en Ajustes → IA local');
  fs.mkdirSync(outDir, { recursive: true });
  const code = `import json,sys\nfrom audio_separator.separator import Separator\ns=Separator(output_dir=sys.argv[2],output_format='WAV',model_file_dir=sys.argv[3])\ns.load_model(model_filename='UVR-MDX-NET-Inst_HQ_3.onnx')\nprint(json.dumps(s.separate(sys.argv[1])))`;
  const out = await pyrun(envPy('audio'), ['-c', code, wav, outDir, path.join(AI, 'models', 'uvr')], outDir, j);
  const files = JSON.parse(out.trim().split('\n').pop()).map(f => path.isAbsolute(f) ? f : path.join(outDir, f));
  const voc = files.find(f => /vocals/i.test(f)), inst = files.find(f => /instrumental/i.test(f)); if (!voc || !inst) throw new Error('El separador no devolvió voz y música');
  return { voc, inst };
}
async function convertVoice(voc, ref, outDir, j) {
  const sv = path.join(AI, 'seed-vc'); if (!fs.existsSync(path.join(sv, 'inference.py'))) throw new Error('Para cambiar la voz instala «Cambiar la voz (Seed-VC)» en Ajustes → IA local');
  fs.mkdirSync(outDir, { recursive: true }); const gpu = hardware().gpu && hardware().gpu.vendor === 'nvidia';
  await pyrun(envPy('seedvc'), ['inference.py', '--source', voc, '--target', ref, '--output', outDir, '--diffusion-steps', gpu ? '30' : '15', '--length-adjust', '1.0', '--inference-cfg-rate', '0.7', '--f0-condition', 'False', '--auto-f0-adjust', 'False', '--semi-tone-shift', '0', '--fp16', gpu ? 'True' : 'False'], sv, j);
  const w = fs.readdirSync(outDir).filter(f => f.endsWith('.wav')).map(f => path.join(outDir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!w) throw new Error('Seed-VC no generó audio'); return w;
}
async function buildAudio(m, voice, d, j) {
  if (!m.audio || !voice || voice.mode === 'keep') return null;
  const wav = path.join(d, 'a.wav'); await ffrun(['-i', path.join(d, 'seg.mp4'), '-vn', '-ac', '2', '-ar', '44100', wav]);
  j.say('Separando voz y música…'); const { voc, inst } = await separate(wav, path.join(d, 'sep'), j);
  if (voice.mode === 'mute') return inst;
  let ref = path.join(d, 'voice-ref.wav');
  if (voice.refB64) fs.writeFileSync(ref, Buffer.from(voice.refB64, 'base64'));
  else { const r = await speak({ engine: voice.engine || 'kokoro', voice: voice.voice || 'ef_dora', text: 'Hola, esta es mi voz. La uso para hablar con calma y con claridad, y también puedo sonar alegre cuando cuento una buena historia. Gracias por escucharme.' });
    const tmp = path.join(d, 'voice-ref.' + (/mpeg|mp3/.test(r.mime) ? 'mp3' : 'wav')); fs.writeFileSync(tmp, r.audio); await ffrun(['-i', tmp, '-ar', '44100', ref]); }
  j.say('Cambiando la voz…'); const conv = await convertVoice(voc, ref, path.join(d, 'vc'), j);
  const mix = path.join(d, 'mix.wav'); await ffrun(['-i', conv, '-i', inst, '-filter_complex', '[0:a]aresample=44100[v];[1:a]aresample=44100[i];[v][i]amix=inputs=2:normalize=0:duration=longest', mix]); return mix;
}

/* ---------- 5. Todo junto ---------- */
export function recastRun(id, { mode = 'personaje', quality = 'draft', prompt = '', refB64 = null, voice = { mode: 'keep' }, interp = true, outDir = null, dryRun = false } = {}) {
  const j = job(id);
  (async () => {
    try {
      const m = meta(id); const d = dir(id); if (!m.mask) throw new Error('Primero sigue la máscara por el clip');
      if (mode === 'personaje' && !refB64 && !dryRun) throw new Error('Sube la imagen del personaje');
      const h = hardware(); const cuda = h.gpu && h.gpu.vendor === 'nvidia';
      j.say('Calculando la zona que cambia…', 0.01); const bb = await maskBBox(m); const c = planCrop(bb, m.W, m.H, quality);
      const frames = Math.max(5, Math.round(m.segDur * WFPS)); const tag = `${id}_${quality}`;
      // Entradas del modelo, todas a 16 fps y al tamaño del recorte.
      j.say(`Recortando ${c.w}×${c.h} → ${c.TW}×${c.TH}…`, 0.03);
      const crop = path.join(d, 'in-crop.mp4'), mk = path.join(d, 'in-mask.mp4'), fill = path.join(d, 'in-fill.mp4');
      const cropF = `fps=${WFPS},crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${c.TW}:${c.TH}:flags=lanczos`;
      const block = mode === 'personaje' ? 32 : 16; // máscara en bloques, como la entrenaron (y algo más grande que el sujeto)
      const maskF = `scale=${m.W}:${m.H}:flags=bilinear,fps=${WFPS},crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${c.TW}:${c.TH}:flags=bilinear,format=gray,scale=${Math.ceil(c.TW / block)}:${Math.ceil(c.TH / block)}:flags=area,lut=y='if(gt(val\\,6)\\,255\\,0)',scale=${c.TW}:${c.TH}:flags=neighbor`;
      await ffrun(['-i', path.join(d, 'seg.mp4'), '-vf', cropF, '-an', ...lossless, crop]);
      await ffrun(['-i', m.mask, '-vf', maskF + ',format=yuv420p', '-an', ...lossless, mk]);
      await ffrun(['-i', crop, '-i', mk, '-f', 'lavfi', '-i', `color=${mode === 'personaje' ? 'black' : '0x808080'}:s=${c.TW}x${c.TH}:r=${WFPS}`, '-filter_complex', '[1:v]format=gray[a];[2:v][a]alphamerge[f];[0:v][f]overlay=shortest=1,format=yuv420p', '-an', ...lossless, fill]);
      let gen, t0 = Date.now(), chunks = 0;
      if (dryRun) { // prueba del recorte y el pegado sin IA: tiñe la zona para ver qué cambiaría
        gen = path.join(d, `gen-${quality}.mp4`); await ffrun(['-i', crop, '-vf', 'hue=h=150:s=1.6,eq=brightness=0.05', ...lossless, gen]);
      } else {
        const base = await startComfy(s => j.say(s));
        const names = { crop: await putInput(base, crop, `plato_${tag}_crop.mp4`), mask: await putInput(base, mk, `plato_${tag}_mask.mp4`), fill: await putInput(base, fill, `plato_${tag}_fill.mp4`) };
        let ref = null; if (refB64) { const rp = path.join(d, 'ref.png'); fs.writeFileSync(rp, Buffer.from(refB64, 'base64')); ref = await putInput(base, rp, `plato_${tag}_ref.png`); }
        const useInterp = interp && fs.existsSync(path.join(AI, 'ComfyUI', 'models', 'frame_interpolation', MODELS.film));
        const q = quality === 'final'; const prefix = `plato/${tag}_${Date.now().toString(36)}`;
        const built = mode === 'personaje'
          ? animateGraph({ crop: names.crop, bg: names.fill, mask: names.mask, ref, prompt, TW: c.TW, TH: c.TH, frames, steps: q ? 6 : 4, interp: useInterp, prefix, cuda })
          : vaceGraph({ ctrl: names.fill, mask: names.mask, ref, prompt: mode === 'borrar' ? (prompt || 'empty background, nothing there, seamless continuation of the scene') : prompt, TW: c.TW, TH: c.TH, frames, steps: q ? 25 : 12, interp: useInterp, prefix });
        j.say(`Generando ${mode === 'personaje' ? 'el personaje' : mode === 'borrar' ? 'el fondo' : 'el objeto'} (${built.chunks} trozo${built.chunks > 1 ? 's' : ''})…`, 0.06);
        t0 = Date.now(); const outs = await comfyRun(built.graph, j, [0.06, 0.82]);
        const seq = path.join(d, 'gen-' + quality); fs.rmSync(seq, { recursive: true, force: true }); fs.mkdirSync(seq); let n = 0;
        for (const s of built.saves) for (const p of (await outImages(base, outs, s)).sort()) fs.copyFileSync(p, path.join(seq, String(n++).padStart(6, '0') + '.png'));
        if (!n) throw new Error('El motor no devolvió fotogramas');
        const gfps = WFPS * (useInterp ? 2 : 1); const keepN = Math.round(frames * (useInterp ? 2 : 1));
        gen = path.join(d, `gen-${quality}.mp4`); await ffrun(['-framerate', String(gfps), '-i', path.join(seq, '%06d.png'), '-frames:v', String(Math.min(n, keepN)), ...lossless, gen]);
        chunks = built.chunks;
      }
      // Audio
      let audio = null; try { audio = await buildAudio(m, voice, d, j); } catch (e) { j.log.push('Audio: ' + e.message + ' (dejo el original)'); }
      // Pegado: solo dentro de la máscara (algo más grande y con borde suave); fuera, el original intacto.
      j.say('Pegando en el vídeo original…', 0.9); const feather = Math.max(2, Math.round(Math.min(c.w, c.h) / 160));
      const fc = `[1:v]fps=${m.fps},scale=${c.w}:${c.h}:flags=lanczos,format=rgba[g];` +
        `[2:v]scale=${m.W}:${m.H}:flags=bilinear,fps=${m.fps},format=gray,crop=${c.w}:${c.h}:${c.x}:${c.y},${'dilation,'.repeat(Math.min(12, feather * 2))}gblur=sigma=${feather * 1.5}[a];` +
        `[g][a]alphamerge[ga];[0:v][ga]overlay=${c.x}:${c.y}:eof_action=pass:format=auto,format=yuv420p[v]`;
      const outName = `recast-${mode}-${quality}-${id}.mp4`; const out = path.join(d, outName);
      await ffrun(['-i', path.join(d, 'seg.mp4'), '-i', gen, '-i', m.mask, ...(audio ? ['-i', audio] : []), '-filter_complex', fc, '-map', '[v]', ...(audio ? ['-map', '3:a', '-c:a', 'aac', '-b:a', '192k'] : ['-map', '0:a?', '-c:a', 'copy']), ...enc(), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(m.segDur), out]);
      let saved = null; if (outDir) { fs.mkdirSync(outDir, { recursive: true }); saved = path.join(outDir, outName); fs.copyFileSync(out, saved); }
      j.out = { file: outName, saved, crop: c, secs: Math.round((Date.now() - t0) / 1000), frames, chunks };
      j.say('Listo', 1);
    } catch (e) { j.error = e.message; }
    j.done = true;
  })();
  return recastJob(id);
}

/* ---------- Rutas /api/recast/* ---------- */
export async function recastRoute(req, res, url, { readJSON, json, OUT }) {
  const p = url.pathname; if (!p.startsWith('/api/recast/')) return false;
  const q = url.searchParams; const sendFile = (f, type) => { const st = fs.statSync(f); res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res); };
  if (p === '/api/recast/new' && req.method === 'POST') return json(res, 200, await recastNew(req, decodeURIComponent(req.headers['x-name'] || 'clip.mp4'))), true;
  if (p === '/api/recast/frame') return sendFile(await recastFrame(q.get('id'), +q.get('t') || 0), 'image/jpeg'), true;
  if (p === '/api/recast/segment' && req.method === 'POST') { const b = await readJSON(req); const r = await recastSegment(b.id, +b.start || 0, +b.dur || 5); return json(res, 200, { ...r, frame: undefined }), true; }
  if (p === '/api/recast/f0') return sendFile(path.join(dir(q.get('id')), 'f0.png'), 'image/png'), true;
  if (p === '/api/recast/mask' && req.method === 'POST') { const b = await readJSON(req); const f = await recastMask(b.id, b); return json(res, 200, { mask: fs.readFileSync(f).toString('base64') }), true; }
  if (p === '/api/recast/track' && req.method === 'POST') { const b = await readJSON(req); return json(res, 200, recastTrack(b.id)), true; }
  if (p === '/api/recast/run' && req.method === 'POST') { const b = await readJSON(req, 60e6); return json(res, 200, recastRun(b.id, { ...b, outDir: OUT && path.join(OUT, new Date().toISOString().slice(0, 10)) })), true; }
  if (p === '/api/recast/job') return json(res, 200, recastJob(q.get('id')) || { done: true }), true;
  if (p === '/api/recast/file') { const name = path.basename(q.get('name') || ''); if (!/^(preview|recast-[\w-]+)\.mp4$/.test(name)) return json(res, 400, { error: 'archivo no válido' }), true; return sendFile(path.join(dir(q.get('id')), name), 'video/mp4'), true; }
  json(res, 404, { error: 'No existe ' + p }); return true;
}
