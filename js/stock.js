// 🎞 Vídeos de stock (Pexels y Pixabay, gratis con clave): buscar, previsualizar y guardar en la galería para usarlos como planos.
import { el, btn, toast, modal, seg, uid, db, getSettings, videoMeta, thumbFromVideo, emit, host } from './core.js';
import { pfetch } from './providers.js';

const ORIENT = { '16:9': 'landscape', '2.39:1': 'landscape', '4:3': 'landscape', '9:16': 'portrait', '1:1': 'square' };
export const stockReady = () => { const s = getSettings().stock || {}; return !!(s.pexels || s.pixabay); };

export async function searchStock(q, { provider, aspect = '16:9', page = 1 } = {}) {
  const s = getSettings().stock || {}; provider = provider || (s.pexels ? 'pexels' : 'pixabay');
  if (provider === 'pexels') { if (!s.pexels) throw new Error('Falta la clave de Pexels (Ajustes → Este aparato)');
    const u = `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=18&page=${page}&locale=es-ES${ORIENT[aspect] ? '&orientation=' + ORIENT[aspect] : ''}`;
    const r = await pfetch(u, { headers: { Authorization: s.pexels } }); if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Pexels rechaza la clave' : 'Pexels: error ' + r.status); const j = await r.json();
    return (j.videos || []).map(v => { const files = (v.video_files || []).filter(f => /mp4/.test(f.file_type || 'video/mp4') && f.width); const best = files.filter(f => f.width <= 1920).sort((a, b) => b.width - a.width)[0] || files[0];
      return best && { id: 'px' + v.id, provider: 'pexels', thumb: v.image, dur: v.duration, w: best.width, h: best.height, url: best.link, author: v.user && v.user.name, authorUrl: v.user && v.user.url, page: v.url }; }).filter(Boolean); }
  if (!s.pixabay) throw new Error('Falta la clave de Pixabay (Ajustes → Este aparato)');
  const u = `https://pixabay.com/api/videos/?key=${encodeURIComponent(s.pixabay)}&q=${encodeURIComponent(q)}&per_page=18&page=${page}&lang=es&safesearch=true`;
  const r = await pfetch(u); if (!r.ok) throw new Error(r.status === 400 ? 'Pixabay rechaza la clave' : 'Pixabay: error ' + r.status); const j = await r.json();
  return (j.hits || []).map(h => { const v = h.videos || {}; const best = (v.large && v.large.url ? v.large : v.medium && v.medium.url ? v.medium : v.small) || null;
    return best && { id: 'pb' + h.id, provider: 'pixabay', thumb: (v.medium && v.medium.thumbnail) || (v.small && v.small.thumbnail) || `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg`, dur: h.duration, w: best.width, h: best.height, url: best.url, author: h.user, authorUrl: `https://pixabay.com/users/${h.user}-${h.user_id}/`, page: h.pageURL }; }).filter(Boolean);
}

// Descarga el clip y lo guarda en la galería con su crédito.
export async function saveStock(it, label = '') {
  const r = await pfetch(it.url); if (!r.ok) throw new Error('No se pudo descargar el clip (' + r.status + ')'); const blob = await r.blob();
  const meta = await videoMeta(blob).catch(() => ({})); const thumb = await thumbFromVideo(blob).catch(() => null); const id = 'stock-' + it.id + '-' + uid().slice(0, 4);
  const credit = `${it.provider === 'pexels' ? 'Pexels' : 'Pixabay'} · ${it.author || 'autor desconocido'}`;
  const g = { id, t: Date.now(), mode: 'stock', kind: 'video', modelName: `Stock · ${credit}`, provider: 'stock', prompt: label, cost: 0, blob, thumb, dur: meta.duration || it.dur, credit, creditUrl: it.page };
  await db.put('gens', g); emit('gens'); return g;
}

// Buscador: devuelve el clip guardado en la galería (o null).
export function pickStock({ query = '', aspect = '16:9', title = '🎞 Vídeos de stock' } = {}) {
  return new Promise(res => {
    if (host.claude) { toast('Los vídeos de stock no se pueden buscar dentro de Claude (no deja conectar con otras webs). Ábrelo en tu ordenador.', 6000); res(null); return; }
    if (!stockReady()) { toast('Añade una clave gratuita de Pexels o Pixabay en Ajustes → Este aparato', 6000, { action: { label: 'Ir a Ajustes', fn: () => location.hash = '#settings' } }); res(null); return; }
    const s = getSettings().stock; const st = { provider: s.pexels ? 'pexels' : 'pixabay', page: 1, done: false };
    const q = el('input', { class: 'txt', type: 'search', placeholder: 'Qué buscas: «calle de noche con lluvia», «romanos», «volcán»…', value: query });
    const grid = el('div', { class: 'stk-grid' }); const more = btn('Más resultados', () => go(true), 'mini-b'); more.hidden = true;
    const go = async (next) => { if (!q.value.trim()) return; st.page = next ? st.page + 1 : 1; if (!next) grid.innerHTML = ''; grid.append(el('div', { class: 'empty stk-wait' }, 'Buscando…'));
      try { const items = await searchStock(q.value.trim(), { provider: st.provider, aspect, page: st.page }); grid.querySelector('.stk-wait')?.remove();
        if (!items.length && !next) grid.append(el('div', { class: 'empty' }, 'Nada. Prueba con otras palabras (en inglés suele haber más).'));
        for (const it of items) { const v = el('video', { muted: true, loop: true, playsInline: true, preload: 'none', poster: it.thumb }); let loaded = false;
          const card = el('button', { type: 'button', class: 'stk-it', on: { mouseenter: () => { if (!loaded) { v.src = it.url; loaded = true; } v.play().catch(() => {}); }, mouseleave: () => v.pause(),
            click: async () => { card.classList.add('busy'); try { const g = await saveStock(it, q.value.trim()); res(g); close(); toast('🎞 Clip guardado en la galería', 3000, { sub: g.credit }); } catch (e) { card.classList.remove('busy'); toast('⚠️ ' + e.message, 5000); } } } },
            v, el('span', {}, `${Math.round(it.dur || 0)} s · ${it.w}×${it.h}`), el('small', {}, it.author ? '© ' + it.author : '')); grid.append(card); }
        more.hidden = items.length < 18;
      } catch (e) { grid.querySelector('.stk-wait')?.remove(); grid.append(el('div', { class: 'empty' }, '⚠️ ' + e.message)); } };
    q.addEventListener('keydown', e => { if (e.key === 'Enter') go(false); });
    const provs = [s.pexels ? ['pexels', 'Pexels'] : null, s.pixabay ? ['pixabay', 'Pixabay'] : null].filter(Boolean);
    const body = el('div', { class: 'stk' }, el('div', { class: 'inrow' }, q, btn('🔎', () => go(false), 'b on')), provs.length > 1 ? seg(provs, () => st.provider, v => { st.provider = v; go(false); }) : null,
      grid, more, el('p', { class: 'note' }, 'Toca un clip para guardarlo en la galería. Los clips de Pexels y Pixabay se pueden usar gratis; cita al autor cuando puedas (queda guardado en el clip).'));
    let picked = false; const close = modal(title, body, { wide: true, onClose: () => { if (!picked) res(null); } }); const r0 = res; res = g => { picked = true; r0(g); };
    if (query) go(false);
  });
}
