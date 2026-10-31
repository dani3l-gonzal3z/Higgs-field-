// ✨ Estudio: generación con tus claves, varios modelos en paralelo, control de gasto.
import { $, el, btn, toast, modal, confirmBox, seg, toggle, uid, db, emit, bus, getSettings, money, spentThisMonth, mediaKind, videoMeta, thumbFromVideo, blobURL, fmtTime, vib, hasAnyKey, download } from './core.js';
import { MODES, STYLES } from './catalog.js';
import { PROVIDERS, catalog, buildInput, estimate, readiness, uploadFor, findMedia, fetchBlob, ProviderError } from './providers.js';
import { pickFromGallery } from './gallery.js';
import { loadChars } from './chars.js';
import { llmJSON, llmReady } from './llm.js';
import { addToEdit } from './editor.js';

const SLOTS = { video: { label: 'Vídeo de referencia', kind: 'video' }, image: { label: 'Imagen', kind: 'image' }, end_image: { label: 'Imagen final (opcional)', kind: 'image' }, control: { label: 'Vídeo de profundidad (opcional)', kind: 'video' } };
const MODE_SLOTS = { v2v: ['video', 'image', 'control'], i2v: ['image', 'end_image'], t2v: [], t2i: [], i2i: ['image'] };
const REQUIRED = { v2v: ['video'], i2v: ['image'], i2i: ['image'], t2v: [], t2i: [] };
const saved = (() => { try { return JSON.parse(localStorage.getItem('studio_form') || '{}'); } catch (e) { return {}; } })();
export const ST = { mode: saved.mode || 'v2v', inputs: {}, prompt: saved.prompt || '', negative: saved.negative || '', style: saved.style || null, duration: saved.duration || 5, aspect: saved.aspect || '16:9', resolution: saved.resolution || '720p', audio: !!saved.audio, seed: '', variants: 1, models: new Set(saved.models || []), chars: new Set(), jobs: [], takeMeta: null };
const persist = () => { try { localStorage.setItem('studio_form', JSON.stringify({ mode: ST.mode, prompt: ST.prompt, negative: ST.negative, style: ST.style, duration: ST.duration, aspect: ST.aspect, resolution: ST.resolution, audio: ST.audio, models: [...ST.models] })); } catch (e) {} };
let root = null, jobsBox = null, footBox = null;

export async function setInput(slot, blob, label, src = 'upload') { const it = { blob, label: label || blob.name || slot, src }; if (SLOTS[slot].kind === 'video') it.meta = await videoMeta(blob); ST.inputs[slot] = it; rerender(); }
export async function loadTake(take) {
  const f = n => take.files.find(x => n.test(x.name));
  const color = f(/color\.(mp4|webm)$/) || take.files.find(x => mediaKind(x.name) === 'video'); const depth = f(/depth\.(mp4|webm)$/); const frame = f(/\.png$/);
  if (color) { await setInput('video', color.blob, 'Toma del plató (color)', 'inbox'); const it = ST.inputs.video; if (it && (!it.meta || !it.meta.duration) && take.meta && take.meta.duration) it.meta = { ...(it.meta || {}), duration: take.meta.duration }; } if (depth) await setInput('control', depth.blob, 'Profundidad', 'inbox'); if (frame) await setInput('image', frame.blob, 'Primer fotograma', 'inbox');
  const m = take.meta || {}; ST.takeMeta = m; if (m.aspect && ['16:9', '9:16', '1:1', '4:3', '2.39:1'].includes(m.aspect)) ST.aspect = m.aspect; if (m.duration) ST.duration = m.duration <= 6.5 ? 5 : m.duration <= 9 ? 8 : 10;
  if (m.prompt && !ST.prompt.trim()) ST.prompt = m.prompt.split(/\n\n(Negative|Negativo):/)[0];
  const neg = m.prompt && m.prompt.match(/\n\n(?:Negative|Negativo):\s*([\s\S]*)$/); if (neg && !ST.negative) ST.negative = neg[1].trim();
  if (color) ST.mode = 'v2v'; persist(); rerender(); toast('🎬 Toma cargada en el Estudio', 3000, { sub: 'Elige modelos y pulsa Generar.' });
}
function rerender() { if (root) renderStudio(root); }

function models() { return catalog().filter(m => m.mode === ST.mode); }
function videoSecs() { const v = ST.inputs.video; const d = v && v.meta && v.meta.duration; return d && isFinite(d) ? Math.min(d, 30) : null; }
function selected() { return models().filter(m => ST.models.has(m.id) && readiness(m).ok); }
function totalEst() { return selected().reduce((a, m) => a + (estimate(m, ST, videoSecs()) || 0) * ST.variants, 0); }

export function renderStudio(r) {
  root = r; r.innerHTML = ''; const s = getSettings();
  if (!hasAnyKey(s)) r.append(onboarding());
  const wrap = el('div', { class: 'studio' }); r.append(wrap);
  const colA = el('div', { class: 'col' }), colB = el('div', { class: 'col' }); wrap.append(colA, colB);
  // Modo
  colA.append(card('Qué quieres generar', el('div', { class: 'modes' }, Object.entries(MODES).map(([k, v]) => el('button', { type: 'button', class: 'mode' + (ST.mode === k ? ' on' : ''), on: { click: () => { ST.mode = k; persist(); rerender(); vib(5); } } }, el('i', {}, v.icon), el('b', {}, v.label)))), el('div', { class: 'note' }, MODES[ST.mode].desc)));
  // Entradas
  const slots = MODE_SLOTS[ST.mode]; if (slots.length) { const g = el('div', { class: 'slots' }); for (const k of slots) g.append(slotCard(k)); colA.append(card('Entradas', g, el('div', { class: 'row-btns' }, btn('🎬 Traer toma del plató', pickTake, 'b on')))); }
  // Prompt
  const ta = el('textarea', { class: 'txt', rows: 5, placeholder: ST.mode === 'v2v' ? 'Describe el look final: personajes, ropa, lugar, luz… (la acción y la cámara ya vienen en la toma)' : 'Describe el plano…' }); ta.value = ST.prompt; ta.addEventListener('input', () => { ST.prompt = ta.value; persist(); });
  const neg = el('input', { class: 'txt', placeholder: 'Negativo (opcional): mannequins, morphing, flicker…' }); neg.value = ST.negative; neg.addEventListener('input', () => { ST.negative = neg.value; persist(); });
  const styles = el('div', { class: 'chips' }, STYLES.map(([k, l]) => { const b = btn(l, () => { ST.style = ST.style === k ? null : k; persist(); rerender(); }, 'chip' + (ST.style === k ? ' on' : '')); return b; }));
  colA.append(card('Prompt', ta, el('div', { class: 'gap' }), neg, el('div', { class: 'gap' }), el('div', { class: 'lbl' }, 'Estilo'), styles,
    el('div', { class: 'row-btns' }, btn(llmReady() ? '✨ Mejorar con IA' : '✨ Mejorar (configura IA)', improvePrompt), charChips())));
  // Ajustes
  const kind = ['t2i', 'i2i'].includes(ST.mode) ? 'image' : 'video';
  colB.append(card('Ajustes', kind === 'video' ? el('div', {}, lbl('Duración'), seg([[5, '5 s'], [8, '8 s'], [10, '10 s']], () => ST.duration, v => { ST.duration = v; persist(); updFoot(); })) : null,
    lbl('Formato'), seg([['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1'], ['4:3', '4:3'], ['2.39:1', '2.39']], () => ST.aspect, v => { ST.aspect = v; persist(); }),
    kind === 'video' ? el('div', {}, lbl('Resolución'), seg([['480p', '480p'], ['720p', '720p'], ['1080p', '1080p']], () => ST.resolution, v => { ST.resolution = v; persist(); })) : null,
    el('div', { class: 'row2' }, kind === 'video' ? toggle('🔊 Audio', () => ST.audio, v => { ST.audio = v; persist(); }) : null, el('label', { class: 'mini' }, 'Semilla', el('input', { class: 'txt sm', inputmode: 'numeric', placeholder: 'aleatoria', value: ST.seed, on: { input: e => ST.seed = e.target.value } }))),
    lbl('Variantes por modelo'), seg([[1, '1'], [2, '2'], [3, '3'], [4, '4']], () => ST.variants, v => { ST.variants = v; updFoot(); })));
  // Modelos
  const list = el('div', { class: 'models' }); const ms = models();
  if (!ms.length) list.append(el('div', { class: 'empty' }, 'No hay modelos para este modo en tu catálogo. Añádelos en Ajustes → Catálogo.'));
  for (const m of ms) { const rd = readiness(m, s); const on = ST.models.has(m.id); const est = estimate(m, ST, videoSecs());
    list.append(el('button', { type: 'button', class: 'model' + (on ? ' on' : '') + (rd.ok ? '' : ' off'), on: { click: () => { if (!rd.ok) { toast(rd.why, 3000, { action: { label: 'Ir a Ajustes', fn: () => location.hash = '#settings' } }); return; } on ? ST.models.delete(m.id) : ST.models.add(m.id); persist(); rerender(); vib(5); } } },
      el('span', { class: 'ck' }, on ? '✓' : ''), el('div', { class: 'mi' }, el('b', {}, m.name, m.verified ? '' : el('span', { class: 'warn', title: 'Parámetros sin verificar' }, ' ⚠')), el('small', {}, `${PROVIDERS[m.provider].name} · ${m.price ? `$${m.price.usd}/${m.price.per === 's' ? 's' : m.price.per === 'img' ? 'img' : 'gen'}` : 'precio ?'}${rd.ok ? '' : ' · ' + rd.why}`), m.note ? el('small', { class: 'mnote' }, m.note) : null),
      el('span', { class: 'est' }, est != null ? '≈' + money(est * ST.variants).split(' ')[0] : '')));
  }
  colB.append(card('Modelos (elige uno o varios para comparar)', list));
  // Pie con coste y botón
  footBox = el('div', { class: 'gofoot' }); r.append(footBox); updFoot();
  // Trabajos
  jobsBox = el('div', { class: 'jobs' }); r.append(jobsBox); renderJobs();
}
const card = (title, ...kids) => el('section', { class: 'card' }, el('h3', {}, title), ...kids);
const lbl = t => el('div', { class: 'lbl' }, t);
function charChips() { const box = el('span', { class: 'charpick' }); loadChars().then(cs => { if (!cs.length) return; box.append(el('span', { class: 'lbl inline' }, 'Personajes:')); for (const c of cs) box.append(btn((ST.chars.has(c.id) ? '✓ ' : '') + c.name, () => { ST.chars.has(c.id) ? ST.chars.delete(c.id) : ST.chars.add(c.id); rerender(); }, 'chip' + (ST.chars.has(c.id) ? ' on' : ''))); }); return box; }
async function updFoot() { if (!footBox) return; const s = getSettings(); const est = totalEst(); const spent = await spentThisMonth(); const n = selected().length * ST.variants; footBox.innerHTML = '';
  const over = spent + est > s.budget.monthly;
  footBox.append(el('div', { class: 'cost' }, el('b', {}, n ? `${n} ${n > 1 ? 'generaciones' : 'generación'} · ≈ ${money(est)}` : 'Elige al menos un modelo'), el('small', { class: over ? 'bad' : '' }, `Este mes: ${money(spent).split(' ')[0]} de $${s.budget.monthly}${over ? ' · superarías tu presupuesto' : ''}`)),
    btn('Generar ▶', generate, 'go' + (n ? '' : ' dis'))); }

function slotCard(k) {
  const it = ST.inputs[k]; const sl = SLOTS[k]; const c = el('div', { class: 'slot' + (it ? ' full' : '') + (REQUIRED[ST.mode].includes(k) ? ' req' : '') });
  c.append(el('div', { class: 'sl' }, sl.label + (REQUIRED[ST.mode].includes(k) ? ' *' : '')));
  if (it) { c.append(sl.kind === 'video' ? el('video', { src: blobURL(it.blob), muted: true, autoplay: true, loop: true, playsInline: true }) : el('img', { src: blobURL(it.blob), alt: '' }), el('div', { class: 'sm' }, it.label + (it.meta && it.meta.duration ? ` · ${it.meta.duration.toFixed(1)} s` : '')), btn('✕', () => { delete ST.inputs[k]; rerender(); }, 'x')); }
  const file = el('input', { type: 'file', accept: sl.kind + '/*', hidden: true, on: { change: e => { const f = e.target.files[0]; if (f) setInput(k, f, f.name); } } });
  c.append(file, el('div', { class: 'sbtns' }, btn('📁 Subir', () => file.click(), 'mini-b'), btn('🖼 Galería', async () => { const g = await pickFromGallery(sl.kind); if (g) setInput(k, g.blob, g.modelName ? `${g.modelName} · galería` : 'Galería', 'gallery'); }, 'mini-b')));
  return c;
}
async function pickTake() {
  const takes = (await db.all('inbox')).sort((a, b) => b.t - a.t);
  if (!takes.length) { toast('Aún no hay tomas', 3500, { sub: 'En el Plató: Toma → 📦 Paquete IA → «✨ Enviar al Estudio».', action: { label: 'Ir al Plató', fn: () => location.hash = '#plato' } }); return; }
  const body = el('div', { class: 'picklist' }); let close;
  for (const t of takes) { const fr = t.files.find(f => /\.png$/.test(f.name)); const vid = t.files.find(f => mediaKind(f.name) === 'video');
    body.append(el('button', { type: 'button', class: 'pick', on: { click: () => { close(); loadTake(t); } } }, fr ? el('img', { src: blobURL(fr.blob), alt: '' }) : vid ? el('video', { src: blobURL(vid.blob), muted: true }) : el('div', { class: 'ph' }, '🎬'),
      el('div', {}, el('b', {}, t.meta && t.meta.title || 'Toma'), el('small', {}, new Date(t.t).toLocaleString('es-ES'), ` · ${t.files.length} archivos${t.meta && t.meta.duration ? ' · ' + t.meta.duration.toFixed(1) + ' s' : ''}`)),
      btn('🗑', async e => { e.stopPropagation(); await db.del('inbox', t.id); close(); pickTake(); }, 'x'))); }
  close = modal('Tomas enviadas desde el plató', body);
}
async function improvePrompt() {
  if (!llmReady()) { toast('Configura una clave de IA (Anthropic u OpenRouter)', 3500, { action: { label: 'Ajustes', fn: () => location.hash = '#settings' } }); return; }
  const st = STYLES.find(x => x[0] === ST.style); toast('✨ Mejorando el prompt…', 8000);
  try { const r = await llmJSON(`You write prompts for AI video/image generators (Kling, Veo, Seedance, Luma, Wan, FLUX). Mode: ${MODES[ST.mode].label}. ${ST.mode === 'v2v' ? 'The input video is a rough 3D previz with grey mannequins and simple shapes: keep its exact motion, timing and camera move, and describe the real final look.' : ''}
Improve this prompt into ONE vivid, concrete prompt (60-120 words) in the same language as the user's text, adding wardrobe, setting, light, lens and mood consistent with it. Style: ${st ? st[2] : 'as implied'}. Also return a short negative prompt. JSON only: {"prompt":"...","negative":"..."}
USER PROMPT: ${ST.prompt || '(empty)'}
SCENE INFO: ${JSON.stringify(ST.takeMeta || {})}`);
    if (r.prompt) { ST.prompt = r.prompt; if (r.negative) ST.negative = r.negative; persist(); rerender(); toast('✨ Prompt mejorado'); } } catch (e) { toast('No se pudo mejorar: ' + e.message, 4000); }
}
async function composePrompt() {
  let p = ST.prompt.trim(); const st = STYLES.find(x => x[0] === ST.style); if (st) p += (p ? '. ' : '') + st[2];
  const cs = (await loadChars()).filter(c => ST.chars.has(c.id) && c.desc); if (cs.length) p += '. Characters: ' + cs.map(c => `${c.name}: ${c.desc}`).join('; ');
  return p;
}

async function generate() {
  const ms = selected(); if (!ms.length) { toast('Elige al menos un modelo listo'); return; }
  for (const k of REQUIRED[ST.mode]) if (!ST.inputs[k]) { toast(`Falta: ${SLOTS[k].label}`); return; }
  if (!ST.prompt.trim() && !ST.style) { toast('Escribe un prompt o elige un estilo'); return; }
  const s = getSettings(); const est = totalEst(); const spent = await spentThisMonth();
  if (spent + est > s.budget.monthly) { if (!await confirmBox('Superas tu presupuesto', `Llevas ${money(spent)} este mes y esto costaría ≈ ${money(est)}. Tu tope es $${s.budget.monthly}.`, 'Generar igualmente')) return; }
  else if (est >= s.budget.confirmAbove) { if (!await confirmBox('¿Generar?', `Coste estimado ≈ ${money(est)} (${ms.length * ST.variants} generaciones). El precio real lo marca el proveedor.`, 'Generar')) return; }
  const prompt = await composePrompt(); const params = { prompt, negative: ST.negative, duration: ST.duration, aspect: ST.aspect, resolution: ST.resolution, audio: ST.audio, seed: ST.seed };
  const uploads = new Map(); const chars = (await loadChars()).filter(c => ST.chars.has(c.id) && c.images && c.images.length);
  const getUrls = async (m) => { const urls = {}; const f = m.fields || {};
    for (const k of ['video', 'image', 'end_image', 'control']) { const it = ST.inputs[k]; if (!it || !f[k]) continue; const key = m.provider + ':' + k; if (!uploads.has(key)) uploads.set(key, uploadFor(m.provider, it.blob, `${k}-${Date.now()}.${mediaKind(it.blob) === 'video' ? 'mp4' : 'png'}`)); urls[k] = await uploads.get(key); }
    if (f.refs && chars.length) { const key = m.provider + ':refs'; if (!uploads.has(key)) uploads.set(key, Promise.all(chars.slice(0, 4).map((c, i) => uploadFor(m.provider, c.images[0], `ref-${i}.png`)))); urls.refs = await uploads.get(key); }
    return urls; };
  const kind = ['t2i', 'i2i'].includes(ST.mode) ? 'image' : 'video';
  for (const m of ms) for (let v = 0; v < ST.variants; v++) {
    const job = { id: uid(), model: m, variant: v, phase: 'subiendo', t0: Date.now(), ctrl: new AbortController(), est: estimate(m, ST, videoSecs()), kind, params: { ...params, seed: params.seed !== '' ? params.seed : (ST.variants > 1 ? Math.floor(Math.random() * 1e9) : '') } };
    ST.jobs.unshift(job); runJob(job, getUrls);
  }
  renderJobs(); vib(15); toast(`🚀 ${ms.length * ST.variants} en marcha`, 2500, { sub: 'Puedes seguir trabajando; te aviso al terminar.' });
  jobsBox && jobsBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function runJob(job, getUrls) {
  const m = job.model; const p = PROVIDERS[m.provider];
  await db.put('ledger', { id: job.id, t: Date.now(), model: m.name, provider: m.provider, cost: job.est || 0, status: 'pending' });
  try {
    const urls = await getUrls(m); job.phase = 'en cola'; renderJobs();
    const input = buildInput(m, job.params, urls); job.input = input;
    const res = await p.run(m, input, { signal: job.ctrl.signal, onStatus: st => { job.phase = st.phase === 'running' ? 'generando' : st.phase === 'done' ? 'terminando' : 'en cola' + (st.pos != null ? ` (#${st.pos + 1})` : ''); if (st.log) job.log = st.log; if (st.cancel) job.cancel = st.cancel; renderJobs(); } });
    const url = findMedia(res, job.kind); if (!url) throw new ProviderError('El proveedor terminó pero no encuentro el archivo en la respuesta.', 0);
    job.phase = 'guardando'; renderJobs();
    const blob = await fetchBlob(url); let meta = {}, thumb = null;
    if (blob) { if (job.kind === 'video') { meta = await videoMeta(blob); thumb = await thumbFromVideo(blob); } else thumb = blob; }
    const gen = { id: job.id, t: Date.now(), mode: ST.mode, kind: job.kind, modelId: m.id, modelName: m.name, provider: m.provider, prompt: job.params.prompt, negative: job.params.negative, params: job.params, input: job.input, cost: job.est || 0, blob, url, thumb, dur: meta.duration || null, w: meta.w, h: meta.h, fav: false };
    await db.put('gens', gen); await db.put('ledger', { id: job.id, t: Date.now(), model: m.name, provider: m.provider, cost: job.est || 0, status: 'ok' });
    job.phase = 'listo'; job.gen = gen; emit('gens'); notify(`✅ ${m.name} listo`, blob ? '' : 'Guardado como enlace (el archivo no se pudo descargar).');
  } catch (e) {
    const cancelled = e.name === 'AbortError'; job.phase = cancelled ? 'cancelado' : 'error'; job.error = cancelled ? '' : (e.message || String(e));
    await db.put('ledger', { id: job.id, t: Date.now(), model: m.name, provider: m.provider, cost: 0, status: 'fail', error: job.error });
    if (!cancelled) notify(`⚠️ ${m.name}: error`, job.error);
  }
  job.t1 = Date.now(); renderJobs(); updFoot(); emit('ledger');
}
function notify(t, sub) { toast(t, 4000, { sub }); try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(t, { body: sub || '' }); } catch (e) {} }
let jobsTimer = 0;
function renderJobs() {
  if (!jobsBox) return; jobsBox.innerHTML = ''; if (!ST.jobs.length) return;
  jobsBox.append(el('h3', {}, 'Generaciones de esta sesión'), el('div', { class: 'row-btns' }, btn('Limpiar terminadas', () => { ST.jobs = ST.jobs.filter(j => !j.t1); renderJobs(); }, 'mini-b')));
  for (const j of ST.jobs) {
    const busy = !j.t1; const el2 = el('div', { class: 'job ' + (busy ? 'busy' : j.phase === 'listo' ? 'ok' : 'bad') });
    el2.append(el('div', { class: 'jh' }, el('b', {}, j.model.name + (j.variant ? ` #${j.variant + 1}` : '')), el('small', {}, PROVIDERS[j.model.provider].name), el('span', { class: 'ph' }, busy ? '⏳ ' + j.phase : j.phase === 'listo' ? '✅ listo' : j.phase === 'cancelado' ? '⏹ cancelado' : '⚠️ error'), el('small', { class: 'tm' }, fmtTime(((j.t1 || Date.now()) - j.t0) / 1000))));
    if (j.log && busy) el2.append(el('div', { class: 'log' }, j.log));
    if (j.error) el2.append(el('div', { class: 'err' }, j.error));
    if (busy) el2.append(el('div', { class: 'row-btns' }, btn('Cancelar', () => { j.cancel && j.cancel(); j.ctrl.abort(); }, 'mini-b')));
    if (j.gen) { const g = j.gen; const src = g.blob ? blobURL(g.blob) : g.url;
      el2.append(g.kind === 'video' ? el('video', { src, controls: true, playsInline: true, loop: true, muted: true, autoplay: true }) : el('img', { src, alt: '' }),
        el('div', { class: 'row-btns' }, btn('⭐', async () => { g.fav = !g.fav; await db.put('gens', g); toast(g.fav ? '⭐ Favorito' : 'Quitado de favoritos'); }, 'mini-b'),
          btn('♻ Usar como entrada', () => reuse(g), 'mini-b'), g.kind === 'video' ? btn('➕ Montaje', () => addToEdit(g), 'mini-b') : null,
          g.blob ? btn('⬇', () => download(g.blob, `${g.modelName.replace(/\W+/g, '_')}-${g.id.slice(0, 6)}.${g.kind === 'video' ? 'mp4' : 'png'}`), 'mini-b') : el('a', { href: g.url, target: '_blank', class: 'mini-b' }, 'Abrir'))); }
    jobsBox.append(el2);
  }
  clearInterval(jobsTimer); if (ST.jobs.some(j => !j.t1)) jobsTimer = setInterval(() => { for (const t of jobsBox.querySelectorAll('.job.busy .tm')) {} renderJobsTimes(); }, 1000);
}
function renderJobsTimes() { if (!jobsBox) return; const busy = ST.jobs.filter(j => !j.t1); const els = jobsBox.querySelectorAll('.job .tm'); ST.jobs.forEach((j, i) => { if (els[i]) els[i].textContent = fmtTime(((j.t1 || Date.now()) - j.t0) / 1000); }); if (!busy.length) clearInterval(jobsTimer); }
export function reuse(g) {
  if (!g.blob) { toast('Este resultado solo está como enlace; descárgalo primero'); return; }
  if (g.kind === 'image') { ST.mode = 'i2v'; setInput('image', g.blob, `${g.modelName} · galería`, 'gallery'); }
  else { ST.mode = 'v2v'; setInput('video', g.blob, `${g.modelName} · galería`, 'gallery'); }
  persist(); location.hash = '#studio'; toast('♻ Cargado como entrada');
}
function onboarding() {
  return el('section', { class: 'card hero' }, el('div', { class: 'badge prem' }, 'PREMIUM'), el('h2', {}, 'Conecta tu proveedor y paga solo lo que generes'),
    el('p', { class: 'note' }, 'Sin suscripciones: pones tu clave, cada vídeo se cobra en tu cuenta del proveedor y aquí ves cuánto llevas gastado. Las claves se guardan solo en este navegador.'),
    el('ol', { class: 'steps' }, el('li', {}, el('b', {}, 'fal.ai '), '(recomendado): crea una clave en ', el('a', { href: 'https://fal.ai/dashboard/keys', target: '_blank' }, 'fal.ai/dashboard/keys'), ' y añade saldo. Funciona sin nada más.'),
      el('li', {}, el('b', {}, 'Higgsfield, Muapi o Replicate: '), 'necesitan además el mini-proxy gratuito (5 min, instrucciones en Ajustes).'),
      el('li', {}, 'Pégala en ', el('a', { href: '#settings' }, 'Ajustes'), ' y vuelve aquí.')));
}
bus.addEventListener('studio:take', e => loadTake(e.detail));
addEventListener('studio:settings', () => { if (root && location.hash === '#studio') rerender(); });
