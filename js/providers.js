// Conectores con proveedores de generación (todos asíncronos: enviar → consultar estado → resultado).
import { getSettings, sleep, uid, host } from './core.js';
import { DEFAULT_CATALOG } from './catalog.js';

export class ProviderError extends Error { constructor(msg, status, retry = false) { super(msg); this.status = status; this.retry = retry; } }

export let extraCatalog = [];
export function catalog(s = getSettings()) { const base = (s.catalog && Array.isArray(s.catalog) && s.catalog.length) ? s.catalog : DEFAULT_CATALOG; return extraCatalog.length ? base.concat(extraCatalog) : base; }
let extraFor = null;
export async function loadExtraCatalog() { const s = getSettings(); const k = s.keys.muapi ? 'muapi' : ''; if (extraFor === k) return extraCatalog; extraFor = k;
  if (!k) { extraCatalog = []; return extraCatalog; } const { registry, toCatalog } = await import('./registry.js'); extraCatalog = (await registry()).map(toCatalog).filter(Boolean); return extraCatalog; }

const viaProxy = (url, s) => s.proxy.url ? s.proxy.url.replace(/\/+$/, '') + '/' + url : url;

async function http(url, opts = {}, { proxy = false, raw = false } = {}) {
  if (proxy === 'auto') { const s0 = getSettings(); try { return await http(url, opts, { proxy: false, raw }); } catch (e) { if (e.name === 'AbortError' || !(e instanceof ProviderError) || e.status !== 0 || !e.retry) throw e; if (!s0.proxy.url) throw new ProviderError('El navegador bloqueó la conexión directa (CORS). Configura el mini-proxy en Ajustes.', 0); return http(url, opts, { proxy: true, raw }); } }
  if (host.claude) throw new ProviderError('Dentro de Claude no se puede conectar con proveedores externos. Abre la app desde GitHub Pages para generar.', 0);
  const s = getSettings();
  if (proxy && !s.proxy.url) throw new ProviderError('Este proveedor necesita el mini-proxy. Configúralo en Ajustes → Proxy.', 0);
  const h = new Headers(opts.headers || {}); if (proxy && s.proxy.token) h.set('x-proxy-token', s.proxy.token);
  let r;
  try { r = await fetch(proxy ? viaProxy(url, s) : url, { ...opts, headers: h }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new ProviderError(proxy ? 'No se pudo conectar con el proxy. ¿Está desplegado y bien escrito?' : 'Error de red o bloqueo CORS. Prueba a activar el proxy para este proveedor.', 0, true); }
  if (raw) { if (!r.ok) throw new ProviderError(`HTTP ${r.status}`, r.status); return r; }
  const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) {}
  if (!r.ok) {
    let msg = j && (Array.isArray(j.detail) ? j.detail.map(d => d.msg || JSON.stringify(d)).join('; ') : (j.detail || j.error || j.message || j.title)) || text.slice(0, 240) || r.statusText;
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
    if (r.status === 401 || r.status === 403) msg = 'Clave rechazada (' + r.status + '): ' + msg;
    if (r.status === 402) msg = 'Sin saldo en el proveedor: ' + msg;
    throw new ProviderError(msg, r.status, r.status === 429 || r.status >= 500);
  }
  return j;
}

// Busca la URL del resultado en cualquier formato de respuesta.
export function findMedia(o, prefer = 'video') {
  const found = [];
  const walk = (x, key = '') => {
    if (!x) return;
    if (typeof x === 'string') { if (/^https?:\/\//.test(x)) found.push({ url: x, key }); return; }
    if (Array.isArray(x)) { x.forEach(v => walk(v, key)); return; }
    if (typeof x === 'object') for (const k in x) { if (/cancel|status|logs|request|urls_get|webhook/i.test(k) && k !== 'urls') continue; walk(x[k], k); }
  };
  walk(o);
  const isV = u => /\.(mp4|webm|mov)(\?|$)/i.test(u.url) || /video/i.test(u.key);
  const isI = u => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u.url) || /image/i.test(u.key);
  const isA = u => /\.(mp3|wav|m4a|ogg|flac|aac)(\?|$)/i.test(u.url) || /audio/i.test(u.key);
  const order = prefer === 'audio' ? [isA, isV] : prefer === 'video' ? [isV, isI] : [isI, isV];
  return (found.find(order[0]) || found.find(order[1]) || found.find(u => !/\/(requests|predictions)\//.test(u.url)) || {}).url || null;
}

async function poll(fn, { signal, onStatus, max = 30 * 60e3 }) {
  const t0 = Date.now(); let d = 1500;
  for (;;) {
    if (signal && signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    const r = await fn(); if (r) return r;
    if (Date.now() - t0 > max) throw new ProviderError('Se ha agotado el tiempo de espera (30 min).', 0);
    await sleep(d); d = Math.min(5000, d * 1.25);
  }
}

export const PROVIDERS = {
  fal: {
    name: 'fal.ai', keyLabel: 'Clave de fal.ai', keyHelp: 'fal.ai/dashboard/keys', keyUrl: 'https://fal.ai/dashboard/keys', needsProxy: false,
    canUpload: s => !!s.keys.fal,
    async upload(blob, name) {
      const s = getSettings(); const H = { Authorization: 'Key ' + s.keys.fal, 'Content-Type': 'application/json' };
      const type = blob.type || 'application/octet-stream';
      try {
        const init = await http('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', { method: 'POST', headers: H, body: JSON.stringify({ content_type: type, file_name: name }) }, { proxy: s.proxy.falViaProxy });
        const put = await fetch(s.proxy.falViaProxy ? viaProxy(init.upload_url, s) : init.upload_url, { method: 'PUT', body: blob, headers: { 'Content-Type': type, ...(s.proxy.falViaProxy && s.proxy.token ? { 'x-proxy-token': s.proxy.token } : {}) } });
        if (!put.ok) throw new Error('PUT ' + put.status);
        return init.file_url;
      } catch (e) {
        if (blob.size < 9e6) return await blobToDataURI(blob); // fal acepta data URIs pequeños
        throw new ProviderError('No se pudo subir el archivo a fal.ai: ' + e.message, 0);
      }
    },
    async run(model, input, { signal, onStatus }) {
      const s = getSettings(); if (!s.keys.fal) throw new ProviderError('Falta la clave de fal.ai (Ajustes).', 0);
      const H = { Authorization: 'Key ' + s.keys.fal, 'Content-Type': 'application/json' }; const px = { proxy: s.proxy.falViaProxy };
      const sub = await http('https://queue.fal.run/' + model.endpoint, { method: 'POST', headers: H, body: JSON.stringify(input), signal }, px);
      onStatus && onStatus({ phase: 'queued', id: sub.request_id, cancel: () => http(sub.cancel_url, { method: 'PUT', headers: H }, px).catch(() => {}) });
      await poll(async () => { const st = await http(sub.status_url + '?logs=1', { headers: H, signal }, px);
        const last = st.logs && st.logs.length ? st.logs[st.logs.length - 1].message : '';
        onStatus && onStatus({ phase: st.status === 'IN_PROGRESS' ? 'running' : st.status === 'COMPLETED' ? 'done' : 'queued', pos: st.queue_position, log: last });
        return st.status === 'COMPLETED' ? st : null; }, { signal, onStatus });
      return await http(sub.response_url, { headers: H, signal }, px);
    },
  },
  higgsfield: {
    name: 'Higgsfield API', keyLabel: 'Credenciales (KEY_ID:KEY_SECRET)', keyHelp: 'console.higgsfield.ai', keyUrl: 'https://console.higgsfield.ai', needsProxy: true,
    canUpload: () => false,
    async run(model, input, { signal, onStatus }) {
      const s = getSettings(); if (!s.keys.higgsfield) throw new ProviderError('Faltan las credenciales de Higgsfield (Ajustes).', 0);
      const H = { Authorization: 'Key ' + s.keys.higgsfield, 'Content-Type': 'application/json', 'Idempotency-Key': uid() };
      const sub = await http('https://api.higgsfield.ai/' + model.endpoint, { method: 'POST', headers: H, body: JSON.stringify(input), signal }, { proxy: true });
      const auth = { Authorization: 'Key ' + s.keys.higgsfield };
      onStatus && onStatus({ phase: 'queued', id: sub.request_id, cancel: () => http(sub.cancel_url, { method: 'POST', headers: auth }, { proxy: true }).catch(() => {}) });
      return await poll(async () => { const st = await http(sub.status_url || `https://api.higgsfield.ai/requests/${sub.request_id}/status`, { headers: auth, signal }, { proxy: true });
        const ph = String(st.status || '').toLowerCase();
        if (['failed', 'nsfw', 'canceled', 'cancelled', 'error'].includes(ph)) throw new ProviderError(ph === 'nsfw' ? 'Rechazado por el filtro de contenido (NSFW). No se cobra.' : 'La generación ha fallado' + (st.error ? ': ' + st.error : '') + '. No se cobra.', 0);
        onStatus && onStatus({ phase: ph === 'completed' ? 'done' : ph === 'in_progress' || ph === 'processing' ? 'running' : 'queued' });
        return ph === 'completed' ? st : null; }, { signal, onStatus });
    },
  },
  muapi: {
    name: 'Muapi', keyLabel: 'Clave de Muapi', keyHelp: 'muapi.ai', keyUrl: 'https://muapi.ai', needsProxy: false, autoProxy: true,
    canUpload: s => !!s.keys.muapi,
    async upload(blob, name) {
      const s = getSettings(); const fd = new FormData(); fd.append('file', blob, name);
      const r = await http('https://api.muapi.ai/api/v1/upload_file', { method: 'POST', headers: { 'x-api-key': s.keys.muapi }, body: fd }, { proxy: 'auto' });
      const u = findMedia(r, 'image') || r.url || r.file_url; if (!u) throw new ProviderError('Muapi no devolvió la URL del archivo subido.', 0); return u;
    },
    async run(model, input, { signal, onStatus }) {
      const s = getSettings(); if (!s.keys.muapi) throw new ProviderError('Falta la clave de Muapi (Ajustes).', 0);
      const H = { 'x-api-key': s.keys.muapi, 'Content-Type': 'application/json' };
      const sub = await http('https://api.muapi.ai/api/v1/' + model.endpoint, { method: 'POST', headers: H, body: JSON.stringify(input), signal }, { proxy: 'auto' });
      const id = sub.request_id || sub.id || (sub.data && (sub.data.request_id || sub.data.id)); if (!id) throw new ProviderError('Muapi no devolvió un id de petición.', 0);
      onStatus && onStatus({ phase: 'queued', id });
      return await poll(async () => { const st = await http(`https://api.muapi.ai/api/v1/predictions/${id}/result`, { headers: { 'x-api-key': s.keys.muapi }, signal }, { proxy: 'auto' });
        const ph = String(st.status || (st.data && st.data.status) || '').toLowerCase();
        if (['failed', 'error', 'canceled'].includes(ph)) throw new ProviderError('Muapi: la generación ha fallado' + (st.error ? ': ' + st.error : ''), 0);
        onStatus && onStatus({ phase: ph === 'completed' || ph === 'succeeded' ? 'done' : ph === 'processing' ? 'running' : 'queued' });
        return ph === 'completed' || ph === 'succeeded' ? st : null; }, { signal, onStatus });
    },
  },
  replicate: {
    name: 'Replicate', keyLabel: 'Token de Replicate', keyHelp: 'replicate.com/account/api-tokens', keyUrl: 'https://replicate.com/account/api-tokens', needsProxy: true,
    canUpload: s => !!s.keys.replicate && !!s.proxy.url,
    async upload(blob, name) {
      const s = getSettings(); const fd = new FormData(); fd.append('content', blob, name);
      const r = await http('https://api.replicate.com/v1/files', { method: 'POST', headers: { Authorization: 'Bearer ' + s.keys.replicate }, body: fd }, { proxy: true });
      return (r.urls && r.urls.get) || findMedia(r);
    },
    async run(model, input, { signal, onStatus }) {
      const s = getSettings(); if (!s.keys.replicate) throw new ProviderError('Falta el token de Replicate (Ajustes).', 0);
      const H = { Authorization: 'Bearer ' + s.keys.replicate, 'Content-Type': 'application/json' };
      const [ref, version] = model.endpoint.split(':');
      const sub = version ? await http('https://api.replicate.com/v1/predictions', { method: 'POST', headers: H, body: JSON.stringify({ version, input }), signal }, { proxy: true })
        : await http(`https://api.replicate.com/v1/models/${ref}/predictions`, { method: 'POST', headers: H, body: JSON.stringify({ input }), signal }, { proxy: true });
      onStatus && onStatus({ phase: 'queued', id: sub.id, cancel: () => sub.urls && sub.urls.cancel && http(sub.urls.cancel, { method: 'POST', headers: H }, { proxy: true }).catch(() => {}) });
      return await poll(async () => { const st = await http(sub.urls.get, { headers: H, signal }, { proxy: true });
        if (['failed', 'canceled'].includes(st.status)) throw new ProviderError('Replicate: ' + (st.error || st.status), 0);
        onStatus && onStatus({ phase: st.status === 'succeeded' ? 'done' : st.status === 'processing' ? 'running' : 'queued', log: (st.logs || '').trim().split('\n').pop() });
        return st.status === 'succeeded' ? st : null; }, { signal, onStatus });
    },
  },
};

export function blobToDataURI(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }

// Sube un archivo usando el proveedor del modelo o, si no puede, cualquier otro con alojamiento.
export async function uploadFor(providerId, blob, name) {
  const s = getSettings(); const p = PROVIDERS[providerId];
  if (p.upload && p.canUpload(s)) return p.upload(blob, name);
  for (const id of ['fal', 'muapi', 'replicate']) { const q = PROVIDERS[id]; if (q.upload && q.canUpload(s)) return q.upload(blob, name); }
  throw new ProviderError(`Para enviar archivos a ${p.name} necesito un sitio donde alojarlos: añade también una clave de fal.ai (recomendado).`, 0);
}

// Descarga el resultado como Blob (directo y, si CORS lo impide, a través del proxy).
export async function fetchBlob(url) {
  if (url.startsWith('data:')) return (await fetch(url)).blob();
  try { const r = await fetch(url); if (r.ok) return await r.blob(); } catch (e) {}
  const s = getSettings(); if (s.proxy.url) { const h = s.proxy.token ? { 'x-proxy-token': s.proxy.token } : {}; const r = await fetch(viaProxy(url, s), { headers: h }); if (r.ok) return await r.blob(); }
  return null;
}

// Convierte los valores de la app al formato de cada modelo.
const FALSIZE = { '16:9': 'landscape_16_9', '9:16': 'portrait_16_9', '1:1': 'square_hd', '4:3': 'landscape_4_3', '3:4': 'portrait_4_3', '2.39:1': 'landscape_16_9', '21:9': 'landscape_16_9' };
export function buildInput(m, p, urls) {
  const f = m.fields || {}, fmt = m.fmt || {}; const inp = { ...(m.fixed || {}) };
  const en = m.enums || {};
  const snap = (k, v) => { const e = en[k]; if (!e || !e.length) return v; if (e.includes(v)) return v; if (k === 'duration') { const nums = e.map(x => parseFloat(x)); let bi = 0; nums.forEach((n, i) => { if (Math.abs(n - v) < Math.abs(nums[bi] - v)) bi = i; }); return e[bi]; } if (k === 'aspect' && v === '2.39:1' && e.includes('21:9')) return '21:9'; return e.includes(String(v)) ? String(v) : e[0]; };
  const conv0 = (k, v) => { const t = fmt[k]; if (k === 'image' && t === 'list') return [v]; if (k === 'aspect') { if (t === 'falsize') return FALSIZE[v] || 'landscape_16_9'; return v === '2.39:1' ? '21:9' : v; } if (t === 's') return `${Math.round(v)}s`; if (t === 'str') return String(Math.round(v)); if (t === 'int') return parseInt(v, 10); return v; };
  const conv = (k, v) => { if (['duration', 'aspect', 'resolution'].includes(k) && en[k]) { const sv = snap(k, k === 'duration' ? +v : v); return typeof sv === 'string' && fmt[k] !== 'str' && k === 'duration' && en[k].every(x => typeof x === 'string') ? sv : sv; } return conv0(k, v); };
  const set = (k, v) => { if (f[k] && v != null && v !== '' && !(Array.isArray(v) && !v.length)) inp[f[k]] = conv(k, v); };
  set('prompt', p.prompt); set('negative', p.negative); set('image', urls.image); set('end_image', urls.end_image); set('video', urls.video); set('control', urls.control);
  if (f.refs && urls.refs && urls.refs.length) inp[f.refs] = urls.refs;
  set('duration', p.duration); set('aspect', p.aspect); set('resolution', p.resolution); if (f.audio) inp[f.audio] = !!p.audio; if (p.seed !== '' && p.seed != null) set('seed', +p.seed);
  return inp;
}
export function estimate(m, p, videoSecs) {
  if (!m.price || m.price.usd == null) return null; const n = m.price.usd || 0;
  if (m.price.per === 's') return n * (m.mode === 'v2v' ? (videoSecs || p.duration || 5) : (p.duration || 5));
  return n;
}
export function readiness(m, s = getSettings()) {
  if (m.disabled) return { ok: false, why: 'Desactivado (edítalo en Ajustes → Catálogo)' };
  if (!s.keys[m.provider]) return { ok: false, why: `Falta la clave de ${PROVIDERS[m.provider].name}` };
  if (PROVIDERS[m.provider].needsProxy && !s.proxy.url) return { ok: false, why: 'Necesita el mini-proxy' };
  return { ok: true };
}
