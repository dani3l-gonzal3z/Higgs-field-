// 🔌 Puente MCP: deja que cualquier IA (Claude, Cursor, ChatGPT con MCP…) maneje la app a través de mcp/server.mjs.
import { $, el, btn, toast, toggle, getSettings, saveSettings, db, host, money, spentThisMonth, confirmBox, mediaKind, videoMeta, thumbFromVideo, uid, emit, copyText } from './core.js';
import { catalog, loadExtraCatalog, readiness, buildInput, estimate } from './providers.js';
import { registry, KIND_OF } from './registry.js';
import { runJob, RUN } from './runner.js';
import { llmReady } from './llm.js';

const VERSION = '2.0';
export const MCP = { ws: null, state: 'off', url: '', calls: 0, last: '', timer: 0 };
const ls = new Set(); export const onMcp = f => { ls.add(f); return () => ls.delete(f); }; const changed = () => { for (const f of ls) f(); pill(); };
const cfg = () => ({ enabled: false, url: 'ws://localhost:7821/bridge', autoApprove: 0.5, ...(getSettings().mcp || {}) });

export function mcpUrl() {
  const q = new URLSearchParams(location.search).get('mcp');
  if (q != null) { const port = /^\d+$/.test(q) ? q : '7821'; const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.port === port; return local ? `ws://${location.host}/bridge` : `ws://localhost:${port}/bridge`; }
  const c = cfg(); return c.enabled ? c.url : null;
}
export function mcpStart() { const u = mcpUrl(); if (u) connect(u); }
export function mcpStop() { clearTimeout(MCP.timer); MCP.url = ''; if (MCP.ws) { try { MCP.ws.close(); } catch (e) {} } MCP.ws = null; MCP.state = 'off'; changed(); }
function connect(url) {
  if (host.claude) { MCP.state = 'claude'; changed(); return; }
  clearTimeout(MCP.timer); MCP.url = url; let ws; try { ws = new WebSocket(url); } catch (e) { MCP.state = 'error'; changed(); return; }
  MCP.ws = ws; MCP.state = 'connecting'; changed();
  ws.onopen = () => { MCP.state = 'on'; ws.send(JSON.stringify({ type: 'hello', app: 'plato-studio', version: VERSION })); changed(); if (!/[?&]base=1/.test(location.search)) toast('🔌 IA externa conectada (MCP)', 3000, { sub: 'Una IA puede manejar el plató y generar con tus claves. Lo que cueste por encima de tu límite te lo preguntaré.' }); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } if (m.type === 'call') onCall(ws, m); if (m.type === 'replaced') { MCP.url = ''; toast('🔌 Otra pestaña ha tomado el control del MCP'); } };
  ws.onclose = () => { if (MCP.ws !== ws) return; const was = MCP.state; MCP.ws = null; MCP.state = 'off'; changed(); if (was === 'on') toast('🔌 IA externa desconectada'); if (MCP.url === url) MCP.timer = setTimeout(() => connect(url), 3000); };
  ws.onerror = () => {};
}
async function onCall(ws, m) {
  MCP.calls++; MCP.last = m.method; changed(); flash(m.method);
  const send = o => { try { ws.send(JSON.stringify({ id: m.id, ...o })); } catch (e) { console.warn('MCP: no se pudo enviar', e); } };
  try { const fn = H[m.method]; if (!fn) throw new Error('Herramienta no disponible en esta versión de la app: ' + m.method); const result = await fn(m.params || {}); send({ type: 'result', result: await pack(result) }); }
  catch (e) { send({ type: 'result', error: e && e.message || String(e) }); }
}

/* ---------- Utilidades de medios ---------- */
const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(blob); });
const fromB64 = (b, mime) => fetch(`data:${mime || 'application/octet-stream'};base64,${b}`).then(r => r.blob());
async function jpeg(blob, max = 1024) { try { const bm = await createImageBitmap(blob); const s = Math.min(1, max / Math.max(bm.width, bm.height)); const c = document.createElement('canvas'); c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82)); } catch (e) { return blob; } }
const extOf = b => { const t = (b && b.type) || ''; return /mp4/.test(t) ? 'mp4' : /webm/.test(t) ? 'webm' : /png/.test(t) ? 'png' : /jpe?g/.test(t) ? 'jpg' : /wav/.test(t) ? 'wav' : /mpeg|mp3/.test(t) ? 'mp3' : 'bin'; };
async function pack(r) { if (!r || typeof r !== 'object') return r; const out = { ...r };
  if (r.files) out.files = await Promise.all(r.files.filter(f => f && f.blob).map(async f => ({ name: f.name || `archivo.${extOf(f.blob)}`, label: f.label, mime: f.blob.type, b64: await b64(f.blob) })));
  if (r.images) out.images = await Promise.all(r.images.filter(Boolean).map(async im => { const j = await jpeg(im.blob || im, im.max || 1024); return { mime: j.type || 'image/jpeg', b64: await b64(j) }; }));
  return out; }

/* ---------- El plató (iframe) ---------- */
let rseq = 0;
export function platoCall(method, params = {}, { show = true, timeout = 600000 } = {}) {
  const fr = document.getElementById('plato'); if (!fr) return Promise.reject(new Error('No encuentro el plató'));
  if (show && location.hash !== '#plato') location.hash = '#plato';
  return new Promise((res, rej) => { const id = 'p' + (++rseq); const to = setTimeout(() => { removeEventListener('message', on); rej(new Error('El plató no responde (¿pestaña en segundo plano?)')); }, timeout);
    const on = e => { if (e.origin !== location.origin || !e.data || e.data.type !== 'plato:rpc-result' || e.data.id !== id) return; clearTimeout(to); removeEventListener('message', on); e.data.error ? rej(new Error(e.data.error)) : res(e.data.result); };
    addEventListener('message', on); fr.contentWindow.postMessage({ type: 'plato:rpc', id, method, params }, location.origin); });
}
async function platoReady() { for (let i = 0; i < 12; i++) { try { return await platoCall('state', {}, { timeout: 2500 }); } catch (e) { await new Promise(r => setTimeout(r, 500)); } } throw new Error('El plató no ha arrancado'); }
async function view(camera) { const b = await platoCall('view', { camera }); return b; }

/* ---------- Referencias a medios: last_take[:cámara], gallery:<id>, archivos, URLs ---------- */
async function resolveRef(v, slot = 'video') {
  if (v == null || v === '') return null;
  if (v && typeof v === 'object' && v.__file) { const blob = await fromB64(v.__file.b64, v.__file.mime); const f = new File([blob], v.__file.name, { type: v.__file.mime }); return { blob: f, dur: mediaKind(f) === 'video' ? (await videoMeta(f)).duration : null }; }
  if (typeof v !== 'string') throw new Error('Referencia de medio no válida');
  if (/^https?:\/\//.test(v)) return { url: v };
  const mt = v.match(/^last_take(?::(.+))?$/); if (mt) {
    const takes = (await db.all('inbox')).sort((a, b) => b.t - a.t); const want = mt[1] ? String(mt[1]).toLowerCase() : null;
    const t = takes.find(x => !want || String((x.meta || {}).camera || '').toLowerCase() === want); if (!t) throw new Error(want ? `No hay toma grabada de la cámara ${mt[1]}` : 'No hay tomas grabadas: usa take_record primero');
    const f = re => (t.files.find(x => re.test(x.name)) || {}).blob; const blob = slot === 'image' || slot === 'end_image' ? f(/\.png$/) : slot === 'control' ? f(/depth\.(mp4|webm)$/) : f(/color\.(mp4|webm)$/) || f(/\.(mp4|webm)$/);
    if (!blob) throw new Error(`La última toma no tiene ${slot === 'control' ? 'pase de profundidad (graba con depth=true)' : slot}`); return { blob, dur: (t.meta || {}).duration || null }; }
  const mg = v.match(/^gallery:(.+)$/); if (mg) { const g = await db.get('gens', mg[1]); if (!g) throw new Error('No existe en la galería: ' + mg[1]); return { blob: g.blob || null, url: g.blob ? null : g.url, dur: g.dur || null }; }
  throw new Error('Referencia no reconocida: ' + v + ' (usa last_take, gallery:<id> o file:/ruta)');
}

/* ---------- Aprobación de gasto ---------- */
async function approve(est, label) {
  const s = getSettings(); const c = cfg(); const spent = await spentThisMonth();
  if (est != null && spent + est > s.budget.monthly) throw new Error(`Superaría tu presupuesto mensual (llevas $${spent.toFixed(2)} de $${s.budget.monthly}). Súbelo en Ajustes si quieres seguir.`);
  if (est != null && est <= (+c.autoApprove || 0)) return true;
  const ok = await Promise.race([confirmBox('🤖 La IA externa quiere generar', `${label} · ${est != null ? 'coste estimado ' + money(est) : 'precio desconocido (lo cobra el proveedor)'}. ¿Lo permites?`, 'Permitir'), new Promise(r => setTimeout(() => r(false), 120000))]);
  if (!ok) throw new Error('El usuario no lo ha aprobado en la app (o no respondió en 2 minutos).'); return true;
}

/* ---------- Herramientas ---------- */
const sceneLite = s => ({ entities: s.entities, env: s.env, camera: s.camera, rig: s.rig, take: { exists: s.take.exists, duration: s.take.duration, orders: s.take.orders } });
// Las mismas herramientas que usa una IA externa, para el asistente del móvil.
export async function runTool(name, args = {}) { if (!H[name]) throw new Error('Herramienta desconocida: ' + name); return await H[name](args); }
const H = {
  async studio_status() { const s = getSettings(); let st = null; try { st = await platoReady(); } catch (e) {}
    return { text: 'Plató Studio conectado.' + (host.claude ? ' (Vista previa dentro de Claude: no puede generar.)' : ''), app_version: VERSION, providers_with_key: Object.keys(s.keys).filter(k => s.keys[k]), llm_ready: llmReady(),
      budget: { monthly_usd: s.budget.monthly, spent_this_month_usd: +(await spentThisMonth()).toFixed(3), auto_approve_usd: +cfg().autoApprove }, video_model_suggestion: (catalog().find(m => m.mode === 'v2v' && readiness(m).ok) || {}).id || null,
      scene: st ? { entities: st.entities.length, place: st.env.place, take: st.take.exists ? `${st.take.duration} s, ${st.take.orders} órdenes` : 'sin toma', rig_cameras: st.rig.map(r => r.name) } : null }; },
  async scene_get() { await platoReady(); return await platoCall('state'); },
  async scene_command({ text }) { await platoReady(); const r = await platoCall('command', { text }); return { text: r.reply || 'Hecho', commands: r.commands, ...sceneLite(r) }; },
  async scene_dsl({ commands }) { await platoReady(); return sceneLite(await platoCall('dsl', { commands })); },
  async scene_view({ camera = 'main' }) { await platoReady(); const b = await view(camera); return { text: `Vista: ${camera}`, images: [b] }; },
  async stock_list() { await platoReady(); return await platoCall('stock', {}, { show: false }); },
  async stock_load_set({ set, cast }) { await platoReady(); const r = await platoCall('loadSet', { name: set, cast }); await new Promise(x => setTimeout(x, 400)); return { text: `Decorado «${set}» cargado.`, ...sceneLite(r), images: [await view('main')] }; },
  async camera_set(p) { await platoReady(); const c = await platoCall('camera', p); await new Promise(x => setTimeout(x, 900)); return { camera: c, images: [await view('main')] }; },
  async cameras_rig(p) { await platoReady(); const r = await platoCall('rig', p); const out = { rig: r.rig, viewing: r.viewing, monitor: r.monitor, cuts: r.cuts };
    if (['add', 'coverage'].includes(p.action) && r.rig.length) { await new Promise(x => setTimeout(x, 500)); out.images = [await view('all')]; } return out; },
  async take_control(p) { await platoReady(); return await platoCall('take', p); },
  async take_record({ cameras = 'main', program = false, depth = false, to_gallery = true }) {
    if (!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream)) throw new Error('Este navegador no puede grabar vídeo del lienzo');
    await platoReady(); const st = await platoCall('state'); if (!st.take.exists) throw new Error('No hay toma: da órdenes de acción con scene_dsl primero');
    const files = await platoCall('record', { cameras, program, depth }); const groups = {};
    for (const f of files) { const k = program ? 'Realización' : (f.cam || 'principal'); (groups[k] = groups[k] || []).push(f); }
    const saved = [];
    for (const [cam, fs] of Object.entries(groups)) { const take = { id: uid(), t: Date.now(), files: fs.map(f => ({ name: f.name, label: f.label, blob: f.blob })), meta: { title: `Toma MCP · ${cam}`, camera: cam, duration: st.take.duration, place: st.env.place, time: st.env.time, weather: st.env.weather, aspect: '16:9' } }; await db.put('inbox', take);
      if (to_gallery) { const v = fs.find(f => /color\.(mp4|webm)$/.test(f.name)); if (v) { const meta = await videoMeta(v.blob); const thumb = (fs.find(f => /\.png$/.test(f.name)) || {}).blob || await thumbFromVideo(v.blob); const id = uid();
        await db.put('gens', { id, t: Date.now(), mode: 'plato', kind: 'video', modelName: `Plató · ${cam}`, provider: 'edit', prompt: '', cost: 0, blob: v.blob, thumb, dur: meta.duration || st.take.duration, fav: false }); saved.push({ camera: cam, gallery_id: id, last_take_ref: program ? 'last_take' : `last_take:${cam}` }); } } }
    emit('gens'); const frames = files.filter(f => /\.png$/.test(f.name)).slice(0, 4).map(f => ({ blob: f.blob, max: 640 }));
    return { text: `Grabado: ${Object.keys(groups).join(', ')} (${st.take.duration} s). Para restyle con IA usa generate con inputs.video="last_take" o la referencia de cada cámara.`, recorded: saved, files: files.filter(f => /\.(mp4|webm)$/.test(f.name)), images: frames };
  },
  async models_search({ query = '', mode, limit = 15 }) { await loadExtraCatalog(); const s = getSettings(); const q = query.toLowerCase();
    let list = catalog().map(m => { const rd = readiness(m); return { id: m.id, name: m.name, provider: m.provider, mode: m.mode, price: m.price ? `$${m.price.usd}/${m.price.per === 's' ? 'segundo' : m.price.per}` : (m.provider === 'muapi' ? 'ver precio en Muapi' : 'desconocido'), ready: rd.ok, why_not: rd.ok ? undefined : rd.why, note: m.note || undefined }; });
    if (!mode || ['audio', 'lip', 'motion'].includes(mode)) { const reg = await registry(); list = list.concat(reg.filter(r => ['audio', 'lip', 'motion', 'recast'].includes(r.c)).map(r => ({ id: 'reg:' + r.id, name: r.n, provider: 'muapi', mode: r.c, price: 'ver precio en Muapi', ready: !!s.keys.muapi, inputs: [r.vid, r.img, r.aud].filter(Boolean).concat(Object.keys(r.i || {}).filter(k => !['prompt'].includes(k))).slice(0, 8) }))); }
    if (mode) list = list.filter(m => m.mode === mode); if (q) list = list.filter(m => (m.id + ' ' + m.name).toLowerCase().includes(q));
    list.sort((a, b) => (b.ready - a.ready) || (a.provider === 'muapi') - (b.provider === 'muapi')); return { total: list.length, models: list.slice(0, Math.min(60, +limit || 15)) }; },
  async generate({ model_id, prompt = '', inputs = {}, duration, aspect, resolution, extra = {} }) {
    if (host.claude) throw new Error('Dentro de Claude no se puede generar: abre Plató en tu ordenador (Plato.cmd) o la app local del servidor MCP.');
    await loadExtraCatalog(); let m = catalog().find(x => x.id === model_id), r = null;
    if (!m) { const reg = await registry(); const rid = String(model_id).replace(/^reg:/, ''); r = reg.find(x => x.id === rid || ('oga-' + x.c + '-' + x.id) === model_id); if (!r) throw new Error('Modelo desconocido: busca uno con models_search'); }
    const res = {}; for (const [k, v] of Object.entries(inputs || {})) res[k] = await resolveRef(v, k);
    const val = x => x ? (x.blob || x.url) : undefined; let job;
    if (m) { const rd = readiness(m); if (!rd.ok) throw new Error(rd.why); const vdur = res.video && res.video.dur;
      const params = { prompt, duration: duration || Math.round(vdur || 5), aspect: aspect || '16:9', resolution: resolution || '720p', audio: false, seed: '' };
      const input = { ...buildInput(m, params, { video: val(res.video), image: val(res.image), end_image: val(res.end_image), control: val(res.control) }), ...extra };
      const est = estimate(m, params, vdur); await approve(est, m.name); const kind = m.mode === 't2i' || m.mode === 'i2i' ? 'image' : 'video';
      job = runJob({ provider: m.provider, endpoint: m.endpoint, name: m.name, input, kind, est: est || 0, mode: 'mcp', label: '🤖 ' + (prompt || m.name).slice(0, 60), meta: { via: 'mcp' } }); }
    else { if (!getSettings().keys.muapi) throw new Error('Este modelo usa Muapi: añade la clave en Ajustes'); const input = { ...(r.fx || {}), ...extra }; if (prompt && (r.p || (r.i && r.i.prompt))) input.prompt = prompt;
      for (const [k, v] of Object.entries(res)) { const field = k === 'video' ? r.vid : k === 'image' ? r.img : k === 'audio' ? r.aud : k; if (field) input[field] = /list$/.test(field) ? [val(v)] : val(v); }
      await approve(null, r.n); job = runJob({ provider: 'muapi', endpoint: r.e, name: r.n, input, kind: KIND_OF[r.c] || 'video', est: 0, mode: 'mcp', label: '🤖 ' + (prompt || r.n).slice(0, 60), meta: { via: 'mcp' } }); }
    const g = await job.promise; const prev = g.kind === 'image' ? g.blob : g.thumb;
    return { text: `Listo con ${g.modelName}${g.cost ? ` · ≈ $${(+g.cost).toFixed(3)}` : ''}. En la galería como gallery:${g.id}.`, gallery_id: g.id, cost_usd: g.cost || 0, url: g.url || undefined, files: g.blob ? [{ name: `${g.modelName.replace(/\W+/g, '_')}-${g.id.slice(0, 6)}.${extOf(g.blob)}`, blob: g.blob }] : [], images: prev ? [{ blob: prev, max: 768 }] : [] };
  },
  async jobs_status() { return { jobs: RUN.jobs.slice(0, 30).map(j => ({ label: j.label, model: j.name, status: j.t1 ? (j.phase === 'listo' ? 'done' : j.phase) : j.phase, error: j.error, seconds: Math.round(((j.t1 || Date.now()) - j.t0) / 1000), gallery_id: j.gen ? j.gen.id : undefined })) }; },
  async gallery_list({ kind, limit = 20 }) { const gs = (await db.all('gens')).filter(g => !g.hidden && (!kind || g.kind === kind)).sort((a, b) => b.t - a.t).slice(0, Math.min(100, +limit || 20));
    return { items: gs.map(g => ({ id: g.id, kind: g.kind, model: g.modelName, prompt: (g.prompt || '').slice(0, 140) || undefined, created: new Date(g.t).toISOString(), seconds: g.dur ? +g.dur.toFixed(1) : undefined, cost_usd: g.cost || 0, favorite: !!g.fav })) }; },
  async gallery_get({ id }) { const g = await db.get('gens', id); if (!g) throw new Error('No existe: ' + id); if (!g.blob) return { text: 'Solo está como enlace', url: g.url };
    return { text: `${g.modelName} (${g.kind})`, files: [{ name: `${g.modelName.replace(/\W+/g, '_')}-${g.id.slice(0, 6)}.${extOf(g.blob)}`, blob: g.blob }], images: g.kind === 'image' ? [g.blob] : g.thumb ? [g.thumb] : [] }; },
  async director({ action, project_id, plan, idea, options, steps }) { const D = await import('./director.js');
    if (action === 'list') return await D.dirList(); if (action === 'get') return await D.dirGet(project_id);
    if (action === 'create') { if (!plan) throw new Error('Pasa "plan" con escenas y planos'); location.hash = '#director'; return await D.dirCreate({ plan, options, idea }); }
    if (action === 'plan') { location.hash = '#director'; return await D.dirPlan({ project_id, idea, options }); }
    if (action === 'run') return await D.dirRun({ project_id, steps }, approve);
    throw new Error('Acción desconocida: ' + action); },
  async book_load({ file }) { const r = await resolveRef(file); const D = await import('./director.js'); location.hash = '#director'; return await D.dirFromBook(r.blob); },
  async games({ action, id, code, note }) { const G = await import('./games.js');
    if (action === 'list') return { games: await G.gamesList() }; if (action === 'get') return await G.gamesGet(id); if (action === 'api') return { text: G.GAME_API };
    if (action === 'save') { const r = await G.gamesSave({ id, code, note }); return r.ok ? { text: `Juego «${r.title}» guardado y probado.`, ...r } : { text: 'La prueba automática ha encontrado fallos; corrígelos y vuelve a guardar.', ...r }; }
    if (action === 'play') { const r = await G.gamesPlay(id); return { text: 'Partida abierta en la tele.' + (r.phones ? ' Los móviles entran en ' + r.phones : ''), ...r }; }
    throw new Error('Acción desconocida: ' + action); },
  async montage({ action }) { const E = await import('./editor.js'); if (action === 'get') return await E.montageInfo();
    const r = await E.exportMontage(); return { text: `Montaje exportado (${r.dur.toFixed(1)} s) y guardado en la galería como gallery:${r.id}.`, gallery_id: r.id, files: [{ name: `montaje.${extOf(r.blob)}`, blob: r.blob }] }; },
};

/* ---------- Indicador en la cabecera ---------- */
function pill() { let p = document.getElementById('mcpPill'); const on = MCP.state === 'on', show = MCP.state !== 'off' || !!MCP.url;
  if (!p) { p = el('button', { id: 'mcpPill', type: 'button', on: { click: () => { location.hash = '#settings'; setTimeout(() => { const c = document.getElementById('mcpCard'); if (c) c.scrollIntoView({ behavior: 'smooth' }); }, 300); } } }); const sp = document.getElementById('spend'); sp ? sp.before(p) : document.body.append(p); }
  p.hidden = !show; p.className = on ? 'on' : MCP.state === 'connecting' ? 'wait' : 'off'; p.textContent = on ? '🤖 MCP' : MCP.state === 'connecting' ? '🔌 …' : '🔌 MCP'; p.title = on ? `IA externa conectada · ${MCP.calls} órdenes · última: ${MCP.last || '—'}` : 'IA externa desconectada'; }
let flashT = 0; function flash(name) { const p = document.getElementById('mcpPill'); if (!p) return; p.classList.add('busy'); p.textContent = '🤖 ' + name.replace(/_/g, ' '); clearTimeout(flashT); flashT = setTimeout(() => { p.classList.remove('busy'); pill(); }, 2500); }

/* ---------- Tarjeta de Ajustes ---------- */
export function mcpSettingsCard() {
  const s = getSettings(); s.mcp = cfg(); const save = () => saveSettings(s);
  const st = el('div', { class: 'note' }); const upd = () => { st.textContent = { on: `✅ Conectada a ${MCP.url} · ${MCP.calls} órdenes recibidas`, connecting: '⏳ Buscando el servidor MCP…', off: MCP.url ? '⚠️ No encuentro el servidor: ¿está arrancado?' : 'Desconectada', error: '⚠️ Dirección no válida', claude: 'Dentro de Claude no se puede: abre la app de GitHub Pages o la local.' }[MCP.state] || ''; };
  upd(); const un = onMcp(upd); setTimeout(() => { if (!document.body.contains(st)) un(); }, 60000);
  const url = el('input', { class: 'txt', value: s.mcp.url, placeholder: 'ws://localhost:7821/bridge' }); url.addEventListener('change', () => { s.mcp.url = url.value.trim() || 'ws://localhost:7821/bridge'; save(); if (s.mcp.enabled) { mcpStop(); connect(s.mcp.url); } });
  const lim = el('input', { class: 'txt sm', type: 'number', min: 0, step: 0.1, value: s.mcp.autoApprove }); lim.addEventListener('change', () => { s.mcp.autoApprove = Math.max(0, +lim.value || 0); save(); });
  const path = '/ruta/a/Higgs-field-/mcp/server.mjs';
  const desk = JSON.stringify({ mcpServers: { 'plato-studio': { command: 'node', args: [path] } } }, null, 2);
  const code = `claude mcp add plato-studio -- node ${path}`;
  return el('section', { class: 'card', id: 'mcpCard' }, el('h3', {}, '🔌 IA externa (MCP)'),
    el('p', { class: 'note' }, 'Conecta Claude Desktop, Claude Code, Cursor o cualquier cliente MCP: podrán montar escenas, mover cámaras, grabar tomas desde varias cámaras, dirigir capítulos y generar con tus claves. Tus claves no salen de este navegador.'),
    toggle('Conectar con el servidor MCP', () => !!s.mcp.enabled, v => { s.mcp.enabled = v; save(); v ? connect(s.mcp.url) : mcpStop(); }), el('div', { class: 'gap' }), url, st,
    el('div', { class: 'rowr' }, el('label', {}, 'Puede gastar sin preguntarte hasta ($ por orden)'), lim),
    el('p', { class: 'note' }, '1) Descarga el repositorio y ten Node 18+. 2) Añádelo a tu cliente MCP. 3) Activa la conexión aquí (o abre la app con ?mcp=7821). El servidor también sirve la app en http://localhost:7821 si prefieres usarla en local.'),
    el('div', { class: 'lbl' }, 'Claude Desktop (claude_desktop_config.json)'), el('pre', { class: 'code' }, desk), el('div', { class: 'row-btns' }, btn('📋 Copiar', () => copyText(desk), 'mini-b')),
    el('div', { class: 'lbl' }, 'Claude Code'), el('pre', { class: 'code' }, code), el('div', { class: 'row-btns' }, btn('📋 Copiar', () => copyText(code), 'mini-b')),
    el('p', { class: 'note' }, 'Deja esta pestaña visible mientras la IA trabaja: el plató y las grabaciones se pausan si el navegador la manda a segundo plano.'));
}
