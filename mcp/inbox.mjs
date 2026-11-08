// Buzón entre el móvil y el aparato: el móvil (en la misma wifi, emparejado con un código) manda mensajes y archivos;
// la app del aparato los recoge y contesta. Todo se queda en este ordenador (~/.plato-studio/inbox).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const CONF = path.join(os.homedir(), '.plato-studio');
const DIR = path.join(CONF, 'inbox');
const PAIR = path.join(CONF, 'pair.json');
const MAX_FILE = 80e6, MAX_MSGS = 400;

let pair = null;
export function pairKey() {
  if (pair) return pair.key;
  try { pair = JSON.parse(fs.readFileSync(PAIR, 'utf8')); } catch (e) { pair = null; }
  if (!pair || !/^[a-f0-9]{32}$/.test(pair.key || '')) { pair = { key: crypto.randomBytes(16).toString('hex'), t: Date.now() }; fs.mkdirSync(CONF, { recursive: true }); fs.writeFileSync(PAIR, JSON.stringify(pair), { mode: 0o600 }); }
  return pair.key;
}
export function newPairKey() { pair = null; try { fs.unlinkSync(PAIR); } catch (e) {} return pairKey(); }

// Dos colas: in (del móvil al aparato) y out (del aparato al móvil). Numeradas para pedir «lo nuevo desde n».
const Q = { in: [], out: [] }; let seq = Date.now();
const push = (q, item) => { const it = { n: ++seq, t: Date.now(), ...item }; Q[q].push(it); if (Q[q].length > MAX_MSGS) Q[q].splice(0, Q[q].length - MAX_MSGS); return it; };
const since = (q, n) => Q[q].filter(x => x.n > (+n || 0));
const okKey = (req, url) => { const k = req.headers['x-plato-key'] || url.searchParams.get('k') || ''; const a = Buffer.from(String(k)), b = Buffer.from(pairKey()); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
function readBody(req, max) { return new Promise((ok, ko) => { const c = []; let n = 0; req.on('data', d => { n += d.length; if (n > max) { ko(new Error('Demasiado grande')); req.destroy(); } else c.push(d); }); req.on('end', () => ok(Buffer.concat(c))); req.on('error', ko); }); }
const safeName = s => String(s || 'archivo').normalize('NFC').replace(/[^\p{L}\p{N} ._()-]+/gu, '_').slice(0, 100) || 'archivo';

// Lado del móvil (red local, con código de emparejamiento).
export async function phoneRoute(req, res, url, { log }) {
  const p = url.pathname;
  if (!p.startsWith('/inbox') && !p.startsWith('/outbox')) return false;
  if (!okKey(req, url)) { json(res, 401, { error: 'Código de emparejamiento no válido. Vuelve a escanear el QR del aparato.' }); return true; }
  try {
    if (p === '/inbox/msg' && req.method === 'POST') { const m = JSON.parse((await readBody(req, 64e3)).toString('utf8') || '{}');
      const type = ['chat', 'cmd'].includes(m.type) ? m.type : 'chat'; const it = push('in', { type, text: String(m.text || '').slice(0, 8000), cmd: m.cmd ? String(m.cmd).slice(0, 40) : undefined, arg: m.arg != null ? String(m.arg).slice(0, 200) : undefined, from: String(m.from || 'móvil').slice(0, 40) });
      if (type === 'chat') push('out', { role: 'user', text: it.text, ref: it.n });
      json(res, 200, { ok: true, n: it.n }); return true; }
    if (p === '/inbox/file' && (req.method === 'PUT' || req.method === 'POST')) { fs.mkdirSync(DIR, { recursive: true });
      const id = crypto.randomUUID(); const name = safeName(url.searchParams.get('name')); const mime = String(req.headers['content-type'] || 'application/octet-stream').slice(0, 100);
      const buf = await readBody(req, MAX_FILE); fs.writeFileSync(path.join(DIR, id), buf);
      const it = push('in', { type: 'file', id, name, mime, size: buf.length, text: url.searchParams.get('note') ? String(url.searchParams.get('note')).slice(0, 2000) : '' });
      push('out', { role: 'user', text: `📎 ${name}`, file: name, ref: it.n }); log && log(`móvil: archivo ${name} (${Math.round(buf.length / 1024)} KB)`);
      json(res, 200, { ok: true, n: it.n, id }); return true; }
    if (p === '/outbox' && req.method === 'GET') { json(res, 200, { items: since('out', url.searchParams.get('since')), status: STATUS }); return true; }
    json(res, 404, { error: 'No existe' }); return true;
  } catch (e) { json(res, 400, { error: e.message }); return true; }
}

// Lado del aparato (solo este ordenador): recoger lo que llega y contestar.
let STATUS = { state: 'idle' }; let ACK = 0;
export async function deviceRoute(req, res, url) {
  const p = url.pathname;
  // Sin «since» devuelve lo pendiente (lo que la app aún no ha confirmado): así, si la app se reinicia, no repite lo ya hecho.
  if (p === '/api/inbox' && req.method === 'GET') { const sn = url.searchParams.get('since'); json(res, 200, { items: since('in', sn == null ? ACK : sn), key: pairKey() }); return true; }
  if (p === '/api/inbox/ack' && req.method === 'POST') { const m = JSON.parse((await readBody(req, 1e3)).toString('utf8') || '{}'); ACK = Math.max(ACK, +m.n || 0); json(res, 200, { ok: true }); return true; }
  if (p.startsWith('/api/inbox/file/')) { const id = p.slice('/api/inbox/file/'.length); if (!/^[\w-]{36}$/.test(id)) { json(res, 400, { error: 'id' }); return true; }
    const f = path.join(DIR, id); if (!fs.existsSync(f)) { json(res, 404, { error: 'Ya no está' }); return true; }
    const it = Q.in.find(x => x.id === id); res.writeHead(200, { 'content-type': (it && it.mime) || 'application/octet-stream', 'content-length': fs.statSync(f).size }); fs.createReadStream(f).pipe(res); return true; }
  if (p === '/api/outbox' && req.method === 'POST') { const m = JSON.parse((await readBody(req, 256e3)).toString('utf8') || '{}');
    if (m.status) STATUS = { ...m.status, t: Date.now() };
    if (m.text || m.card) push('out', { role: 'assistant', text: String(m.text || '').slice(0, 20000), card: m.card || undefined, ref: m.ref });
    json(res, 200, { ok: true }); return true; }
  if (p === '/api/pair' && req.method === 'POST') { json(res, 200, { key: newPairKey() }); return true; }
  return false;
}
export function cleanupInbox() { try { for (const f of fs.readdirSync(DIR)) { const pth = path.join(DIR, f); if (Date.now() - fs.statSync(pth).mtimeMs > 14 * 864e5) fs.rmSync(pth, { force: true }); } } catch (e) {} }
