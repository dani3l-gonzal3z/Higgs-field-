// Motor de generación compartido + cola visible desde cualquier sección.
import { el, btn, toast, uid, db, emit, bus, videoMeta, thumbFromVideo, blobURL, fmtTime, mediaKind } from './core.js';
import { PROVIDERS, findMedia, fetchBlob, ProviderError, uploadFor } from './providers.js';

export const RUN = { jobs: [] };
const listeners = new Set(); const changed = () => { for (const f of listeners) f(); updDock(); };
export const onJobs = f => { listeners.add(f); return () => listeners.delete(f); };

// Sube Blobs incluidos en el input (también dentro de listas) y devuelve el input con URLs.
export async function resolveMedia(provider, input) {
  const out = {}; const cache = new Map();
  const up = async (b, i) => { if (typeof b === 'string') return b; if (!cache.has(b)) cache.set(b, uploadFor(provider, b, `${Date.now()}-${i}.${({ video: 'mp4', image: 'png', audio: 'mp3' })[mediaKind(b)] || 'bin'}`)); return cache.get(b); };
  let i = 0; for (const [k, v] of Object.entries(input)) { if (v instanceof Blob) out[k] = await up(v, i++); else if (Array.isArray(v) && v.some(x => x instanceof Blob)) out[k] = await Promise.all(v.map(x => up(x, i++))); else out[k] = v; }
  return out;
}

/** Lanza una generación. job = { provider, endpoint, name, input, kind, est, meta, label } → Promise<gen> */
export function runJob(spec) {
  const job = { id: uid(), ...spec, phase: 'subiendo', t0: Date.now(), ctrl: new AbortController() }; RUN.jobs.unshift(job); changed();
  job.promise = (async () => {
    await db.put('ledger', { id: job.id, t: Date.now(), model: job.name, provider: job.provider, cost: job.est || 0, status: 'pending' });
    try {
      const input = await resolveMedia(job.provider, job.input); job.phase = 'en cola'; changed();
      const res = await PROVIDERS[job.provider].run({ endpoint: job.endpoint, name: job.name }, input, { signal: job.ctrl.signal, onStatus: st => { job.phase = st.phase === 'running' ? 'generando' : st.phase === 'done' ? 'terminando' : 'en cola' + (st.pos != null ? ` (#${st.pos + 1})` : ''); if (st.log) job.log = st.log; if (st.cancel) job.cancel = st.cancel; changed(); } });
      const url = findMedia(res, job.kind); if (!url) throw new ProviderError('El proveedor terminó pero no encuentro el archivo en la respuesta.', 0);
      job.phase = 'guardando'; changed();
      const blob = await fetchBlob(url); let meta = {}, thumb = null;
      if (blob && job.kind === 'video') { meta = await videoMeta(blob); thumb = await thumbFromVideo(blob); } else if (blob && job.kind === 'image') thumb = blob;
      const cost = (res && res.cost && (res.cost.amount_usd || res.cost.usd)) || job.est || 0;
      const gen = { id: job.id, t: Date.now(), mode: job.mode || '', kind: job.kind, modelId: job.endpoint, modelName: job.name, provider: job.provider, prompt: job.input.prompt || job.label || '', input: job.input, cost, blob, url, thumb, dur: meta.duration || null, w: meta.w, h: meta.h, fav: false, meta: job.meta || {} };
      await db.put('gens', gen); await db.put('ledger', { id: job.id, t: Date.now(), model: job.name, provider: job.provider, cost, status: 'ok' });
      job.phase = 'listo'; job.gen = gen; emit('gens'); import('./guide.js').then(m => m.guideEvent('generate')).catch(() => {}); return gen;
    } catch (e) {
      const cancelled = e.name === 'AbortError'; job.phase = cancelled ? 'cancelado' : 'error'; job.error = cancelled ? 'Cancelado' : (e.message || String(e));
      await db.put('ledger', { id: job.id, t: Date.now(), model: job.name, provider: job.provider, cost: 0, status: 'fail', error: job.error });
      throw e;
    } finally { job.t1 = Date.now(); changed(); emit('ledger'); }
  })();
  job.promise.catch(() => {});
  return job;
}
export function cancelJob(j) { try { j.cancel && j.cancel(); } catch (e) {} j.ctrl.abort(); }

/* ---------- Dock de la cola ---------- */
let dock = null, panel = null, timer = 0;
function updDock() {
  if (!dock) { dock = el('button', { id: 'dock', type: 'button', on: { click: togglePanel } }); document.body.append(dock); }
  const busy = RUN.jobs.filter(j => !j.t1).length, done = RUN.jobs.filter(j => j.t1 && j.phase === 'listo').length, bad = RUN.jobs.filter(j => j.phase === 'error').length;
  dock.hidden = !RUN.jobs.length; dock.className = busy ? 'busy' : bad ? 'bad' : 'ok';
  dock.textContent = busy ? `⏳ ${busy} generando` : `✅ ${done}${bad ? ` · ⚠️ ${bad}` : ''}`;
  if (panel) renderPanel();
  clearInterval(timer); if (busy && panel) timer = setInterval(renderPanel, 1000);
}
function togglePanel() { if (panel) { panel.remove(); panel = null; clearInterval(timer); return; } panel = el('div', { id: 'dockpanel' }); document.body.append(panel); renderPanel(); updDock(); }
function renderPanel() {
  if (!panel) return; panel.innerHTML = '';
  panel.append(el('div', { class: 'dh' }, el('b', {}, 'Cola de generación'), btn('Limpiar terminadas', () => { RUN.jobs = RUN.jobs.filter(j => !j.t1); changed(); }, 'mini-b'), btn('✕', togglePanel, 'x')));
  for (const j of RUN.jobs.slice(0, 40)) {
    const busy = !j.t1;
    panel.append(el('div', { class: 'dj ' + (busy ? 'busy' : j.phase === 'listo' ? 'ok' : 'bad') },
      j.gen && j.gen.thumb ? el('img', { src: blobURL(j.gen.thumb), alt: '' }) : el('span', { class: 'ic' }, j.kind === 'audio' ? '🔊' : j.kind === 'image' ? '🖼' : '🎬'),
      el('div', { class: 'dm' }, el('b', {}, j.label || j.name), el('small', {}, `${j.name} · ${busy ? j.phase : j.phase === 'listo' ? 'listo' : j.error} · ${fmtTime(((j.t1 || Date.now()) - j.t0) / 1000)}`)),
      busy ? btn('Cancelar', () => cancelJob(j), 'mini-b') : j.gen ? btn('Ver', async () => { const { openGen } = await import('./gallery.js'); openGen(j.gen); }, 'mini-b') : null));
  }
}
bus.addEventListener('gens', () => {});
