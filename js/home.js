// 🏠 Inicio: la pantalla principal, pensada como una consola (táctil, teclado o mando).
import { el, btn, db, blobURL, host, toast } from './core.js';
import { missionsCard, startTour } from './guide.js';

export const MODES = [
  { v: 'learn', ic: '🎓', t: 'Aprender', d: 'Clases en directo con un personaje que explica, dibuja y responde.', badge: 'Pronto', grad: 'linear-gradient(135deg,#3a7bd5,#7f5bd6)' },
  { v: 'director', ic: '🎬', t: 'Contar historias', d: 'Pide un capítulo o pásale un libro: guion, rodaje, voces, música y montaje.', grad: 'linear-gradient(135deg,#ff5434,#ffb43c)' },
  { v: 'games', ic: '🎮', t: 'Jugar', d: 'Describe cualquier juego y juégalo en la tele con los móviles como mando.', badge: 'Nuevo', grad: 'linear-gradient(135deg,#11998e,#57e389)' },
  { v: 'plato', ic: '🎨', t: 'Crear escenas', d: 'El plató 3D: decorados, personajes, cámaras y acción con tus palabras.', grad: 'linear-gradient(135deg,#e86aa8,#ff9a5a)' },
];
export const PRO = [['studio', '✨', 'Estudio IA'], ['lab', '🧪', 'Laboratorio'], ['gallery', '🖼', 'Galería'], ['edit', '🎞', 'Montaje'], ['chars', '👤', 'Personajes']];
const hello = () => { const h = new Date().getHours(); return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'; };

export async function renderHome(r) {
  r.innerHTML = '';
  r.append(el('div', { class: 'h-hero' }, el('div', {}, el('h1', {}, `${hello()} 👋`), el('p', {}, '¿Qué hacemos hoy?'))));
  const modes = el('div', { class: 'h-modes' });
  for (const m of MODES) modes.append(el('a', { href: '#' + m.v, class: 'mode', 'data-v': m.v, 'data-nav': '', style: `--g:${m.grad}` }, el('i', {}, m.ic), el('b', {}, m.t), el('small', {}, m.d), m.badge ? el('em', {}, m.badge) : null));
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

export function renderLearn(r) {
  r.innerHTML = '';
  r.append(el('section', { class: 'card hero' }, el('div', { class: 'badge prem' }, 'PRÓXIMAMENTE'), el('h2', {}, '🎓 Aprender'),
    el('p', {}, 'Por la mañana le cuentas a Plató qué les cuesta a tus hijos y prepara un plan para la semana. Por la tarde, un personaje que ellos eligen les da la clase en la tele: reparte una pizza en octavos mientras la pizarra escribe 3/8, monta la Roma de los césares delante de ellos y responde a sus preguntas.'),
    el('div', { class: 'note' }, 'Está en la fase 1 del plan: personaje que habla con la boca sincronizada y clases interpretadas en directo. Mientras tanto puedes usar el Director para crear capítulos educativos.'),
    el('div', { class: 'row-btns' }, el('a', { class: 'b on', href: '#director' }, '🎬 Crear un capítulo educativo'), btn('Avisarme cuando esté', () => toast('👍 Te lo enseñaré en Inicio en cuanto llegue'), 'mini-b'))));
}

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
