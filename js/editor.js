// 🎞 Montaje: une tus planos, recorta, fundidos, música y rótulo. Exporta el corto final.
import { el, btn, toast, seg, uid, db, blobURL, fmtTime, download, thumbFromVideo, vib } from './core.js';
import { pickFromGallery, loadGens } from './gallery.js';

const SIZES = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [1080, 1080], '4:3': [1024, 768] };
async function getProj() { return (await db.get('projects', 'current')) || { id: 'current', title: '', clips: [], music: null, musicVol: 0.7, clipVol: 1, aspect: '16:9', tracks: [], subs: [], burnSubs: true }; }
const saveProj = p => db.put('projects', p);
export async function addToEdit(g) {
  if (!g.blob) { toast('Este vídeo solo está como enlace; no se puede montar'); return; }
  const p = await getProj(); p.clips.push({ id: uid(), genId: g.id, in: 0, out: g.dur || 5, trans: p.clips.length ? 'cut' : 'fade' }); await saveProj(p);
  vib(8); toast('➕ Añadido al montaje', 3000, { action: { label: 'Ir al montaje', fn: () => location.hash = '#edit' } });
}
let root = null, playing = null;
export async function renderEditor(r) {
  root = r; r.innerHTML = ''; const p = await getProj(); const gens = Object.fromEntries((await loadGens()).map(g => [g.id, g]));
  p.clips = p.clips.filter(c => gens[c.genId] && gens[c.genId].blob); p.tracks = p.tracks || []; p.subs = p.subs || [];
  const total = p.clips.reduce((a, c) => a + Math.max(0, c.out - c.in), 0) + (p.title ? 2 : 0);
  const canvas = el('canvas', { class: 'edcanvas' }); const [W, H] = SIZES[p.aspect] || SIZES['16:9']; canvas.width = W; canvas.height = H; blank(canvas, p);
  const titleIn = el('input', { class: 'txt', placeholder: 'Rótulo inicial (opcional, 2 s)', value: p.title }); titleIn.addEventListener('change', async () => { p.title = titleIn.value; await saveProj(p); blank(canvas, p); });
  const musicIn = el('input', { type: 'file', accept: 'audio/*', hidden: true, on: { change: async e => { const f = e.target.files[0]; if (f) { p.music = f; p.musicName = f.name; await saveProj(p); renderEditor(r); } } } });
  r.append(el('div', { class: 'editor' },
    el('section', { class: 'card' }, el('h3', {}, `Vista previa · ${fmtTime(total)}`), canvas,
      el('div', { class: 'row-btns' }, btn('▶ Vista previa', () => run(p, gens, canvas, false), 'b on'), btn('⏹', () => { if (playing) playing.stop = true; }), btn('⏺ Exportar vídeo', () => run(p, gens, canvas, true), 'b hot')),
      el('div', { class: 'note' }, 'La exportación se graba en tiempo real: deja la app abierta y en primer plano hasta que termine.')),
    el('section', { class: 'card' }, el('h3', {}, 'Formato y texto'), seg([['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1'], ['4:3', '4:3']], () => p.aspect, async v => { p.aspect = v; await saveProj(p); renderEditor(r); }), el('div', { class: 'gap' }), titleIn,
      el('div', { class: 'gap' }), el('div', { class: 'row-btns' }, btn(p.music ? '🎵 ' + (p.musicName || 'Música') : '🎵 Añadir música', () => musicIn.click(), 'mini-b'), p.music ? btn('✕ Quitar música', async () => { p.music = null; await saveProj(p); renderEditor(r); }, 'mini-b') : null, musicIn),
      range('Volumen música', p.musicVol, async v => { p.musicVol = v; await saveProj(p); }), range('Volumen de los clips', p.clipVol, async v => { p.clipVol = v; await saveProj(p); })),
    audioCard(p, gens, r),
    el('section', { class: 'card' }, el('h3', {}, `Planos (${p.clips.length})`), clipsList(p, gens, r),
      el('div', { class: 'row-btns' }, btn('➕ Añadir de la galería', async () => { const g = await pickFromGallery('video'); if (g) { await addToEdit(g); renderEditor(r); } }, 'b on'), p.clips.length ? btn('🗑 Vaciar', async () => { p.clips = []; await saveProj(p); renderEditor(r); }, 'mini-b red') : null))));
}
const range = (label, v, set) => { const val = el('span', { class: 'val' }, Math.round(v * 100) + '%'); const i = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: v, on: { input: e => { val.textContent = Math.round(e.target.value * 100) + '%'; set(+e.target.value); } } }); return el('div', { class: 'rowr' }, el('label', {}, label), i, val); };
function clipsList(p, gens, r) {
  if (!p.clips.length) return el('div', { class: 'empty' }, 'Añade vídeos desde la galería o con «➕ Montaje» en cualquier resultado.');
  const box = el('div', { class: 'clips' });
  p.clips.forEach((c, i) => { const g = gens[c.genId]; const dur = g.dur || 5;
    const inR = el('input', { type: 'range', min: 0, max: dur, step: 0.1, value: c.in }), outR = el('input', { type: 'range', min: 0, max: dur, step: 0.1, value: c.out }); const info = el('small', {}, `${c.in.toFixed(1)}–${c.out.toFixed(1)} s`);
    const upd = async () => { c.in = Math.min(+inR.value, +outR.value - 0.3); c.out = Math.max(+outR.value, c.in + 0.3); info.textContent = `${c.in.toFixed(1)}–${c.out.toFixed(1)} s`; await saveProj(p); };
    inR.addEventListener('change', upd); outR.addEventListener('change', upd);
    const mv = async d => { const j = i + d; if (j < 0 || j >= p.clips.length) return; [p.clips[i], p.clips[j]] = [p.clips[j], p.clips[i]]; await saveProj(p); renderEditor(r); };
    box.append(el('div', { class: 'clip' }, g.thumb ? el('img', { src: blobURL(g.thumb), alt: '' }) : el('video', { src: blobURL(g.blob), muted: true }),
      el('div', { class: 'cm' }, el('b', {}, `${i + 1}. ${g.modelName}`), info, el('div', { class: 'tr' }, el('span', {}, 'Entrada'), inR), el('div', { class: 'tr' }, el('span', {}, 'Salida'), outR),
        seg([['cut', 'Corte'], ['fade', 'Fundido']], () => c.trans, async v => { c.trans = v; await saveProj(p); })),
      el('div', { class: 'cb' }, btn('↑', () => mv(-1), 'mini-b'), btn('↓', () => mv(1), 'mini-b'), btn('✕', async () => { p.clips.splice(i, 1); await saveProj(p); renderEditor(r); }, 'mini-b')))); });
  return box;
}
// Línea de tiempo: las pistas y subtítulos pueden ir anclados a un plano (clipId + at, en segundos del vídeo original) o a un tiempo absoluto.
function timeline(p) { const off = p.title ? 2 : 0; const st = {}; let t = off; for (const c of p.clips) { st[c.id] = t; t += Math.max(0, c.out - c.in); }
  const abs = x => x.clipId ? (st[x.clipId] != null ? st[x.clipId] + (x.at - (p.clips.find(c => c.id === x.clipId).in)) : null) : off + (x.at || 0);
  return { total: t, abs, starts: st }; }
const srtT = s => { const ms = Math.max(0, Math.round(s * 1000)); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
function subsList(p) { const tl = timeline(p); return p.subs.map(x => { const a = tl.abs(x); return a == null ? null : { start: a, end: a + (x.len || 2), text: x.text }; }).filter(Boolean).sort((a, b) => a.start - b.start); }
function toSRT(p) { return subsList(p).map((x, i) => `${i + 1}\n${srtT(x.start)} --> ${srtT(x.end)}\n${x.text}\n`).join('\n'); }
function audioCard(p, gens, r) {
  const tl = timeline(p); const file = el('input', { type: 'file', accept: 'audio/*', hidden: true, on: { change: async e => { const f = e.target.files[0]; if (!f) return; p.tracks.push({ id: uid(), blob: f, at: 0, vol: 1, label: f.name }); await saveProj(p); renderEditor(r); } } });
  const srt = el('input', { type: 'file', accept: '.srt,.txt', hidden: true, on: { change: async e => { const f = e.target.files[0]; if (!f) return; const txt = await f.text(); const off = p.title ? 2 : 0; const ts = v => { const m = v.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0; };
    p.subs = txt.split(/\r?\n\r?\n/).map(b => { const l = b.trim().split(/\r?\n/); const i = l.findIndex(x => x.includes('-->')); if (i < 0) return null; const [a, z] = l[i].split('-->').map(ts); return { id: uid(), at: a - off, len: z - a, text: l.slice(i + 1).join('\n') }; }).filter(Boolean); await saveProj(p); toast(`💬 ${p.subs.length} subtítulos`); renderEditor(r); } } });
  const box = el('div', { class: 'tracks' });
  p.tracks.forEach((t, i) => { const a = tl.abs(t); const at = el('input', { type: 'number', class: 'txt num', step: 0.1, value: (a ?? 0).toFixed(1), title: 'Empieza en (s)', on: { change: async e => { t.clipId = null; t.at = +e.target.value - (p.title ? 2 : 0); await saveProj(p); } } });
    box.append(el('div', { class: 'trk' }, el('span', { class: 'ic' }, /música|music/i.test(t.label || '') ? '🎵' : '🗣'), el('b', {}, t.label || 'Audio'), at, el('input', { type: 'range', min: 0, max: 1.5, step: 0.05, value: t.vol ?? 1, title: 'Volumen', on: { change: async e => { t.vol = +e.target.value; await saveProj(p); } } }), btn('▶', () => { const au = new Audio(blobURL(t.blob)); au.volume = Math.min(1, t.vol ?? 1); au.play().catch(() => {}); }, 'mini-b'), btn('✕', async () => { p.tracks.splice(i, 1); await saveProj(p); renderEditor(r); }, 'mini-b'))); });
  const subs = subsList(p);
  return el('section', { class: 'card' }, el('h3', {}, `Audio y subtítulos`), p.tracks.length ? box : el('div', { class: 'empty' }, 'Voces, efectos o música colocados en el tiempo. El Director los coloca solos al montar un capítulo.'),
    el('div', { class: 'row-btns' }, btn('➕ Pista de audio', () => file.click(), 'mini-b'), btn('➕ Audio de la galería', async () => { const g = await pickFromGallery('audio'); if (g && g.blob) { p.tracks.push({ id: uid(), blob: g.blob, at: 0, vol: 1, label: g.modelName }); await saveProj(p); renderEditor(r); } }, 'mini-b'), file),
    el('div', { class: 'lbl' }, `Subtítulos (${subs.length})`), subs.length ? el('div', { class: 'subs' }, subs.slice(0, 60).map(x => el('div', {}, el('small', {}, fmtTime(x.start)), ' ', x.text))) : null,
    el('div', { class: 'row-btns' }, toggleB('Incrustar en el vídeo', () => p.burnSubs !== false, async v => { p.burnSubs = v; await saveProj(p); }), subs.length ? btn('⬇ Exportar .srt', () => download(new Blob([toSRT(p)], { type: 'text/plain' }), `${(p.title || 'montaje').replace(/[^\w-]+/g, '_')}.srt`), 'mini-b') : null, btn('⬆ Cargar .srt', () => srt.click(), 'mini-b'), p.subs.length ? btn('✕ Quitar', async () => { p.subs = []; await saveProj(p); renderEditor(r); }, 'mini-b') : null, srt));
}
const toggleB = (label, get, set) => { const b = btn(label, () => { set(!get()); b.classList.toggle('on', !!get()); }, 'mini-b'); b.classList.toggle('on', !!get()); return b; };
function drawSub(c, W, H, text) { c.save(); const fs = Math.round(H / 22); c.font = `600 ${fs}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'bottom';
  const words = text.split(/\s+/); const lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > W * 0.84 && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur);
  const lh = fs * 1.25; let y = H - H * 0.06; for (const l of lines.slice(-3).reverse()) { const w = c.measureText(l).width; c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(W / 2 - w / 2 - fs * 0.4, y - lh, w + fs * 0.8, lh); c.fillStyle = '#fff'; c.fillText(l, W / 2, y - fs * 0.1); y -= lh; } c.restore(); }
function blank(canvas, p) { const c = canvas.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, canvas.width, canvas.height); if (p.title) drawTitle(c, canvas, p.title, 1); }
function drawTitle(c, cv, t, a) { c.save(); c.globalAlpha = a; c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 ${Math.round(cv.height / 12)}px system-ui, sans-serif`; c.fillText(t, cv.width / 2, cv.height / 2); c.restore(); }
function drawCover(c, v, W, H) { const vw = v.videoWidth || W, vh = v.videoHeight || H; const s = Math.max(W / vw, H / vh); const w = vw * s, h = vh * s; c.drawImage(v, (W - w) / 2, (H - h) / 2, w, h); }
function pickMime() { for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} } return ''; }
async function run(p, gens, canvas, record, o = {}) {
  if (playing) { playing.stop = true; await new Promise(r => setTimeout(r, 150)); }
  if (!p.clips.length) { toast('Añade algún plano primero'); return; }
  if (record && !(window.MediaRecorder && canvas.captureStream)) { toast('Este navegador no puede exportar vídeo'); return; }
  const ctl = { stop: false }; playing = ctl; const c = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
  const ac = new (window.AudioContext || window.webkitAudioContext)(); const dest = ac.createMediaStreamDestination(); const out = ac.destination;
  let rec = null, chunks = []; if (record) { const st = canvas.captureStream(30); dest.stream.getAudioTracks().forEach(t => st.addTrack(t)); const mime = pickMime(); rec = new MediaRecorder(st, mime ? { mimeType: mime, videoBitsPerSecond: 10e6 } : {}); rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.start(250); toast('⏺ Exportando… no cierres la app', 4000); }
  let music = null; if (p.music) { music = new Audio(blobURL(p.music)); const s = ac.createMediaElementSource(music); const g = ac.createGain(); g.gain.value = p.musicVol; s.connect(g); g.connect(record ? dest : out); if (record) g.connect(out); music.play().catch(() => {}); }
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const TL = timeline(p); const subs = p.burnSubs !== false ? subsList(p) : []; const pend = (p.tracks || []).map(t => ({ t, at: TL.abs(t) })).filter(x => x.at != null).sort((a, b) => a.at - b.at); const live = [];
  const tick = tl => { while (pend.length && pend[0].at <= tl + 0.02) { const { t, at } = pend.shift(); const au = new Audio(blobURL(t.blob)); try { const s = ac.createMediaElementSource(au); const g = ac.createGain(); g.gain.value = t.vol ?? 1; s.connect(g); g.connect(record ? dest : out); if (record) g.connect(out); } catch (e) {} au.currentTime = Math.max(0, tl - at); au.play().catch(() => {}); live.push(au); }
    const sb = subs.find(x => tl >= x.start && tl < x.end); if (sb) drawSub(c, W, H, sb.text); };
  if (p.title) { const t0 = performance.now(); while (!ctl.stop && performance.now() - t0 < 2000) { const u = (performance.now() - t0) / 2000; c.fillStyle = '#000'; c.fillRect(0, 0, W, H); drawTitle(c, canvas, p.title, Math.min(1, u * 4, (1 - u) * 4)); tick((performance.now() - t0) / 1000); await frame(); } }
  for (let i = 0; i < p.clips.length && !ctl.stop; i++) {
    const cl = p.clips[i], next = p.clips[i + 1], g = gens[cl.genId];
    const v = el('video', { src: blobURL(g.blob), playsInline: true, preload: 'auto' }); v.crossOrigin = 'anonymous';
    await new Promise(r => { v.onloadeddata = r; v.onerror = r; setTimeout(r, 8000); }); v.currentTime = cl.in; await new Promise(r => { v.onseeked = r; setTimeout(r, 3000); });
    try { const s = ac.createMediaElementSource(v); const gn = ac.createGain(); gn.gain.value = p.clipVol; s.connect(gn); gn.connect(record ? dest : out); if (record) gn.connect(out); } catch (e) {}
    await v.play().catch(() => {});
    while (!ctl.stop) { const t = v.currentTime; c.fillStyle = '#000'; c.fillRect(0, 0, W, H); drawCover(c, v, W, H);
      let a = 0; if (cl.trans === 'fade' && t - cl.in < 0.4) a = 1 - (t - cl.in) / 0.4; if (next && next.trans === 'fade' && cl.out - t < 0.4) a = Math.max(a, 1 - (cl.out - t) / 0.4); if (!next && cl.out - t < 0.5) a = Math.max(a, 1 - (cl.out - t) / 0.5);
      if (a > 0) { c.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`; c.fillRect(0, 0, W, H); }
      tick(TL.starts[cl.id] + Math.max(0, t - cl.in));
      if (t >= cl.out || v.ended) break; await frame(); }
    v.pause(); v.removeAttribute('src'); v.load();
  }
  if (music) music.pause(); for (const au of live) au.pause(); playing = null;
  if (record) { await new Promise(r => { rec.onstop = r; rec.stop(); }); const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' }); const ext = /mp4/.test(blob.type) ? 'mp4' : 'webm';
    const thumb = await thumbFromVideo(blob); const id = uid(); const dur = p.clips.reduce((a, c) => a + c.out - c.in, 0) + (p.title ? 2 : 0);
    await db.put('gens', { id, t: Date.now(), mode: 'edit', kind: 'video', modelName: 'Montaje' + (p.title ? ': ' + p.title : ''), provider: 'edit', prompt: '', cost: 0, blob, thumb, dur, fav: true });
    if (!o.silent) download(blob, `montaje-${new Date().toISOString().slice(0, 10)}.${ext}`); import('./guide.js').then(m => m.guideEvent('montage')).catch(() => {}); toast('🎞 Montaje exportado', 4000, { sub: o.silent ? 'Guardado en la galería (⭐).' : 'Descargado y guardado en la galería (⭐).' }); ac.close().catch(() => {}); return { blob, id, dur }; }
  ac.close().catch(() => {});
}

// Para el MCP: exporta el montaje actual sin descargar (se guarda en la galería).
export async function montageInfo() { const p = await getProj(); const gens = Object.fromEntries((await loadGens()).map(g => [g.id, g])); const clips = p.clips.filter(c => gens[c.genId] && gens[c.genId].blob);
  return { title: p.title, aspect: p.aspect, duration: +(clips.reduce((a, c) => a + c.out - c.in, 0) + (p.title ? 2 : 0)).toFixed(1), clips: clips.map(c => ({ name: gens[c.genId].modelName, in: c.in, out: c.out, transition: c.trans })), audio_tracks: (p.tracks || []).length, subtitles: (p.subs || []).length, music: !!p.music }; }
export async function exportMontage() { if (location.hash !== '#edit') { location.hash = '#edit'; await new Promise(r => setTimeout(r, 700)); }
  const p = await getProj(); const gens = Object.fromEntries((await loadGens()).map(g => [g.id, g])); p.clips = p.clips.filter(c => gens[c.genId] && gens[c.genId].blob); p.tracks = p.tracks || []; p.subs = p.subs || [];
  if (!p.clips.length) throw new Error('El montaje está vacío'); const canvas = document.querySelector('.edcanvas'); if (!canvas) throw new Error('No encuentro el lienzo del montaje');
  const r = await run(p, gens, canvas, true, { silent: true }); if (!r) throw new Error('No se pudo exportar'); return r; }
