// Servicios del propio aparato (servidor de Plató en este ordenador): montaje con FFmpeg, voces gratis y proxy.
// Disponible cuando abres Plató como aplicación (plato.sh / Plato.cmd) o con ?mcp=PUERTO.
import { host } from './core.js';

let BASE = null, CAPS = null, pending = null;
function guessBase() {
  if (host.claude) return null;
  const q = new URLSearchParams(location.search).get('mcp');
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.port) return location.origin;
  if (q && /^\d+$/.test(q)) return `http://localhost:${q}`;
  return null;
}
export function localBase() { return BASE; }
export function localCaps() { return CAPS; }
export async function detectLocal(force = false) {
  if (pending && !force) return pending;
  pending = (async () => { const b = guessBase(); if (!b) { BASE = null; CAPS = null; return null; }
    try { const r = await fetch(b + '/api/caps', { cache: 'no-store' }); if (!r.ok) throw 0; CAPS = await r.json(); BASE = b; } catch (e) { BASE = null; CAPS = null; }
    return CAPS; })();
  return pending;
}
export const hasFFmpeg = () => !!(CAPS && CAPS.ffmpeg && CAPS.ffmpeg.ok);
export const hasLocalVoice = (engine = 'kokoro') => !!(CAPS && CAPS.tts && CAPS.tts[engine] && CAPS.tts[engine].ok);
export const proxyBase = () => BASE ? BASE + '/api/proxy/' : null;

// Sube los archivos que el servidor no tenga todavía (se guardan en caché por clave).
export async function syncMedia(items, onStep) {
  const keys = [...new Set(items.map(x => x.key))];
  const { missing } = await (await fetch(BASE + '/api/media/have', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keys }) })).json();
  let i = 0; for (const k of missing) { const it = items.find(x => x.key === k); onStep && onStep(++i, missing.length);
    const r = await fetch(BASE + '/api/media/' + encodeURIComponent(k), { method: 'PUT', body: it.blob }); if (!r.ok) throw new Error('No se pudo pasar un archivo al montador'); }
}
export async function renderLocal(spec, onProgress) {
  const job = 'j' + Math.random().toString(36).slice(2, 10); spec.job = job; let done = false;
  const tick = async () => { while (!done) { await new Promise(r => setTimeout(r, 700)); if (done) break; try { const p = await (await fetch(BASE + '/api/render/progress?job=' + job, { cache: 'no-store' })).json(); onProgress && onProgress(p.p || 0); } catch (e) {} } };
  tick();
  try { const r = await fetch(BASE + '/api/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(spec) });
    if (!r.ok) { let m = 'Error del montador'; try { m = (await r.json()).error || m; } catch (e) {} throw new Error(m); }
    const blob = await r.blob(); return { blob, secs: +r.headers.get('x-render-secs') || null, encoder: r.headers.get('x-encoder'), savedTo: r.headers.get('x-saved-to') ? decodeURIComponent(r.headers.get('x-saved-to')) : null };
  } finally { done = true; }
}
export async function speakLocal({ engine = 'kokoro', text, voice, speed = 1, instruct, lang }) {
  if (!BASE) await detectLocal(); if (!BASE) throw new Error('Las voces gratis necesitan Plató abierto como aplicación (plato.sh / Plato.cmd)');
  const r = await fetch(BASE + '/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engine, text, voice, speed, instruct, lang }) });
  const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || 'Error de voz');
  const bin = Uint8Array.from(atob(j.audio), c => c.charCodeAt(0)); return { blob: new Blob([bin], { type: j.mime }), dur: j.dur, words: j.words || [] };
}
