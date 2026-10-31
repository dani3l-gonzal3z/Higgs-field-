// 🖼 Galería: todo lo generado, con favoritos, comparación A/B y reutilización.
import { el, btn, toast, modal, seg, db, bus, blobURL, fmtDate, money, download, copyText, confirmBox } from './core.js';
import { PROVIDERS } from './providers.js';

const G = { filter: 'all', sel: new Set(), compare: false };
let root = null;
const src = g => g.blob ? blobURL(g.blob) : g.url;
export async function loadGens() { return (await db.all('gens')).sort((a, b) => b.t - a.t); }

export async function renderGallery(r) {
  root = r; r.innerHTML = ''; const all = (await loadGens()).filter(g => !g.hidden);
  const list = all.filter(g => G.filter === 'all' || (G.filter === 'fav' ? g.fav : G.filter === g.kind));
  const total = all.reduce((a, g) => a + (g.cost || 0), 0);
  r.append(el('div', { class: 'ghead' }, seg([['all', `Todo (${all.length})`], ['video', '🎬 Vídeos'], ['image', '🖼 Imágenes'], ['audio', '🔊 Audio'], ['fav', '⭐ Favoritos']], () => G.filter, v => { G.filter = v; renderGallery(r); }),
    el('div', { class: 'row-btns' }, btn(G.compare ? `Comparar (${G.sel.size}/2) ✕` : '⚖️ Comparar', () => { G.compare = !G.compare; G.sel.clear(); renderGallery(r); }, 'mini-b' + (G.compare ? ' on' : '')), el('small', { class: 'note' }, `Gastado en total ≈ ${money(total).split(' ')[0]}`))));
  if (!list.length) { r.append(el('div', { class: 'empty big' }, all.length ? 'Nada con este filtro.' : 'Aquí aparecerá todo lo que generes en el Estudio y los montajes que exportes.')); return; }
  const grid = el('div', { class: 'ggrid' });
  for (const g of list) {
    const thumb = g.thumb ? blobURL(g.thumb) : (g.kind === 'image' ? src(g) : null);
    grid.append(el('button', { type: 'button', class: 'gitem' + (G.sel.has(g.id) ? ' sel' : ''), on: { click: () => {
      if (G.compare) { G.sel.has(g.id) ? G.sel.delete(g.id) : G.sel.size < 2 && G.sel.add(g.id); if (G.sel.size === 2) { const [a, b] = [...G.sel].map(id => all.find(x => x.id === id)); openCompare(a, b); } renderGallery(r); }
      else openGen(g); } } },
      g.kind === 'audio' ? el('div', { class: 'aud' }, '🔊') : thumb ? el('img', { src: thumb, alt: '', loading: 'lazy' }) : el('video', { src: src(g), muted: true, preload: 'metadata' }),
      el('div', { class: 'gm' }, el('b', {}, (g.fav ? '⭐ ' : '') + g.modelName), el('small', {}, `${g.kind === 'video' ? '🎬' : g.kind === 'audio' ? '🔊' : '🖼'} ${g.dur ? g.dur.toFixed(1) + ' s · ' : ''}${fmtDate(g.t)}`))));
  }
  r.append(grid);
}
export function openGen(g) {
  const body = el('div', { class: 'gdetail' });
  body.append(g.kind === 'video' ? el('video', { src: src(g), controls: true, playsInline: true, loop: true, autoplay: true }) : g.kind === 'audio' ? el('audio', { src: src(g), controls: true, autoplay: true, style: 'width:100%' }) : el('img', { src: src(g), alt: '' }),
    el('div', { class: 'meta' }, el('div', {}, el('b', {}, g.modelName), ' · ', g.provider === 'edit' ? 'Montaje' : (PROVIDERS[g.provider] || {}).name || g.provider, ' · ', fmtDate(g.t), g.cost ? ' · ≈' + money(g.cost).split(' ')[0] : ''),
      g.prompt ? el('p', { class: 'prompt' }, g.prompt) : null),
    el('div', { class: 'row-btns' },
      btn(g.fav ? '⭐ Quitar favorito' : '☆ Favorito', async () => { g.fav = !g.fav; await db.put('gens', g); close(); openGen(g); refresh(); }, 'mini-b'),
      btn('♻ Usar como entrada', async () => { close(); const { reuse } = await import('./studio.js'); reuse(g); }, 'mini-b'),
      g.kind === 'video' ? btn('➕ Al montaje', async () => { const { addToEdit } = await import('./editor.js'); addToEdit(g); }, 'mini-b') : null,
      g.prompt ? btn('📋 Prompt', () => copyText(g.prompt), 'mini-b') : null,
      g.blob ? btn('⬇ Descargar', () => download(g.blob, `${g.modelName.replace(/\W+/g, '_')}-${g.id.slice(0, 6)}.${g.kind === 'video' ? (g.blob.type.includes('webm') ? 'webm' : 'mp4') : g.kind === 'audio' ? (/wav/.test(g.blob.type) ? 'wav' : 'mp3') : 'png'}`), 'mini-b on') : el('a', { class: 'mini-b', href: g.url, target: '_blank' }, 'Abrir enlace'),
      btn('🗑', async () => { if (await confirmBox('Borrar', '¿Borrar esta generación de la galería? (No afecta al gasto registrado.)', 'Borrar')) { await db.del('gens', g.id); close(); refresh(); } }, 'mini-b red')));
  const close = modal(g.kind === 'video' ? 'Vídeo' : g.kind === 'audio' ? 'Audio' : 'Imagen', body, { wide: true });
}
function openCompare(a, b) {
  const mk = g => el('div', { class: 'cmp' }, g.kind === 'video' ? el('video', { src: src(g), muted: true, loop: true, playsInline: true }) : el('img', { src: src(g), alt: '' }), el('b', {}, g.modelName), el('small', {}, g.cost ? '≈' + money(g.cost).split(' ')[0] : ''));
  const A = mk(a), B = mk(b); const vids = [A, B].map(x => x.querySelector('video')).filter(Boolean);
  const body = el('div', {}, el('div', { class: 'cmpgrid' }, A, B), vids.length ? el('div', { class: 'row-btns' }, btn('▶ Reproducir a la vez', () => { vids.forEach(v => { v.currentTime = 0; v.play(); }); }, 'b on'), btn('⏸', () => vids.forEach(v => v.pause()))) : null,
    el('div', { class: 'row-btns' }, btn('⭐ Me quedo con A', async () => { a.fav = true; await db.put('gens', a); toast('⭐ A en favoritos'); }, 'mini-b'), btn('⭐ Me quedo con B', async () => { b.fav = true; await db.put('gens', b); toast('⭐ B en favoritos'); }, 'mini-b')));
  modal('Comparar', body, { wide: true, onClose: () => { G.sel.clear(); G.compare = false; refresh(); } });
}
export function pickFromGallery(kind) {
  return new Promise(async res => {
    const gens = (await loadGens()).filter(g => g.blob && !g.hidden && (!kind || g.kind === kind)); let picked = null;
    if (!gens.length) { toast('No hay ' + (kind === 'video' ? 'vídeos' : kind === 'image' ? 'imágenes' : kind === 'audio' ? 'audios' : 'elementos') + ' en la galería todavía'); res(null); return; }
    const grid = el('div', { class: 'ggrid sm' }); let close;
    for (const g of gens) grid.append(el('button', { type: 'button', class: 'gitem', on: { click: () => { picked = g; close(); } } }, g.kind === 'audio' ? el('div', { class: 'aud' }, '🔊') : g.thumb || g.kind === 'image' ? el('img', { src: g.thumb ? blobURL(g.thumb) : src(g), alt: '' }) : el('video', { src: src(g), muted: true }), el('div', { class: 'gm' }, el('b', {}, g.modelName))));
    close = modal('Elegir de la galería', grid, { wide: true, onClose: () => res(picked) });
  });
}
function refresh() { if (root && location.hash === '#gallery') renderGallery(root); }
bus.addEventListener('gens', refresh);
