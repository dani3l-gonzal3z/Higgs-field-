// ⚙️ Tarjeta «Este aparato»: montaje rápido, voces gratis, proxy local y claves de vídeos de stock.
import { el, btn, toast, seg, getSettings, saveSettings, blobURL } from './core.js';
import { detectLocal, localCaps, speakLocal } from './local.js';

export function deviceCard() {
  const box = el('section', { class: 'card dev' }, el('h3', {}, '🏠 Este aparato'), el('div', { class: 'empty' }, 'Comprobando…'));
  detectLocal(true).then(() => fill(box)); return box;
}
const line = (ok, title, sub) => el('div', { class: 'devl' }, el('i', {}, ok ? '✅' : '⚪'), el('div', {}, el('b', {}, title), el('small', {}, sub)));
function fill(box) {
  const c = localCaps(); const s = getSettings(); const save = () => saveSettings(s);
  box.innerHTML = ''; box.append(el('h3', {}, '🏠 Este aparato'));
  if (!c) box.append(el('p', { class: 'note' }, 'Abre Plató como aplicación (Plato.cmd en Windows, Plato.command en Mac, ./plato.sh en Linux, o el aparato) para tener: exportación rápida con FFmpeg, voces gratis sin internet y conexión con Higgsfield, Muapi y Replicate sin montar el proxy.'));
  else {
    const k = c.tts.kokoro || {};
    box.append(line(c.ffmpeg.ok, 'Montaje rápido (FFmpeg)', c.ffmpeg.ok ? `FFmpeg ${c.ffmpeg.version} · ${c.ffmpeg.encoder === 'libx264' ? 'procesador' : 'aceleración por hardware (' + c.ffmpeg.encoder + ')'}${c.ffmpeg.subtitles ? '' : ' · sin subtítulos (falta libass)'}` : 'No encuentro FFmpeg. Instálalo (Linux: sudo apt install ffmpeg · Mac: brew install ffmpeg · Windows: winget install ffmpeg) y reinicia Plató.'),
      line(k.ok, 'Voces gratis sin internet (Kokoro)', k.ok ? `${k.voices.length} voces · español: Dora, Álex y Santa` : `Sin instalar. En una terminal, dentro de la carpeta de Plató: node mcp/server.mjs --setup-voices${k.why && k.why !== 'sin instalar' ? ' · ' + k.why : ''}`),
      line(c.tts.edge && c.tts.edge.ok, 'Voces de Edge (en línea)', 'Gratis pero no oficiales: Microsoft puede cortarlas en cualquier momento. Útiles como reserva.'),
      line(true, 'Proxy local', 'Higgsfield, Muapi y Replicate funcionan sin el mini-proxy de Cloudflare mientras uses Plató como aplicación.'));
    // Probar una voz
    const eng = { v: k.ok ? 'kokoro' : 'edge' }; const voices = () => (c.voices[eng.v] || []);
    const sel = el('select', { class: 'txt' }); const fillSel = () => { sel.innerHTML = ''; for (const v of voices()) sel.append(el('option', { value: v.id, selected: v.id === (s.voice && s.voice[eng.v]) }, v.label)); };
    sel.addEventListener('change', () => { s.voice = { ...(s.voice || {}), [eng.v]: sel.value }; save(); });
    const txt = el('input', { class: 'txt', value: 'Hola, soy tu profe de hoy. ¿Empezamos?' }); const out = el('div', { class: 'devplay' });
    fillSel();
    box.append(el('div', { class: 'lbl' }, 'Probar una voz'), seg([['kokoro', '🏠 Kokoro'], ['edge', '🌐 Edge']], () => eng.v, v => { eng.v = v; fillSel(); }), el('div', { class: 'gap' }), sel, el('div', { class: 'gap' }),
      el('div', { class: 'inrow' }, txt, btn('▶', async e => { const b = e.currentTarget; b.textContent = '⏳'; try { const t0 = performance.now(); const r = await speakLocal({ engine: eng.v, text: txt.value, voice: sel.value });
        out.innerHTML = ''; const a = el('audio', { src: blobURL(r.blob), controls: true, autoplay: true }); out.append(a, el('small', {}, `${(r.dur || 0).toFixed(1)} s de voz en ${((performance.now() - t0) / 1000).toFixed(1)} s`)); } catch (er) { toast('⚠️ ' + er.message, 6000); } b.textContent = '▶'; }, 'b on')), out);
  }
  // Vídeos de stock
  s.stock = s.stock || {}; const keyIn = (k, ph) => { const i = el('input', { class: 'txt', type: 'password', autocomplete: 'off', placeholder: ph, value: s.stock[k] || '' }); i.addEventListener('change', () => { s.stock[k] = i.value.trim(); save(); }); return i; };
  box.append(el('div', { class: 'lbl' }, 'Vídeos de stock (gratis)'), el('p', { class: 'note' }, 'Con una clave gratuita de Pexels o Pixabay puedes buscar clips reales y usarlos como planos, en vez de generarlos con IA. Pexels pide citar al autor cuando se pueda (Plató lo guarda en cada clip).'),
    keyIn('pexels', 'Clave de Pexels (pexels.com/api)'), el('div', { class: 'gap' }), keyIn('pixabay', 'Clave de Pixabay (pixabay.com/api/docs)'),
    el('div', { class: 'row-btns' }, el('a', { class: 'mini-b', href: 'https://www.pexels.com/api/new/', target: '_blank', rel: 'noopener' }, 'Conseguir clave de Pexels ↗'), el('a', { class: 'mini-b', href: 'https://pixabay.com/api/docs/', target: '_blank', rel: 'noopener' }, 'Pixabay ↗')));
}
