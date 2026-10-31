// 👤 Personajes: fichas con descripción e imágenes de referencia para mantener la identidad entre planos.
import { el, btn, toast, modal, db, uid, blobURL, confirmBox } from './core.js';
import { pickFromGallery } from './gallery.js';

export async function loadChars() { return (await db.all('chars')).sort((a, b) => a.name.localeCompare(b.name)); }
let root = null;
export async function renderChars(r) {
  root = r; r.innerHTML = ''; const cs = await loadChars();
  r.append(el('section', { class: 'card' }, el('h3', {}, 'Personajes'), el('p', { class: 'note' }, 'Ponle el mismo nombre que al muñeco del plató. En el Estudio, al marcarlo, su descripción se añade al prompt y sus imágenes se envían como referencia a los modelos que lo admiten.'),
    el('div', { class: 'row-btns' }, btn('➕ Nuevo personaje', () => edit(null), 'b on'))));
  if (!cs.length) { r.append(el('div', { class: 'empty big' }, 'Aún no hay personajes. Crea uno y dale una descripción concreta: edad, ropa, peinado, rasgos.')); return; }
  const grid = el('div', { class: 'chargrid' });
  for (const c of cs) grid.append(el('button', { type: 'button', class: 'char', on: { click: () => edit(c) } }, c.images && c.images[0] ? el('img', { src: blobURL(c.images[0]), alt: '' }) : el('div', { class: 'ph' }, '👤'), el('b', {}, c.name), el('small', {}, (c.desc || '').slice(0, 80))));
  r.append(grid);
}
function edit(c) {
  const ch = c ? { ...c, images: [...(c.images || [])] } : { id: uid(), name: '', desc: '', images: [] };
  const body = el('div', { class: 'charedit' }); let close;
  const draw = () => { body.innerHTML = '';
    const name = el('input', { class: 'txt', placeholder: 'Nombre (igual que en el plató, p. ej. Ana)', value: ch.name, on: { input: e => ch.name = e.target.value } });
    const desc = el('textarea', { class: 'txt', rows: 4, placeholder: 'Mujer de 30 años, pelo corto negro, chaqueta de cuero roja, vaqueros, botas…' }); desc.value = ch.desc; desc.addEventListener('input', () => ch.desc = desc.value);
    const file = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, on: { change: e => { ch.images.push(...e.target.files); draw(); } } });
    const imgs = el('div', { class: 'refimgs' }, ch.images.map((b, i) => el('div', { class: 'ref' }, el('img', { src: blobURL(b), alt: '' }), btn('✕', () => { ch.images.splice(i, 1); draw(); }, 'x'))));
    body.append(name, el('div', { class: 'gap' }), desc, el('div', { class: 'lbl' }, 'Imágenes de referencia (la primera es la principal)'), imgs, file,
      el('div', { class: 'row-btns' }, btn('📁 Subir', () => file.click(), 'mini-b'), btn('🖼 De la galería', async () => { const g = await pickFromGallery('image'); if (g) { ch.images.push(g.blob); draw(); } }, 'mini-b'),
        btn('🎨 Crearla en el Estudio', async () => { const { ST } = await import('./studio.js'); ST.mode = 't2i'; ST.prompt = `Character reference sheet, full body front view and close-up portrait, neutral background: ${ch.desc || ch.name}`; close(); location.hash = '#studio'; toast('Genera la imagen y luego añádela desde la galería'); }, 'mini-b')),
      el('div', { class: 'acts' }, c ? btn('🗑 Borrar', async () => { if (await confirmBox('Borrar personaje', `¿Borrar a ${c.name}?`, 'Borrar')) { await db.del('chars', c.id); close(); renderChars(root); } }, 'b red') : null,
        btn('Guardar', async () => { if (!ch.name.trim()) { toast('Ponle un nombre'); return; } ch.name = ch.name.trim(); await db.put('chars', ch); close(); renderChars(root); toast('👤 Guardado'); }, 'b on'))); };
  draw(); close = modal(c ? c.name : 'Nuevo personaje', body);
}
