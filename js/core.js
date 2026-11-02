// Núcleo compartido: utilidades de interfaz, ajustes, base de datos local y gasto.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'on') for (const ev in v) e.addEventListener(ev, v[ev]);
    else if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}
export const btn = (label, fn, cls = 'b') => el('button', { class: cls, type: 'button', on: { click: fn } }, label);
export const vib = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

let toastT = 0;
export function toast(msg, ms = 2600, o = {}) {
  let t = $('#toast'); if (!t) { t = el('div', { id: 'toast' }); document.body.append(t); }
  t.innerHTML = ''; t.append(el('div', {}, msg)); if (o.sub) t.append(el('div', { class: 'sub' }, o.sub));
  if (o.action) t.append(btn(o.action.label, () => { t.classList.remove('show'); o.action.fn(); }, ''));
  t.style.pointerEvents = o.action ? 'auto' : 'none'; t.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), o.action ? Math.max(ms, 5000) : ms);
}
export function modal(title, body, { wide = false, onClose } = {}) {
  const wrap = el('div', { class: 'modal' }); const card = el('div', { class: 'mcard' + (wide ? ' wide' : '') });
  const esc = e => { if (e.key === 'Escape' && wrap.isConnected && wrap === [...document.querySelectorAll('.modal')].pop()) { e.stopPropagation(); close(); } };
  const close = () => { if (!wrap.isConnected) return; wrap.remove(); removeEventListener('keydown', esc, true); onClose && onClose(); };
  card.append(el('div', { class: 'mh' }, el('b', {}, title), btn('✕', close, 'x')), body);
  wrap.append(card); wrap.addEventListener('click', e => { if (e.target === wrap) close(); }); addEventListener('keydown', esc, true);
  document.body.append(wrap); const first = card.querySelector('.b.hot, button:not(.x), input, textarea'); if (first && matchMedia('(pointer:fine)').matches) setTimeout(() => first.focus({ preventScroll: true }), 30); return close;
}
export function confirmBox(title, text, okLabel = 'Aceptar') {
  return new Promise(res => {
    let done = false; const body = el('div', {}, el('p', { class: 'note' }, text));
    const close = modal(title, body, { onClose: () => { if (!done) res(false); } });
    body.append(el('div', { class: 'acts' }, btn('Cancelar', () => { done = true; close(); res(false); }), btn(okLabel, () => { done = true; close(); res(true); }, 'b on')));
  });
}
export function seg(opts, get, set) {
  const w = el('div', { class: 'seg' });
  for (const [v, l] of opts) { const b = btn(l, () => { set(v); for (const x of w.children) x.classList.remove('on'); b.classList.add('on'); vib(5); }, ''); if (get() === v) b.classList.add('on'); w.append(b); }
  return w;
}
export function toggle(label, get, set) { const b = btn(label, () => { set(!get()); b.classList.toggle('on', !!get()); }); b.classList.toggle('on', !!get()); return b; }
export const fmtTime = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const fmtDate = t => new Date(t).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
// Entorno anfitrión: dentro de Claude (artifact) usamos su IA y sus descargas.
export const host = { claude: false, ready: false, sample: null, save: null };
export function download(blob, name) { if (host.save) { host.save({ filename: name, data: blob }).catch(e => { if (e && e.code !== 'declined') toast('No se pudo descargar'); }); return; } const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
export async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('📋 Copiado'); } catch (e) { toast('No se pudo copiar: mantén pulsado el texto'); } }

/* ---------- Ajustes (localStorage) ---------- */
const SK = 'studio_settings';
export const DEFAULT_SETTINGS = {
  keys: { fal: '', higgsfield: '', muapi: '', replicate: '' },
  proxy: { url: '', token: '', falViaProxy: false },
  llm: { provider: 'anthropic', key: '', model: 'claude-sonnet-5-5', base: '' },
  budget: { monthly: 20, eurRate: 0.92, showEur: true, confirmAbove: 2 },
  mcp: { enabled: false, url: 'ws://localhost:7821/bridge', autoApprove: 0.5 },
  catalog: null,
  stock: { pexels: '', pixabay: '' },
  voice: { kokoro: 'ef_dora', edge: 'es-ES-ElviraNeural' },
};
function merge(a, b) { const o = Array.isArray(a) ? [...a] : { ...a }; for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object' && a[k] && !Array.isArray(a[k])) o[k] = merge(a[k], b[k]); else o[k] = b[k]; } return o; }
export function getSettings() { try { return merge(DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SK) || '{}')); } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); } }
export function saveSettings(s) { localStorage.setItem(SK, JSON.stringify(s)); dispatchEvent(new Event('studio:settings')); }
export function hasAnyKey(s = getSettings()) { return Object.values(s.keys).some(Boolean); }

/* ---------- Base de datos local (IndexedDB) ---------- */
const DBN = 'plato_studio', DBV = 1, STORES = ['gens', 'inbox', 'chars', 'projects', 'ledger'];
let dbp = null;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DBN, DBV);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) { const d = await openDB(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); }
export const db = {
  get: (store, id) => tx(store, 'readonly', s => s.get(id)),
  put: (store, v) => tx(store, 'readwrite', s => s.put(v)),
  del: (store, id) => tx(store, 'readwrite', s => s.delete(id)),
  all: (store) => tx(store, 'readonly', s => s.getAll()),
  clear: (store) => tx(store, 'readwrite', s => s.clear()),
};
export const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

/* ---------- Gasto ---------- */
export async function spentThisMonth() {
  const now = new Date(); const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const all = await db.all('ledger'); return all.filter(x => x.t >= from && x.status !== 'fail').reduce((a, x) => a + (x.cost || 0), 0);
}
export function money(usd, s = getSettings()) { if (usd == null || isNaN(usd)) return '—'; const d = `$${usd < 1 ? usd.toFixed(3) : usd.toFixed(2)}`; return s.budget.showEur ? `${d} (≈${(usd * s.budget.eurRate).toFixed(2)} €)` : d; }

/* ---------- Medios ---------- */
export function mediaKind(blobOrName) { const n = typeof blobOrName === 'string' ? blobOrName : (blobOrName.type || blobOrName.name || ''); return /video|\.mp4|\.webm|\.mov/i.test(n) ? 'video' : /image|\.png|\.jpe?g|\.webp|\.gif/i.test(n) ? 'image' : /audio|\.mp3|\.wav|\.m4a/i.test(n) ? 'audio' : 'file'; }
export function videoMeta(blob) {
  return new Promise(res => { const v = el('video', { muted: true, playsInline: true, preload: 'metadata' }); const u = URL.createObjectURL(blob); v.src = u;
    const done = () => { const m = { duration: isFinite(v.duration) ? v.duration : 0, w: v.videoWidth, h: v.videoHeight }; URL.revokeObjectURL(u); res(m); };
    v.onloadedmetadata = () => { if (isFinite(v.duration) && v.duration > 0) return done(); v.ontimeupdate = () => { v.ontimeupdate = null; done(); }; v.currentTime = 1e101; setTimeout(done, 3000); };
    v.onerror = () => { URL.revokeObjectURL(u); res({ duration: 0, w: 0, h: 0 }); }; });
}
export function thumbFromVideo(blob, t = 0.1) {
  return new Promise(res => { const v = el('video', { muted: true, playsInline: true, preload: 'auto' }); const u = URL.createObjectURL(blob); v.src = u;
    const fail = () => { URL.revokeObjectURL(u); res(null); };
    v.onloadeddata = () => { v.currentTime = Math.min(t, (v.duration || 1) / 2); };
    v.onseeked = () => { try { const c = el('canvas'); c.width = 320; c.height = Math.round(320 * (v.videoHeight || 9) / (v.videoWidth || 16)); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); c.toBlob(b => { URL.revokeObjectURL(u); res(b); }, 'image/jpeg', 0.7); } catch (e) { fail(); } };
    v.onerror = fail; setTimeout(fail, 8000); });
}
const urlCache = new WeakMap();
export function blobURL(b) { if (!b) return ''; if (typeof b === 'string') return b; let u = urlCache.get(b); if (!u) { u = URL.createObjectURL(b); urlCache.set(b, u); } return u; }
