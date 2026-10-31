// 🧪 Laboratorio: estudio estilo Higgsfield con ~545 modelos (registro de Open Generative AI, MIT) vía Muapi.
import { el, btn, toast, modal, seg, toggle, getSettings, blobURL, db, vib, mediaKind } from './core.js';
import { registry, mediaFields, paramFields, KIND_OF, CAT_LABEL, CAMERA_MAP, LENS_MAP, APERTURE, cinemaPrompt } from './registry.js';
import { runJob, RUN, onJobs } from './runner.js';
import { pickFromGallery } from './gallery.js';
import { STYLES } from './catalog.js';

const TABS = {
  image: { icon: '🖼', label: 'Imagen', cats: [['t2i', 'Crear'], ['i2i', 'Editar']] },
  video: { icon: '🎬', label: 'Vídeo', cats: [['i2v', 'Desde imagen'], ['t2v', 'Desde texto']] },
  cine: { icon: '🎥', label: 'Cine', cats: [['t2i', 'Fotograma'], ['i2v', 'Animar']], cinema: true },
  v2v: { icon: '🛠', label: 'Vídeo→Vídeo', cats: [['v2v', 'Editar / herramientas']] },
  lip: { icon: '👄', label: 'Lip sync', cats: [['lip', 'Hablar']] },
  motion: { icon: '🕺', label: 'Movimiento', cats: [['motion', 'Motion control'], ['recast', 'Recast']] },
  audio: { icon: '🔊', label: 'Audio', cats: [['audio', 'Voz, música y sonido']] },
};
const saved = (() => { try { return JSON.parse(localStorage.getItem('lab_state') || '{}'); } catch (e) { return {}; } })();
const L = { tab: saved.tab || 'video', cat: saved.cat || {}, model: saved.model || {}, vals: {}, media: {}, prompt: saved.prompt || '', count: 1, cine: saved.cine || { camera: 'Cine digital full-frame', lens: 'Anamórfico clásico', focal: 35, aperture: 'f/1.4', move: '' }, style: null };
const persist = () => { try { localStorage.setItem('lab_state', JSON.stringify({ tab: L.tab, cat: L.cat, model: L.model, prompt: L.prompt, cine: L.cine })); } catch (e) {} };
let root = null, REG = [], resBox = null;
const curCat = () => L.cat[L.tab] || TABS[L.tab].cats[0][0];
const modelsOf = c => REG.filter(r => r.c === c);
const curModel = () => { const c = curCat(); const id = L.model[L.tab + ':' + c]; return REG.find(r => r.c === c && r.id === id) || defaultModel(c); };
const PREF = { t2i: ['nano-banana', 'flux'], i2i: ['nano-banana', 'flux-kontext'], t2v: ['seedance', 'kling-v3', 'veo'], i2v: ['kling-v3', 'seedance-2', 'veo'], v2v: ['kling-o1-video-edit', 'runway-aleph', 'mmaudio'], lip: ['infinitetalk', 'sync-lipsync'], audio: ['elevenlabs-tts', 'lyria', 'mmaudio'], motion: ['seedance-2.5-motion'], recast: ['kling-v3.0-pro-recast'] };
function defaultModel(c) { const ms = modelsOf(c); for (const p of PREF[c] || []) { const m = ms.find(r => r.id.includes(p)); if (m) return m; } return ms[0]; }

export async function renderLab(r) {
  root = r; r.innerHTML = ''; REG = await registry(); const s = getSettings();
  if (!s.keys.muapi) r.append(el('section', { class: 'card hero' }, el('div', { class: 'badge prem' }, 'PREMIUM'), el('h2', {}, 'Más de 500 modelos con una sola clave'),
    el('p', { class: 'note' }, 'El Laboratorio usa Muapi: imagen, vídeo, efectos, lip sync, voces, música y efectos de sonido de Kling, Veo, Seedance, Runway, ElevenLabs, Suno y muchos más. Pagas por uso.'),
    el('div', { class: 'row-btns' }, el('a', { class: 'b on', href: 'https://muapi.ai', target: '_blank' }, 'Conseguir clave de Muapi ↗'), el('a', { class: 'b', href: '#settings' }, 'Pegarla en Ajustes'))));
  r.append(el('div', { class: 'labtabs' }, Object.entries(TABS).map(([k, t]) => el('button', { type: 'button', class: 'ltab' + (L.tab === k ? ' on' : ''), on: { click: () => { L.tab = k; L.media = {}; L.vals = {}; persist(); renderLab(r); vib(5); } } }, el('i', {}, t.icon), t.label))));
  const T = TABS[L.tab]; const c = curCat(); const m = curModel();
  const wrap = el('div', { class: 'studio' }); r.append(wrap); const A = el('div', { class: 'col' }), B = el('div', { class: 'col' }); wrap.append(A, B);
  if (T.cats.length > 1) A.append(el('section', { class: 'card tight' }, seg(T.cats, () => c, v => { L.cat[L.tab] = v; L.media = {}; L.vals = {}; persist(); renderLab(r); })));
  // Modelo
  A.append(el('section', { class: 'card' }, el('h3', {}, 'Modelo'), m ? el('button', { type: 'button', class: 'modelpick', on: { click: () => pickModel(c) } }, el('div', {}, el('b', {}, m.n), el('small', {}, [m.pv, m.f].filter(Boolean).join(' · ')), m.d ? el('small', { class: 'mnote' }, m.d) : null), el('span', {}, '⌄')) : el('div', { class: 'empty' }, 'No hay modelos en esta categoría.'),
    el('small', { class: 'note' }, `${modelsOf(c).length} modelos en ${CAT_LABEL[c]}`)));
  if (!m) return;
  // Entradas multimedia
  const mf = mediaFields(m);
  if (mf.length) { const g = el('div', { class: 'slots' }); for (const f of mf) g.append(mediaSlot(f)); A.append(el('section', { class: 'card' }, el('h3', {}, 'Entradas'), g)); }
  // Prompt
  if (m.p || c === 'audio') { const ta = el('textarea', { class: 'txt', rows: 5, placeholder: c === 'audio' ? 'Texto a decir, descripción de la música o del sonido…' : 'Describe lo que quieres…' }); ta.value = L.prompt; ta.addEventListener('input', () => { L.prompt = ta.value; persist(); });
    A.append(el('section', { class: 'card' }, el('h3', {}, m.pr ? 'Prompt *' : 'Prompt'), ta, c === 'audio' || c === 'lip' ? null : el('div', {}, el('div', { class: 'lbl' }, 'Estilo rápido'), el('div', { class: 'chips' }, STYLES.slice(0, 8).map(([k, l, txt]) => btn(l, () => { L.style = L.style === k ? null : k; renderLab(r); }, 'chip' + (L.style === k ? ' on' : ''))))))); }
  // Cine
  if (T.cinema) B.append(cineCard());
  // Parámetros
  const pf = paramFields(m); if (pf.length) { const box = el('div', { class: 'params' }); for (const [n, o] of pf) box.append(paramCtl(n, o)); B.append(el('section', { class: 'card' }, el('h3', {}, 'Parámetros'), box)); }
  B.append(el('section', { class: 'card' }, el('h3', {}, 'Cantidad'), seg([[1, '1'], [2, '2'], [3, '3'], [4, '4']], () => L.count, v => L.count = v)));
  r.append(el('div', { class: 'gofoot' }, el('div', { class: 'cost' }, el('b', {}, m.n), el('small', {}, 'Precio según Muapi · se registra en tu historial')), btn('Generar ▶', () => go(m), 'go')));
  resBox = el('div', { class: 'labres' }); r.append(resBox); renderResults();
}
function mediaSlot(f) {
  const key = f.name; const multi = /s$/.test(f.m); const kind = f.m.replace(/s$/, ''); const items = L.media[key] || [];
  const c = el('div', { class: 'slot' + (items.length ? ' full' : '') }); c.append(el('div', { class: 'sl' }, `${{ image: 'Imagen', video: 'Vídeo', audio: 'Audio' }[kind]}${multi ? 'es' : ''} · ${f.name}${multi && f.max ? ` (máx. ${f.max})` : ''}`));
  if (items.length) { const pv = el('div', { class: 'thumbs' }); items.forEach((b, i) => pv.append(el('div', { class: 'th' }, kind === 'video' ? el('video', { src: blobURL(b), muted: true, autoplay: true, loop: true, playsInline: true }) : kind === 'audio' ? el('audio', { src: blobURL(b), controls: true }) : el('img', { src: blobURL(b), alt: '' }), btn('✕', () => { items.splice(i, 1); L.media[key] = items; renderLab(root); }, 'x')))); c.append(pv); }
  const add = b => { const arr = multi ? [...items, b].slice(0, f.max || 14) : [b]; L.media[key] = arr; renderLab(root); };
  const file = el('input', { type: 'file', accept: kind + '/*', multiple: multi, hidden: true, on: { change: e => { for (const x of e.target.files) add(x); } } });
  c.append(file, el('div', { class: 'sbtns' }, btn('📁 Subir', () => file.click(), 'mini-b'), btn('🖼 Galería', async () => { const g = await pickFromGallery(kind); if (g) add(g.blob); }, 'mini-b'),
    kind === 'video' ? btn('🎬 Plató', async () => { const takes = (await db.all('inbox')).sort((a, b) => b.t - a.t); const t = takes[0]; const v = t && t.files.find(x => mediaKind(x.name) === 'video'); if (v) add(v.blob); else toast('No hay tomas del plató todavía'); }, 'mini-b') : null));
  return c;
}
function paramCtl(n, o) {
  const label = o.ti || n.replace(/_/g, ' '); const get = () => L.vals[n] !== undefined ? L.vals[n] : o.d; const set = v => { L.vals[n] = v; };
  const box = el('div', { class: 'param' }, el('label', {}, label));
  if (o.e) { const ev = o.e.map(v => v && typeof v === 'object' ? [v.value, String(v.label ?? v.value)] : [v, String(v)]);
    if (ev.length <= 5) box.append(seg(ev, get, set)); else { const s = el('select', { class: 'txt', on: { change: e => { const v = ev.find(x => String(x[0]) === e.target.value); set(v ? v[0] : e.target.value); } } }, ev.map(([v, l]) => el('option', { value: String(v), selected: String(v) === String(get()) }, l))); box.append(s); } }
  else if (o.t === 'boolean') box.append(toggle(get() ? 'Sí' : 'No', () => !!get(), v => set(v)));
  else if (['int', 'integer', 'number', 'float'].includes(o.t)) { if (o.min !== undefined && o.max !== undefined) { const isInt = o.t !== 'number' && o.t !== 'float'; const val = el('span', { class: 'val' }, String(get() ?? o.min)); const inp = el('input', { type: 'range', min: o.min, max: o.max, step: isInt ? 1 : (o.max - o.min) / 100, value: get() ?? o.min, on: { input: e => { const v = isInt ? parseInt(e.target.value) : +e.target.value; set(v); val.textContent = v; } } }); box.append(el('div', { class: 'rowr' }, inp, val)); }
    else box.append(el('input', { class: 'txt sm', type: 'number', value: get() ?? '', placeholder: o.ds || '', on: { input: e => set(e.target.value === '' ? undefined : +e.target.value) } })); }
  else if (o.t === 'array') box.append(el('input', { class: 'txt', placeholder: 'Valores separados por comas', on: { input: e => set(e.target.value.split(',').map(x => x.trim()).filter(Boolean)) } }));
  else box.append(el('input', { class: 'txt', value: get() ?? '', placeholder: o.ds || '', on: { input: e => set(e.target.value || undefined) } }));
  return box;
}
function cineCard() {
  const C = L.cine; const sel = (map, k) => el('select', { class: 'txt', on: { change: e => { C[k] = e.target.value; persist(); } } }, Object.keys(map).map(x => el('option', { value: x, selected: C[k] === x }, x)));
  return el('section', { class: 'card' }, el('h3', {}, 'Cámara de cine'), el('div', { class: 'grid2' }, el('label', { class: 'mini' }, 'Cámara', sel(CAMERA_MAP, 'camera')), el('label', { class: 'mini' }, 'Óptica', sel(LENS_MAP, 'lens'))),
    el('div', { class: 'lbl' }, 'Focal'), seg([[14, '14'], [24, '24'], [35, '35'], [50, '50'], [85, '85'], [135, '135']], () => C.focal, v => { C.focal = v; persist(); }),
    el('div', { class: 'lbl' }, 'Diafragma'), seg(Object.keys(APERTURE).map(a => [a, a]), () => C.aperture, v => { C.aperture = v; persist(); }),
    el('div', { class: 'lbl' }, 'Movimiento'), seg([['', 'Fija'], ['slow dolly in', 'Dolly in'], ['smooth tracking shot', 'Travelling'], ['crane shot rising', 'Grúa'], ['handheld camera', 'En mano'], ['slow orbit around the subject', 'Órbita']], () => C.move, v => { C.move = v; persist(); }));
}
function pickModel(c) {
  const ms = modelsOf(c); const body = el('div', {}); const q = el('input', { class: 'txt', placeholder: `Buscar entre ${ms.length} modelos…` }); const list = el('div', { class: 'mlist' }); let close;
  const draw = () => { list.innerHTML = ''; const t = q.value.toLowerCase(); const fams = {}; for (const m of ms) { if (t && !(m.n + ' ' + m.f + ' ' + (m.pv || '') + ' ' + (m.d || '')).toLowerCase().includes(t)) continue; (fams[m.f || 'otros'] = fams[m.f || 'otros'] || []).push(m); }
    for (const [f, arr] of Object.entries(fams)) { list.append(el('div', { class: 'lbl' }, f)); for (const m of arr) list.append(el('button', { type: 'button', class: 'mrow', on: { click: () => { L.model[L.tab + ':' + c] = m.id; L.vals = {}; persist(); close(); renderLab(root); } } }, el('b', {}, m.n), el('small', {}, [m.pv, m.d].filter(Boolean).join(' · ').slice(0, 120)))); } };
  q.addEventListener('input', draw); body.append(q, list); draw(); close = modal(CAT_LABEL[c], body, { wide: true }); setTimeout(() => q.focus(), 50);
}
function go(m) {
  const c = m.c; const mf = mediaFields(m); const input = { ...(m.fx || {}) };
  for (const [n, o] of paramFields(m)) { const v = L.vals[n] !== undefined ? L.vals[n] : o.d; if (v !== undefined && v !== '') input[n] = v; }
  let prompt = L.prompt.trim(); const st = STYLES.find(x => x[0] === L.style); if (st) prompt += (prompt ? '. ' : '') + st[2]; if (TABS[L.tab].cinema) prompt += (prompt ? '. ' : '') + cinemaPrompt(L.cine);
  if ((m.p || c === 'audio') && prompt) input.prompt = prompt; if (m.pr && !prompt) { toast('Este modelo necesita un prompt'); return; }
  for (const f of mf) { const items = L.media[f.name] || []; if (!items.length) continue; input[f.name] = /s$/.test(f.m) ? items : items[0]; }
  const missing = mf.filter(f => !L.media[f.name] || !L.media[f.name].length).filter(f => (m.rq || []).includes(f.name) || f.name === m.vid || (f.name === m.img && !/optional/.test(f.name) && ['i2v', 'i2i', 'lip', 'recast'].includes(c)) || f.name === m.aud);
  if (missing.length) { toast('Faltan entradas: ' + missing.map(f => f.name).join(', ')); return; }
  for (let i = 0; i < L.count; i++) { const inp = { ...input }; if (L.count > 1 && m.i && m.i.seed) inp.seed = Math.floor(Math.random() * 1e9);
    runJob({ provider: 'muapi', endpoint: m.e, name: m.n, input: inp, kind: KIND_OF[c], mode: 'lab-' + c, label: (prompt || m.n).slice(0, 60), meta: { tab: L.tab } }); }
  vib(15); toast(`🚀 ${L.count} en marcha`, 2200, { sub: 'Sigue el progreso en la cola (abajo a la derecha).' });
}
function renderResults() {
  if (!resBox) return; resBox.innerHTML = ''; const js = RUN.jobs.filter(j => j.meta && j.meta.tab === L.tab).slice(0, 12); if (!js.length) return;
  resBox.append(el('h3', {}, 'Resultados'));
  const g = el('div', { class: 'ggrid' }); for (const j of js) { const gn = j.gen; g.append(el('div', { class: 'gitem' + (gn ? '' : ' wait') }, gn ? (gn.kind === 'video' ? el('video', { src: gn.blob ? blobURL(gn.blob) : gn.url, controls: true, playsInline: true, loop: true, muted: true }) : gn.kind === 'audio' ? el('audio', { src: gn.blob ? blobURL(gn.blob) : gn.url, controls: true }) : el('img', { src: gn.blob ? blobURL(gn.blob) : gn.url, alt: '' })) : el('div', { class: 'ph' }, j.phase === 'error' ? '⚠️' : '⏳'),
    el('div', { class: 'gm' }, el('b', {}, j.name), el('small', {}, j.error || j.phase)))); }
  resBox.append(g);
}
onJobs(() => { if (root && location.hash === '#lab') renderResults(); });
