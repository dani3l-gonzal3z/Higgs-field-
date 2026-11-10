// 🏠 Inicio: la pantalla principal, pensada como una consola (táctil, teclado o mando).
import { el, btn, db, blobURL, host, toast, modal } from './core.js';
import { missionsCard, startTour } from './guide.js';

export const MODES = [
  { v: 'learn', ic: '🎓', t: 'Aprender', d: 'Tu profe para cualquier tema o PDF: explica en la pizarra y responde tus preguntas.', badge: 'Nuevo', grad: 'linear-gradient(135deg,#3a7bd5,#7f5bd6)' },
  { v: 'director', ic: '🎬', t: 'Contar historias', d: 'Pide un capítulo o pásale un libro: guion, rodaje, voces, música y montaje.', grad: 'linear-gradient(135deg,#ff5434,#ffb43c)' },
  { v: 'brands', ic: '🏷', t: 'Marcas y anuncios', d: 'De una idea a su branding, sus envases y su anuncio: en low-poly y con vida gracias a la IA.', badge: 'Nuevo', grad: 'linear-gradient(135deg,#e8433a,#f2b705)' },
  { v: 'games', ic: '🎮', t: 'Jugar', d: 'Describe cualquier juego y juégalo en la tele con los móviles como mando.', grad: 'linear-gradient(135deg,#11998e,#57e389)' },
  { v: 'plato', ic: '🎨', t: 'Crear escenas', d: 'El plató 3D: decorados, personajes, cámaras y acción con tus palabras.', grad: 'linear-gradient(135deg,#e86aa8,#ff9a5a)' },
];
export const PRO = [['studio', '✨', 'Estudio IA'], ['lab', '🧪', 'Laboratorio'], ['gallery', '🖼', 'Galería'], ['edit', '🎞', 'Montaje'], ['chars', '👤', 'Personajes']];
const hello = () => { const h = new Date().getHours(); return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'; };

export async function renderHome(r) {
  r.innerHTML = '';
  r.append(el('div', { class: 'h-hero' }, el('div', {}, el('h1', {}, `${hello()} 👋`), el('p', {}, '¿Qué hacemos hoy?'))));
  const modes = el('div', { class: 'h-modes' });
  for (const m of MODES) modes.append(el('a', { href: '#' + m.v, class: 'mode', 'data-v': m.v, 'data-nav': '', style: `--g:${m.grad}` }, el('i', {}, m.ic), el('b', {}, m.t), el('small', {}, m.d), m.badge ? el('em', {}, m.badge) : null));
  if (host.claude) r.append(el('section', { class: 'card h-claude' }, el('b', {}, 'Estás usando Plató dentro de Claude'),
    el('div', { class: 'h-cl2' }, el('div', {}, el('small', {}, '✅ Funciona aquí'), el('p', {}, 'Plató 3D · Director (planifica con Claude, rueda la previz y monta el animatic) · Jugar en esta pantalla · Montaje en tiempo real · Personajes')),
      el('div', {}, el('small', {}, '💻 Necesita Plató en tu ordenador'), el('p', {}, 'Generar vídeo e imágenes con tus claves · Voces gratis · Exportación rápida · Vídeos de stock · Móviles como mando'))),
    el('p', { class: 'note' }, 'No es un fallo: Claude no deja que sus páginas se conecten a otras webs (fal, Higgsfield, Pexels…) ni a tu ordenador.'), installButton()));
  r.append(modes);
  r.append(el('div', { class: 'h-pro' }, el('h3', { class: 'sec' }, 'Estudio Pro'), el('div', { class: 'h-tiles' }, PRO.map(([v, ic, t]) => el('a', { href: '#' + v, class: 'h-tile', 'data-nav': '' }, el('i', {}, ic), el('span', {}, t))))));
  // Seguir donde lo dejaste
  const recent = el('div', { class: 'h-recent' });
  const [gens, projects] = await Promise.all([db.all('gens'), db.all('projects')]);
  const games = projects.filter(p => p.kind === 'game').sort((a, b) => b.t - a.t).slice(0, 2);
  const dir = projects.filter(p => p.kind === 'director' && p.plan).sort((a, b) => b.t - a.t)[0];
  for (const g of games) recent.append(el('a', { href: '#games', class: 'h-rc', 'data-nav': '' }, el('i', {}, '🎮'), el('span', {}, el('b', {}, g.title || 'Juego'), el('small', {}, 'Tu juego'))));
  if (dir) recent.append(el('a', { href: '#director', class: 'h-rc', 'data-nav': '' }, el('i', {}, '🎬'), el('span', {}, el('b', {}, dir.plan.title || 'Capítulo'), el('small', {}, 'Proyecto del Director'))));
  for (const g of gens.filter(x => !x.hidden && (x.thumb || x.kind === 'image')).sort((a, b) => b.t - a.t).slice(0, 3)) recent.append(el('a', { href: '#gallery', class: 'h-rc img', 'data-nav': '' }, el('img', { src: blobURL(g.thumb || g.blob), alt: '' }), el('span', {}, el('b', {}, g.modelName), el('small', {}, 'Galería'))));
  if (recent.children.length) r.append(el('h3', { class: 'sec' }, 'Seguir donde lo dejaste'), recent);
  r.append(missionsCard());
  r.append(el('div', { class: 'h-foot' }, el('a', { href: '#settings', class: 'mini-b', 'data-nav': '' }, '⚙️ Ajustes'), btn('🎓 Ver la guía', () => startTour('home', { force: true }), 'mini-b'),
    !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !host.claude ? el('span', { class: 'note' }, '💡 Instala Plató en tu ordenador (plato.sh o Plato.cmd) para su ventana propia y para jugar con los móviles.') : null));
}

export { renderLearn } from './learn.js';

/* ---------- Navegación con teclado y mando ---------- */
export function setupSpatialNav() {
  const focusables = () => [...document.querySelectorAll('#view [data-nav]')].filter(e => e.offsetParent);
  const move = dir => { const list = focusables(); if (!list.length) return; const cur = document.activeElement && list.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { list[0].focus(); return; } const a = cur.getBoundingClientRect(), ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 }; let best = null, bd = Infinity;
    for (const e of list) { if (e === cur) continue; const b = e.getBoundingClientRect(), bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 }; const dx = bc.x - ac.x, dy = bc.y - ac.y;
      const ok = dir === 'left' ? dx < -4 : dir === 'right' ? dx > 4 : dir === 'up' ? dy < -4 : dy > 4; if (!ok) continue; const d = (dir === 'left' || dir === 'right') ? Math.abs(dx) + Math.abs(dy) * 2.5 : Math.abs(dy) + Math.abs(dx) * 2.5; if (d < bd) { bd = d; best = e; } }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
  addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || document.querySelector('.modal, .gd-bub')) return; if (!['home', 'games'].includes(document.body.dataset.view)) return;
    const d = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key]; if (d) { e.preventDefault(); move(d); } });
  // Mando de consola (Gamepad API): cruceta/stick para moverse, A para entrar, B para volver a Inicio
  let prev = {}; const poll = () => { const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean); if (gp && document.body.dataset.view !== 'plato') {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, b = i => gp.buttons[i] && gp.buttons[i].pressed; const st = { left: b(14) || ax < -0.6, right: b(15) || ax > 0.6, up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, a: b(0), back: b(1) };
      for (const k of ['left', 'right', 'up', 'down']) if (st[k] && !prev[k]) move(k); if (st.a && !prev.a && document.activeElement) document.activeElement.click(); if (st.back && !prev.back) location.hash = '#home'; prev = st; }
    requestAnimationFrame(poll); }; addEventListener('gamepadconnected', () => { toast('🎮 Mando conectado'); requestAnimationFrame(poll); }, { once: true });
}

// Cómo tener Plató completo en tu ordenador (sirve tanto dentro de Claude como en la web).
export function installButton(label = '💻 Instalar Plató en mi ordenador') { return btn(label, installHelp, 'b on'); }
export function installHelp() {
  const step = (n, t, d) => el('div', { class: 'ins-st' }, el('i', {}, n), el('div', {}, el('b', {}, t), d));
  modal('💻 Plató en tu ordenador (5 min)', el('div', { class: 'ins' },
    step('1', 'Instala Node.js', el('p', {}, 'Entra en ', el('a', { href: 'https://nodejs.org/es', target: '_blank', rel: 'noopener' }, 'nodejs.org'), ' y descarga la versión LTS. Instálala con las opciones por defecto.')),
    step('2', 'Descarga Plató', el('p', {}, el('a', { href: 'https://github.com/dani3l-gonzal3z/Higgs-field-/archive/refs/heads/main.zip', target: '_blank', rel: 'noopener' }, 'Descargar Plató (.zip)'), ' y descomprímelo donde quieras.')),
    step('3', 'Ábrelo', el('p', {}, 'Windows: doble clic en ', el('code', {}, 'Plato.cmd'), '. Mac: clic derecho en ', el('code', {}, 'Plato.command'), ' → Abrir (la primera vez). Linux: ', el('code', {}, './plato.sh'), '. Se abre en su propia ventana; necesita Chrome o Edge instalado.')),
    step('4', 'Pon tus claves', el('p', {}, 'En ⚙️ Ajustes de esa ventana (no se comparten con esta). Con eso ya generas vídeo e imágenes.')),
    step('+', 'Opcional', el('p', {}, 'Exportación rápida: instala FFmpeg (Windows: ', el('code', {}, 'winget install ffmpeg'), ' · Mac: ', el('code', {}, 'brew install ffmpeg'), '). Voces gratis: en la carpeta de Plató, ', el('code', {}, 'node mcp/server.mjs --setup-voices'), ' (también necesita Python y espeak-ng). En ⚙️ Ajustes → 🏠 Este aparato ves qué tienes listo.'))), { wide: true });
}
