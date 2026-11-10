// 🏷 Marcas: un proyecto de marca lo une todo. Kit de marca → productos y envases → anuncio en tomas low-poly → dar vida con IA.
import { el, btn, toast, seg, uid, db, getSettings, host, emit, confirmBox, modal, download, copyText, blobURL } from './core.js';
import { llmJSON, llmReady } from './llm.js';
import { drawLogo, logoSVG, drawLabel, drawEndCard, FONTS, pal, ink } from './brandart.js';
import { catalog, readiness } from './providers.js';
import { runJob } from './runner.js';

/* ---------- Vocabulario del plató de anuncios (lo que el escenario sabe hacer) ---------- */
export const SETS = [['estudio', 'Estudio (fondo de marca)'], ['color', 'Fondo del color del sabor'], ['huerta', 'Huerta'], ['cocina', 'Cocina'], ['picnic', 'Picnic']];
export const CAMERAS = [['dolly_in', 'Acercamiento'], ['crane_up', 'Grúa que sube'], ['orbit', 'Órbita'], ['push_macro', 'Macro'], ['slide', 'Travelling lateral'], ['top_down', 'Cenital'], ['hero_low', 'Contrapicado de héroe'], ['static', 'Fija']];
export const ACTIONS = [['grow', 'Brotan los ingredientes'], ['slice', 'Se cortan en láminas que vuelan'], ['rain_stack', 'Llueven y se apilan'], ['spin_fill', 'El envase gira y se llena'], ['open_burst', 'Se abre: explosión y confeti'], ['lineup', 'Cierre: gama + logo + eslogan'], ['float', 'Producto flotando']];

/* ---------- Ejemplo: Colorín (marca inventada) ---------- */
const P = (id, name, veg, color, claim) => ({ id, name, veg, color, claim, weight: '110 g' });
export const COLORIN = {
  id: 'brand-colorin', kind: 'brand', example: true, brief: 'Crujientes apilables en tubo, como unas patatas de bote, pero hechos solo de verduras de todos los colores y sabores.',
  kit: {
    name: 'Colorín', tagline: 'Colorín, colorado… ¡y crujiente!', claim: 'Crujientes de huerta', badge: 'Cero patata',
    story: 'Seis verduras de verdad cortadas en láminas finísimas, horneadas y apiladas en un tubo. Cada color es una verdura y cada verdura sabe a sí misma.',
    tone: 'Alegre, juguetón y cercano, con guiños de cuento («érase una vez»). Frases cortas. Nunca culpabiliza: el snack sano también es divertido.',
    audience: 'Familias y jóvenes que quieren picar algo rico sin renunciar a la verdura.', values: ['Color', 'Huerta', 'Diversión', 'Sin trampas'],
    palette: [{ role: 'fondo', name: 'Hueso', hex: '#fff8ec' }, { role: 'texto', name: 'Tinta', hex: '#1e1b2e' }, { role: 'acento', name: 'Rojo tomate', hex: '#e8433a' }, { role: 'hoja', name: 'Brote', hex: '#2e9e4f' }],
    type: { display: 'rounded', body: 'grotesk' }, logo: { text: 'colorín', style: 'multicolor', mark: 'sprout' }, packaging: { kind: 'tube' },
    products: [P('remolacha', 'Remolacha', 'remolacha', '#c2185b', 'Dulce y terrosa'), P('zanahoria', 'Zanahoria', 'zanahoria', '#f57c00', 'Dulce y soleada'), P('espinaca', 'Espinaca', 'espinaca', '#2e9e4f', 'Fresca y suave'),
      P('calabaza', 'Calabaza', 'calabaza', '#f2b705', 'Tostada y cremosa'), P('lombarda', 'Lombarda', 'lombarda', '#6a3fa0', 'Intensa y crujiente'), P('arcoiris', 'Arcoíris', 'mix', '#e8433a', 'Las seis a la vez')] },
  campaign: { concept: 'La huerta en un tubo: un cuento de 30 segundos donde las verduras sueñan con ser crujientes.', spots: [{ id: 'spot1', title: 'La huerta en un tubo', format: '16:9', music: 'Ukelele alegre con palmas, sube en el cierre', shots: [
    { id: 's1', title: 'Érase una huerta', dur: 5, set: 'huerta', camera: 'crane_up', action: 'grow', flavor: 'all', vo: 'Érase una vez una huerta…', onscreen: '',
      prompt: 'Sunrise over a playful vegetable garden: rows of beetroot, carrots, spinach, pumpkins and red cabbage pop out of the soil one after another. Crane shot rising slowly. Warm golden light, bright saturated colours, stylised commercial look, gentle morning haze.' },
    { id: 's2', title: 'Quería ser crujiente', dur: 5, set: 'cocina', camera: 'dolly_in', action: 'slice', flavor: 'all', vo: '…que quería ser crujiente.', onscreen: '',
      prompt: 'On a bright kitchen counter with white and red tiles, vegetables are sliced into paper-thin colourful slices that fly through the air towards camera and turn into crisp wavy chips. Slow dolly in, crisp food commercial lighting, shallow depth of field.' },
    { id: 's3', title: 'Seis colores', dur: 5, set: 'estudio', camera: 'orbit', action: 'rain_stack', flavor: 'all', vo: 'Seis verduras. Seis colores.', onscreen: 'Seis verduras · Seis colores',
      prompt: 'Magenta, orange, green, yellow and purple saddle-shaped vegetable crisps rain down on a cream studio sweep and stack into a rainbow arc of six columns. Slow orbit, soft studio light, macro detail of the crisp texture.' },
    { id: 's4', title: 'Todo huerta', dur: 5, set: 'estudio', camera: 'push_macro', action: 'spin_fill', flavor: 'arcoiris', vo: 'Cero patata. Todo huerta.', onscreen: 'Cero patata',
      prompt: 'A cream-coloured crisp tube with a wavy red band and the multicolour rounded lowercase logo “colorín” spins slowly while colourful vegetable crisps fly in arcs into its open top; the lid floats above. Macro push-in, premium product commercial lighting. Keep the packaging design exactly as the reference.' },
    { id: 's5', title: 'Abre uno', dur: 5, set: 'picnic', camera: 'hero_low', action: 'open_burst', flavor: 'remolacha', vo: 'Abre uno y…', onscreen: '',
      prompt: 'Summer picnic on green grass with a red and white checked blanket: the magenta Colorín crisp tube pops its lid with a satisfying crunch, colourful crisps and confetti burst into the air. Low hero angle, joyful energy, bright daylight. Keep the packaging design exactly as the reference.' },
    { id: 's6', title: 'Colorín, colorado', dur: 5, set: 'estudio', camera: 'dolly_in', action: 'lineup', flavor: 'all', vo: 'Colorín, colorado… ¡y crujiente!', onscreen: '',
      prompt: 'End card: six Colorín crisp tubes in magenta, orange, green, yellow, purple and red stand in a row on a cream studio sweep and rise into place one by one; the multicolour logo “colorín” with a green sprout on the í appears above with the slogan. Clean, bright, premium commercial finish. Keep the packaging design exactly as the reference.' } ] }] },
};

/* ---------- Datos ---------- */
const L = { cur: null, tab: 'marca', spot: 0, shot: 0, frame: null, frameReady: null };
export async function brandsList() { const all = (await db.all('projects')).filter(p => p.kind === 'brand').sort((a, b) => b.t - a.t); if (!all.some(b => b.id === COLORIN.id)) { const c = { ...structuredClone(COLORIN), t: 0, created: Date.now() }; await db.put('projects', c); all.push(c); } return all; }
export async function brandGet(id) { let b = await db.get('projects', id); if (!b && id === COLORIN.id) { await brandsList(); b = await db.get('projects', id); } if (!b) throw new Error('No encuentro esa marca: ' + id); return b; }
export async function brandSave(b) { b.t = Date.now(); await db.put('projects', b); emit('brands'); return b; }
const spotOf = b => ((b.campaign || {}).spots || [])[L.spot] || ((b.campaign || {}).spots || [])[0];

/* ---------- IA: de un brief a la marca completa ---------- */
export async function brandCreate({ brief, name }) {
  if (!llmReady()) throw new Error('Necesito la IA: configúrala en Ajustes (o abre Plató dentro de Claude)');
  const prompt = `Eres director creativo de una agencia. A partir de este brief crea una marca ORIGINAL (no copies nombres, logos, mascotas ni eslóganes de marcas existentes) y su primera campaña. Todo en español salvo los "prompt" de cada toma, que van en inglés para el modelo de vídeo.
Brief: «${String(brief).slice(0, 1200)}»${name ? `\nNombre deseado: ${name}` : ''}
Devuelve SOLO JSON:
{"kit":{"name":"…","tagline":"eslogan corto","claim":"subtítulo para el envase (3-4 palabras)","badge":"insignia de 1-3 palabras o vacío","story":"2 frases","tone":"cómo habla la marca","audience":"…","values":["…"],
"palette":[{"role":"fondo","name":"…","hex":"#rrggbb"},{"role":"texto","name":"…","hex":"#rrggbb"},{"role":"acento","name":"…","hex":"#rrggbb"},{"role":"hoja","name":"…","hex":"#rrggbb"}],
"type":{"display":"${Object.keys(FONTS).join('|')}","body":"grotesk|rounded|geometric|serif"},"logo":{"text":"logotipo (puede ir en minúsculas)","style":"multicolor|solid|badge","mark":"sprout|sun|drop|star|leaf|spark|none"},
"packaging":{"kind":"tube|can"},"products":[{"id":"slug","name":"…","veg":"ingrediente principal (zanahoria, remolacha, espinaca, calabaza, lombarda, fresa, limón…)","color":"#rrggbb","claim":"2-4 palabras","weight":"110 g"}]},
"campaign":{"concept":"1 frase","spots":[{"id":"spot1","title":"…","format":"16:9","music":"…","shots":[{"id":"s1","title":"…","dur":5,"set":"${SETS.map(s => s[0]).join('|')}","camera":"${CAMERAS.map(s => s[0]).join('|')}","action":"${ACTIONS.map(s => s[0]).join('|')}","flavor":"id de producto o all","vo":"frase de voz en off","onscreen":"texto corto en pantalla o vacío","prompt":"English prompt for an image-to-video model describing this exact shot, the product packaging and the look"}]}]}}
Reglas: 3 a 6 productos con colores bien distintos; fondo claro y texto oscuro con buen contraste; el spot dura 20-30 s en 4-6 tomas de 5 s, con un arco claro (gancho, producto, beneficio, cierre); la última toma es "lineup" con el logo y el eslogan; cada prompt describe el envase con sus colores y su logo para que el vídeo respete la marca.`;
  const j = await llmJSON(prompt, { maxTokens: 6000 }); if (!j || !j.kit || !j.kit.name) throw new Error('La IA no ha devuelto una marca válida');
  const b = { id: 'brand-' + uid(), kind: 'brand', created: Date.now(), brief, kit: sanitizeKit(j.kit), campaign: j.campaign || { spots: [] }, renders: {} };
  for (const sp of b.campaign.spots || []) sp.shots = (sp.shots || []).slice(0, 8).map((s, i) => ({ id: s.id || 's' + (i + 1), dur: 5, ...s })); return await brandSave(b);
}
function sanitizeKit(k) { const hex = c => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : null; k.palette = (k.palette || []).filter(p => hex(p.hex)).slice(0, 8); k.products = (k.products || []).filter(p => p && p.name).slice(0, 8).map((p, i) => ({ ...p, id: String(p.id || 'p' + i).replace(/[^\w-]/g, '').slice(0, 24) || 'p' + i, color: hex(p.color) || ['#e11d48', '#f97316', '#16a34a', '#2563eb', '#a855f7', '#f2b705'][i % 6] }));
  k.type = { display: FONTS[(k.type || {}).display] ? k.type.display : 'rounded', body: FONTS[(k.type || {}).body] ? k.type.body : 'grotesk' }; k.logo = { text: (k.logo && k.logo.text) || k.name, style: ['multicolor', 'solid', 'badge'].includes((k.logo || {}).style) ? k.logo.style : 'solid', mark: (k.logo || {}).mark || 'none' }; return k; }

/* ---------- Prompts para dar vida ---------- */
// Los modelos de vídeo no entienden hex: lo traduzco a un nombre de color en inglés.
function colorName(hex) { const h = String(hex || '').replace('#', ''); if (h.length !== 6) return 'brand-coloured'; const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l < 0.18) return 'near-black'; if (sat < 0.18) return l > 0.9 ? 'white' : l > 0.75 ? (r > b ? 'cream' : 'light grey') : l > 0.35 ? 'grey' : 'charcoal';
  let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360;
  if (l > 0.85) return hue < 70 || hue > 330 ? 'cream' : 'pale ' + (hue < 170 ? 'mint' : hue < 260 ? 'blue' : 'lilac');
  const base = hue < 12 ? 'red' : hue < 35 ? 'orange' : hue < 52 ? 'golden yellow' : hue < 68 ? 'yellow' : hue < 160 ? 'green' : hue < 195 ? 'teal' : hue < 250 ? 'blue' : hue < 290 ? 'purple' : hue < 345 ? 'magenta' : 'red';
  return (l < 0.3 ? 'deep ' : '') + base; }
export function shotPrompt(b, shot) { const k = b.kit; const p = (k.products || []).find(x => x.id === shot.flavor);
  const pack = `${k.packaging && k.packaging.kind === 'can' ? 'can' : 'tall cylindrical tube'} in ${colorName(pal(k, 'fondo', '#fff8ec'))} with a wavy ${p ? colorName(p.color) : 'flavour-coloured'} band, matching lid and the ${k.logo.style === 'multicolor' ? 'multicolour ' : ''}logo “${k.logo.text}”`;
  return `${String(shot.prompt || shot.title).trim().replace(/[.\s]+$/, '')}. Brand: ${k.name}${k.claim ? ` (${k.claim})` : ''}. Packaging: ${pack}. Mood: ${String(k.tone || '').split(/[.,]/)[0]}. 5-second commercial shot, no subtitles, no extra text or logos beyond the brand.`; }

/* ---------- Plató de anuncios (iframe) ---------- */
function stage() { const f = el('iframe', { class: 'br-stage', src: 'ads.html', title: 'Plató de anuncios', allow: 'autoplay' }); L.frame = f; L.frameReady = new Promise(res => { const on = e => { if (e.source === f.contentWindow && e.data && e.data.type === 'ads-ready') { removeEventListener('message', on); res(); } }; addEventListener('message', on); }); return f; }
async function post(m) { if (!L.frame) return; await L.frameReady; L.frame.contentWindow.postMessage(m, '*'); }
function ask(m, type) { return new Promise((res, rej) => { const id = uid(); const on = e => { const d = e.data || {}; if (e.source !== (L.frame && L.frame.contentWindow) || d.id !== id) return; if (d.type === 'ads-error') { removeEventListener('message', on); rej(new Error(d.error)); } if (d.type === type) { removeEventListener('message', on); res(d); } }; addEventListener('message', on); post({ ...m, id }); setTimeout(() => { removeEventListener('message', on); rej(new Error('El plató de anuncios no responde')); }, 60000); }); }
async function keyframe(b, shot) { const d = await ask({ type: 'keyframe', shot }, 'keyframe'); const blob = await (await fetch(d.png)).blob(); b.renders = b.renders || {}; b.renders[shot.id] = { ...(b.renders[shot.id] || {}), key: blob, keyT: Date.now() }; await brandSave(b); return blob; }

/* ---------- Pantallas ---------- */
export async function renderBrands(r) { if (L.cur) { try { return await brandPage(r, await brandGet(L.cur)); } catch (e) { L.cur = null; } } return brandList(r); }
async function brandList(r) { L.frame = null;
  const brief = el('textarea', { class: 'txt', rows: 3, placeholder: 'Cuéntame la marca en una o dos frases: qué vende, a quién, cómo se siente. Ej.: «helados de frutas raras para adultos, envase de lata, tono gamberro»' });
  const go = async e => { const t = brief.value.trim(); if (t.length < 8) return toast('Cuéntame un poco más de la marca'); const b0 = e.currentTarget; b0.disabled = true; toast('🏷 Creando la marca, sus productos y su primer anuncio…', 60000); try { const b = await brandCreate({ brief: t }); toast('✅ Marca lista'); L.cur = b.id; L.tab = 'marca'; renderBrands(r); } catch (er) { toast('⚠️ ' + er.message, 6000); } finally { b0.disabled = false; } };
  r.innerHTML = ''; r.append(el('section', { class: 'card br-hero' }, el('div', { class: 'h-badge' }, 'MARCAS'), el('h2', {}, '🏷 De una idea a su anuncio'), el('p', { class: 'note' }, 'Crea el branding de una marca, diseña sus envases, rueda el anuncio en low-poly con el envase de verdad y dale vida con IA. Todo sale del mismo kit de marca.'), brief, el('div', { class: 'row-btns' }, btn('✨ Crear marca', go, 'b hot'))));
  const list = await brandsList(); const grid = el('div', { class: 'br-grid' });
  for (const b of list) { const c = el('canvas', { width: 600, height: 180, class: 'br-logo' }); drawLogo(c.getContext('2d'), b.kit, 300, 90, 560, 150);
    grid.append(el('div', { class: 'br-card', on: { click: () => { L.cur = b.id; L.tab = 'marca'; L.spot = 0; L.shot = 0; renderBrands(r); } } }, el('div', { class: 'br-card-top', style: `background:${pal(b.kit, 'fondo', '#fff8ec')}` }, c, el('div', { class: 'br-chips' }, ...(b.kit.products || []).map(p => el('span', { style: `background:${p.color}`, title: p.name })))), el('b', {}, b.kit.name + (b.example ? ' · ejemplo' : '')), el('small', {}, b.kit.tagline || ''))); }
  r.append(el('h3', { class: 'sec' }, 'Tus marcas'), grid);
}
async function brandPage(r, b) { r.innerHTML = ''; const k = b.kit;
  const head = el('div', { class: 'br-head', style: `background:${pal(k, 'fondo', '#fff8ec')};color:${pal(k, 'texto', '#1e1b2e')}` }); const lc = el('canvas', { width: 900, height: 240, class: 'br-logo big' }); drawLogo(lc.getContext('2d'), k, 450, 120, 820, 200);
  head.append(el('a', { href: '#brands', class: 'br-back', on: { click: e => { e.preventDefault(); L.cur = null; renderBrands(r); } } }, '← Marcas'), lc, el('div', { class: 'br-tag' }, k.tagline || ''));
  const body = el('div', { class: 'br-body' }); const tabs = seg([['marca', '🎨 Marca'], ['productos', '🥫 Productos'], ['anuncio', '🎬 Anuncio'], ['vida', '✨ Dar vida']], () => L.tab, v => { L.tab = v; draw(); });
  const st = stage(); const stBox = el('div', { class: 'br-stagebox' }, st); r.append(head, tabs, stBox, body);
  post({ type: 'kit', kit: k });
  async function draw() { body.innerHTML = ''; stBox.hidden = L.tab === 'marca'; if (L.tab === 'marca') tabMarca(); else if (L.tab === 'productos') { post({ type: 'showroom' }); tabProductos(); } else if (L.tab === 'anuncio') tabAnuncio(); else tabVida(); }
  const save = async () => { await brandSave(b); post({ type: 'kit', kit: b.kit }); };
  function field(label, get, set, { area = false, max = 300 } = {}) { const i = el(area ? 'textarea' : 'input', { class: 'txt', maxlength: max, rows: area ? 3 : undefined }); i.value = get() || ''; i.addEventListener('change', async () => { set(i.value.trim()); await save(); }); return el('div', { class: 'cl-row' }, el('div', { class: 'lbl' }, label), i); }
  function tabMarca() {
    const sw = el('div', { class: 'br-pal' }, ...(k.palette || []).map(p => { const c = el('input', { type: 'color', value: p.hex }); c.addEventListener('change', async () => { p.hex = c.value; await save(); renderBrands(r); }); return el('label', { class: 'br-sw' }, c, el('b', {}, p.name), el('small', {}, `${p.role} · ${p.hex}`)); }));
    const fontRow = el('div', { class: 'br-fonts' }, el('div', { style: `font-family:${FONTS[k.type.display].css};font-weight:${FONTS[k.type.display].weight};font-size:30px` }, k.name), el('div', { style: `font-family:${FONTS[k.type.body].css}` }, 'Texto de la marca · ' + (k.claim || '')));
    body.append(el('section', { class: 'card' }, el('h3', {}, 'Identidad'), field('Nombre', () => k.name, v => { k.name = v; }), field('Eslogan', () => k.tagline, v => { k.tagline = v; }), field('Subtítulo del envase', () => k.claim, v => { k.claim = v; }), field('Historia', () => k.story, v => { k.story = v; }, { area: true, max: 500 }), field('Tono de voz', () => k.tone, v => { k.tone = v; }, { area: true, max: 500 }), field('Público', () => k.audience, v => { k.audience = v; })),
      el('section', { class: 'card' }, el('h3', {}, 'Paleta'), sw),
      el('section', { class: 'card' }, el('h3', {}, 'Tipografía y logo'), fontRow,
        el('div', { class: 'cl-row' }, el('div', { class: 'lbl' }, 'Letra del logo'), seg(Object.entries(FONTS).map(([id, f]) => [id, f.label]), () => k.type.display, async v => { k.type.display = v; await save(); renderBrands(r); })),
        el('div', { class: 'cl-row' }, el('div', { class: 'lbl' }, 'Estilo del logo'), seg([['multicolor', 'Multicolor'], ['solid', 'Liso'], ['badge', 'Insignia']], () => k.logo.style, async v => { k.logo.style = v; await save(); renderBrands(r); })),
        el('div', { class: 'cl-row' }, el('div', { class: 'lbl' }, 'Símbolo'), seg([['sprout', '🌱'], ['sun', '☀️'], ['drop', '💧'], ['star', '⭐'], ['leaf', '🍃'], ['spark', '✨'], ['none', 'Nada']], () => k.logo.mark, async v => { k.logo.mark = v; await save(); renderBrands(r); })),
        el('div', { class: 'row-btns' }, btn('⬇ Logo SVG', () => download(new Blob([logoSVG(k)], { type: 'image/svg+xml' }), slug(k.name) + '-logo.svg'), 'mini-b'), btn('⬇ Logo PNG', () => { const c = el('canvas', { width: 2000, height: 600 }); drawLogo(c.getContext('2d'), k, 1000, 300, 1900, 500); c.toBlob(bl => download(bl, slug(k.name) + '-logo.png')); }, 'mini-b'), btn('⬇ Guía de marca', () => download(new Blob([guide(b)], { type: 'text/markdown' }), slug(k.name) + '-guia.md'), 'mini-b'))),
      el('section', { class: 'card' }, el('h3', {}, 'Brief'), el('p', { class: 'note' }, b.brief || ''), b.example ? '' : el('div', { class: 'row-btns' }, btn('🗑 Borrar marca', async () => { if (await confirmBox('Borrar marca', `¿Borrar «${k.name}» y su campaña?`, 'Borrar')) { await db.del('projects', b.id); L.cur = null; renderBrands(r); } }, 'mini-b')))); }
  function tabProductos() { const grid = el('div', { class: 'br-prods' });
    for (const p of k.products || []) { const c = el('canvas', {}); drawLabel(c, k, p, { w: 1024, h: 512 }); const col = el('input', { type: 'color', value: p.color }); col.addEventListener('change', async () => { p.color = col.value; await save(); draw(); });
      const nm = el('input', { class: 'txt sm', value: p.name, maxlength: 24 }); nm.addEventListener('change', async () => { p.name = nm.value.trim() || p.name; await save(); draw(); });
      grid.append(el('div', { class: 'br-prod' }, el('div', { class: 'br-label' }, c), el('div', { class: 'inrow' }, col, nm), el('small', {}, `${p.veg || ''} · ${p.claim || ''}`), btn('⬇ Etiqueta', () => c.toBlob(bl => download(bl, `${slug(k.name)}-${p.id}-etiqueta.png`)), 'mini-b'))); }
    body.append(el('section', { class: 'card' }, el('h3', {}, `Productos (${(k.products || []).length})`), el('p', { class: 'note' }, 'La etiqueta da la vuelta al envase: el centro es el frontal. Arriba los ves en 3D; cambia un color o un nombre y se redibuja todo.'), grid)); }
  function tabAnuncio() { const sp = spotOf(b); if (!sp) { body.append(el('div', { class: 'empty' }, 'Esta marca aún no tiene anuncio.')); return; } const shots = sp.shots || []; L.shot = Math.min(L.shot, shots.length - 1);
    const playShot = (i, loop = true) => { L.shot = i; post({ type: 'shot', shot: shots[i], play: true, loop }); for (const x of list.children) x.classList.toggle('on', +x.dataset.i === i); };
    const list = el('div', { class: 'br-shots' }); shots.forEach((s, i) => { const kf = b.renders && b.renders[s.id] && b.renders[s.id].key; list.append(el('div', { class: 'br-shot' + (i === L.shot ? ' on' : ''), 'data-i': i, on: { click: () => playShot(i) } }, kf ? el('img', { src: blobURL(kf) }) : el('div', { class: 'br-ph' }, `${i + 1}`), el('div', {}, el('b', {}, `${i + 1}. ${s.title}`), el('small', {}, `${s.dur}s · ${lab(CAMERAS, s.camera)} · ${lab(ACTIONS, s.action)}`), el('small', { class: 'vo' }, s.vo ? '🎙 ' + s.vo : '')))); });
    const all = btn('▶ Ver el spot entero', async () => { for (let i = 0; i < shots.length; i++) { playShot(i, false); sayVO(shots[i].vo); await new Promise(res => { const on = e => { if (e.data && e.data.type === 'ads-ended') { removeEventListener('message', on); res(); } }; addEventListener('message', on); setTimeout(res, (shots[i].dur || 5) * 1000 + 1500); }); } }, 'b hot');
    const kfs = btn('📸 Sacar fotogramas clave', async e => { const b0 = e.currentTarget; b0.disabled = true; try { for (const s of shots) { toast(`📸 ${s.title}…`); await keyframe(b, s); } toast('✅ Fotogramas listos'); draw(); } catch (er) { toast('⚠️ ' + er.message); } finally { b0.disabled = false; } }, 'b on');
    const s = shots[L.shot]; const edit = el('section', { class: 'card' }, el('h3', {}, `Toma ${L.shot + 1}`),
      field('Título', () => s.title, v => { s.title = v; }), selRow('Decorado', SETS, () => s.set, v => { s.set = v; }), selRow('Cámara', CAMERAS, () => s.camera, v => { s.camera = v; }), selRow('Acción', ACTIONS, () => s.action, v => { s.action = v; }),
      selRow('Producto', [['all', 'Toda la gama'], ...(k.products || []).map(p => [p.id, p.name])], () => s.flavor, v => { s.flavor = v; }), field('Voz en off', () => s.vo, v => { s.vo = v; }), field('Texto en pantalla', () => s.onscreen, v => { s.onscreen = v; }));
    function selRow(label, opts, get, set) { const sel = el('select', { class: 'txt' }, ...opts.map(([v, l]) => { const o = el('option', { value: v }, l); if (v === get()) o.selected = true; return o; })); sel.addEventListener('change', async () => { set(sel.value); await save(); playShot(L.shot); }); return el('div', { class: 'cl-row' }, el('div', { class: 'lbl' }, label), sel); }
    body.append(el('section', { class: 'card' }, el('h3', {}, sp.title), el('p', { class: 'note' }, (b.campaign && b.campaign.concept || '') + (sp.music ? ` · Música: ${sp.music}` : '')), el('div', { class: 'row-btns' }, all, kfs), list), edit); playShot(L.shot); }
  function tabVida() { const sp = spotOf(b); if (!sp) { body.append(el('div', { class: 'empty' }, 'Primero crea el anuncio.')); return; } const shots = sp.shots || [];
    const via = vidaVia(); body.append(el('section', { class: 'card' }, el('h3', {}, 'Dar vida con IA'), el('p', { class: 'note' }, via.note),
      el('div', { class: 'row-btns' }, btn('📋 Copiar todos los prompts', () => copyText(shots.map((s, i) => `Toma ${i + 1} (${s.dur}s): ${shotPrompt(b, s)}`).join('\n\n')), 'mini-b'), btn('🤖 Pedírselo a Claude', () => copyText(claudeAsk(b, sp)), 'mini-b'))));
    shots.forEach((s, i) => { const rd = (b.renders || {})[s.id] || {}; const pr = el('textarea', { class: 'txt', rows: 3 }); pr.value = rd.prompt || shotPrompt(b, s); pr.addEventListener('change', async () => { b.renders = b.renders || {}; b.renders[s.id] = { ...(b.renders[s.id] || {}), prompt: pr.value }; await brandSave(b); });
      const out = el('div', { class: 'br-out' }); if (rd.video) out.append(videoEl(rd.video)); else if (rd.key) out.append(el('img', { src: blobURL(rd.key) }));
      const go = btn('✨ Dar vida', async e => { const b0 = e.currentTarget; b0.disabled = true; try { const v = await giveLife(b, s, pr.value, msg => { b0.textContent = msg; }); out.innerHTML = ''; out.append(videoEl(v)); toast('✅ Toma lista'); } catch (er) { toast('⚠️ ' + er.message, 7000); } finally { b0.disabled = false; b0.textContent = '✨ Dar vida'; } }, 'b hot'); go.disabled = !via.ok;
      body.append(el('section', { class: 'card br-life' }, el('h3', {}, `${i + 1}. ${s.title}`), out, pr, el('div', { class: 'row-btns' }, go, btn('📸 Fotograma', async () => { await keyframe(b, s); draw(); }, 'mini-b')))); }); }
  draw();
}
const lab = (opts, v) => (opts.find(o => o[0] === v) || [v, v])[1];
const slug = s => String(s || 'marca').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function sayVO(t) { try { if (!t || !('speechSynthesis' in window)) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'es-ES'; window.__brVO = u; speechSynthesis.speak(u); } catch (e) {} }
function videoEl(v) { if (v instanceof Blob) return el('video', { src: blobURL(v), controls: true, playsinline: true, loop: true }); const wrap = el('div', {}); const vid = el('video', { src: v, controls: true, playsinline: true, loop: true }); vid.addEventListener('error', () => { wrap.innerHTML = ''; wrap.append(el('a', { href: v, target: '_blank', rel: 'noopener', class: 'b on' }, '▶ Ver el vídeo en Higgsfield')); }); wrap.append(vid); return wrap; }
function guide(b) { const k = b.kit; return [`# ${k.name} · Guía de marca`, '', `**Eslogan:** ${k.tagline}`, `**Subtítulo:** ${k.claim || ''}`, '', '## Historia', k.story || '', '', '## Tono de voz', k.tone || '', '', '## Público', k.audience || '', '', '## Valores', ...(k.values || []).map(v => '- ' + v), '', '## Paleta', ...(k.palette || []).map(p => `- **${p.name}** (${p.role}): ${p.hex}`), '', '## Tipografía', `- Titulares: ${FONTS[k.type.display].label} (${FONTS[k.type.display].css})`, `- Texto: ${FONTS[k.type.body].label} (${FONTS[k.type.body].css})`, '', '## Logo', `- Texto: «${k.logo.text}» · estilo ${k.logo.style} · símbolo ${k.logo.mark}`, '', '## Productos', ...(k.products || []).map(p => `- **${p.name}** · ${p.color} · ${p.veg || ''} · ${p.claim || ''}`), '', '## Campaña', b.campaign && b.campaign.concept || '', ...((b.campaign || {}).spots || []).flatMap(sp => ['', `### ${sp.title}`, ...(sp.shots || []).map((s, i) => `${i + 1}. **${s.title}** (${s.dur}s) — ${s.vo || ''}`)])].join('\n'); }
function claudeAsk(b, sp) { return `Usa tu conector de Higgsfield para dar vida al anuncio «${sp.title}» de la marca ${b.kit.name}. Para cada toma: primero genera una imagen de producto con gpt_image_2 (16:9) siguiendo la descripción del envase, y después un vídeo de 5 s con seedance_2_0_mini a 720p usando esa imagen como start_image. Dime antes cuántos créditos va a costar.\n\n` + (sp.shots || []).map((s, i) => `Toma ${i + 1}: ${shotPrompt(b, s)}`).join('\n\n'); }

/* ---------- Dar vida: clave de API (app) o tu conector de Higgsfield (dentro de Claude) ---------- */
function vidaVia() { const m = catalog().find(x => x.id === 'hf-seedance2-i2v'); if (m && readiness(m).ok) return { ok: true, kind: 'api', model: m, note: 'Usaré tu clave de Higgsfield (Seedance 2.0, imagen a vídeo) con el fotograma clave de cada toma como primera imagen. Se cobra en tu cuenta de Higgsfield.' };
  if (host.claude) return { ok: true, kind: 'mcp', note: 'Dentro de Claude uso tu conector de Higgsfield: primero genera una imagen de producto con la marca y después el vídeo de 5 s a partir de ella. Antes de gastar te digo cuántos créditos cuesta.' };
  return { ok: false, note: 'Para generar aquí necesitas la clave de Higgsfield en Ajustes, o abrir Plató dentro de Claude con tu conector de Higgsfield. Mientras, puedes copiar los prompts o pedírselo a Claude en el chat.' }; }
async function giveLife(b, shot, prompt, onStatus = () => {}) { const via = vidaVia(); if (!via.ok) throw new Error(via.note); let rd = (b.renders || {})[shot.id] || {}; let v;
  if (via.kind === 'api') { if (!rd.key) { onStatus('📸 Fotograma…'); await keyframe(b, shot); rd = b.renders[shot.id]; }
    const job = runJob({ provider: 'higgsfield', endpoint: via.model.endpoint, name: via.model.name, kind: 'video', est: 0, mode: 'brand', label: `🏷 ${b.kit.name} · ${shot.title}`, input: { prompt, image_url: rd.key, duration: shot.dur || 5, aspect_ratio: '16:9', resolution: '720p' }, meta: { brand: b.id, shot: shot.id } });
    onStatus('⏳ Generando…'); const g = await job.promise; v = g.blob || g.url; }
  else v = await lifeViaMCP(b, shot, prompt, onStatus);
  b.renders[shot.id] = { ...(b.renders[shot.id] || {}), video: v, prompt, t: Date.now() }; await brandSave(b); return v; }
// Conector de Higgsfield desde la página (capacidad "mcp" de Claude): sin claves; cobra tu cuenta de Higgsfield.
const HF = 'higgsfield';
async function hfCall(tool, input) { const mcp = window.claude && await window.claude.use('mcp'); if (!mcp) throw new Error('Tu conector de Higgsfield no está disponible aquí (actívalo en Claude: Ajustes → Conectores)'); const r = await mcp.callTool(HF, tool, input); return r && (r.payload !== undefined ? r.payload : r); }
const flat = x => { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return ''; } };
const findIds = x => [...new Set((flat(x).match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) || []))];
const findUrl = (x, re) => (flat(x).match(/https:\/\/[^"'\s\\]+/g) || []).find(u => re.test(u));
async function hfWait(jobId, onStatus, kind) { for (let i = 0; i < 80; i++) { const r = await hfCall('jobs_wait', { jobs: [{ index: 0, job_id: jobId }], timeout_seconds: 15 }); const s = flat(r);
    if (/fail|error|nsfw|cancel/i.test(s) && !/"all_terminal"\s*:\s*false/.test(s) && !findUrl(r, /\./)) throw new Error('Higgsfield no ha podido generarlo');
    const u = findUrl(r, kind === 'video' ? /\.(mp4|webm|mov)(\?|$)/i : /\.(png|jpe?g|webp)(\?|$)/i); if (u) return u; onStatus(`⏳ Generando… ${Math.round((i + 1) * 15 / 60)} min`); } throw new Error('Tarda demasiado: míralo luego en tu cuenta de Higgsfield'); }
async function lifeViaMCP(b, shot, prompt, onStatus) {
  const imgP = { model: 'gpt_image_2', prompt: `Product commercial still, 16:9. ${prompt}`, aspect_ratio: '16:9', resolution: '1k', quality: 'medium' }; const vidP = { model: 'seedance_2_0_mini', prompt, duration: shot.dur || 5, resolution: '720p', aspect_ratio: '16:9' };
  onStatus('💶 Calculando coste…'); const c1 = flat(await hfCall('generate_image', { params: { ...imgP, get_cost: true } })), c2 = flat(await hfCall('generate_video', { params: { ...vidP, get_cost: true } }));
  const num = s => { const m = s.match(/([\d.,]+)\s*credit/i); return m ? m[1] : '?'; };
  if (!await confirmBox('✨ Dar vida con Higgsfield', `Esta toma cuesta unos ${num(c1)} + ${num(c2)} créditos de tu cuenta de Higgsfield (imagen de producto + vídeo de ${shot.dur || 5} s). ¿Seguimos?`, 'Generar')) throw new Error('Cancelado');
  onStatus('🖼 Imagen de producto…'); const ri = await hfCall('generate_image', { params: imgP, context: 'Brand product still for a commercial shot made in Plató' }); const imgJob = findIds(ri)[0]; if (!imgJob) throw new Error('Higgsfield no devolvió la imagen: ' + flat(ri).slice(0, 160));
  await hfWait(imgJob, onStatus, 'image');
  onStatus('🎬 Vídeo…'); const rv = await hfCall('generate_video', { params: { ...vidP, medias: [{ role: 'start_image', value: imgJob }] }, context: 'Bring a branded commercial shot to life from its product still' }); const vidJob = findIds(rv).find(x => x !== imgJob); if (!vidJob) throw new Error('Higgsfield no devolvió el vídeo: ' + flat(rv).slice(0, 160));
  return await hfWait(vidJob, onStatus, 'video'); }

/* ---------- API para el MCP y el asistente (sin tocar la pantalla) ---------- */
// Plató de anuncios oculto: si la marca no está abierta en pantalla, monto uno fuera de vista para sacar fotogramas.
async function withStage(b, fn) {
  if (L.frame && L.frame.isConnected && L.cur === b.id) { await post({ type: 'kit', kit: b.kit }); return await fn(); }
  const prev = [L.frame, L.frameReady]; const f = stage(); f.style.cssText = 'position:fixed;left:-3000px;top:0;width:1280px;height:720px;border:0;opacity:0;pointer-events:none';
  document.body.append(f);
  try { await Promise.race([L.frameReady, new Promise((_, rej) => setTimeout(() => rej(new Error('El plató de anuncios no arranca')), 30000))]); await post({ type: 'kit', kit: b.kit }); await new Promise(r => setTimeout(r, 300)); return await fn(); }
  finally { f.remove(); [L.frame, L.frameReady] = prev; }
}
const shotsOf = (b, spot) => { const sps = (b.campaign || {}).spots || []; const sp = (spot != null && sps.find(s => s.id === spot)) || sps[0]; if (!sp) throw new Error('Esta marca no tiene anuncio todavía'); return sp; };
export function brandSummary(b, full = false) { const k = b.kit || {};
  const o = { id: b.id, name: k.name, tagline: k.tagline, products: (k.products || []).map(p => full ? p : { id: p.id, name: p.name, color: p.color }), spots: ((b.campaign || {}).spots || []).map(s => ({ id: s.id, title: s.title, shots: (s.shots || []).length, seconds: (s.shots || []).reduce((a, x) => a + (+x.dur || 5), 0) })), keyframes: Object.keys(b.renders || {}).filter(id => b.renders[id].key), videos: Object.keys(b.renders || {}).filter(id => b.renders[id].video || b.renders[id].videoUrl) };
  if (full) { o.kit = k; o.campaign = b.campaign; o.brief = b.brief; } return o; }
// Mezcla superficial pero útil: kit.* se fusiona, products y spots se sustituyen si vienen, y shot_patch cambia una toma.
export async function brandUpdate(id, { kit, campaign, shot_patch } = {}) { const b = await brandGet(id);
  if (kit) { const merged = { ...b.kit, ...kit, logo: { ...b.kit.logo, ...(kit.logo || {}) }, type: { ...b.kit.type, ...(kit.type || {}) } }; b.kit = sanitizeKit(merged); }
  if (campaign) b.campaign = { ...b.campaign, ...campaign };
  if (shot_patch) { const sp = shotsOf(b, shot_patch.spot); const s = sp.shots.find(x => x.id === shot_patch.id); if (!s) throw new Error('No existe la toma ' + shot_patch.id);
    for (const [k, v] of Object.entries(shot_patch)) if (!['id', 'spot'].includes(k)) s[k] = v;
    for (const [k, list] of [['set', SETS], ['camera', CAMERAS], ['action', ACTIONS]]) if (s[k] && !list.some(x => x[0] === s[k])) throw new Error(`${k} «${s[k]}» no existe. Opciones: ${list.map(x => x[0]).join(', ')}`); }
  return await brandSave(b); }
export async function brandKeyframes(id, { spot, shots } = {}) { const b = await brandGet(id); const sp = shotsOf(b, spot); const list = sp.shots.filter(s => !shots || !shots.length || shots.includes(s.id));
  const out = []; await withStage(b, async () => { for (const s of list) out.push({ shot: s, blob: await keyframe(b, s) }); }); return out; }
export function brandPrompts(b, spot) { const sp = shotsOf(b, spot); return sp.shots.map(s => ({ id: s.id, title: s.title, dur: s.dur || 5, vo: s.vo || '', onscreen: s.onscreen || '', prompt: shotPrompt(b, s) })); }
export function brandGuide(b) { return guide(b); }
export { logoSVG };
export function brandOpen(id, tab = 'marca') { L.cur = id; L.tab = ['marca', 'productos', 'anuncio', 'vida'].includes(tab) ? tab : 'marca'; L.spot = 0; L.shot = 0; if (location.hash === '#brands') dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = '#brands'; }
