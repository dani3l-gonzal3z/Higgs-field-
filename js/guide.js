// 🎓 Guía: recorridos con foco la primera vez que entras en cada sitio, consejos al descubrir cosas y misiones con progreso.
import { el, btn, toast } from './core.js';

const KEY = 'plato_guide';
const load = () => { try { return { seen: {}, tips: {}, done: {}, off: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { seen: {}, tips: {}, done: {}, off: false }; } };
const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
const F = '#plato'; // los pasos con frame: F apuntan dentro del plató

export const TOURS = {
  home: [
    { sel: '.h-modes', title: 'Bienvenido a Plató', text: 'Todo empieza aquí. Cuatro modos: aprender, contar historias, jugar y crear escenas. Elige uno y te acompaño la primera vez.' },
    { sel: '.mode[data-v=games]', title: 'Jugar', text: 'Describe cualquier juego (un Monopoly, unas carreras o algo inventado) y Plató lo programa y lo prueba solo. Los móviles hacen de mando.' },
    { sel: '.mode[data-v=director]', title: 'Contar historias', text: 'Pide un capítulo o pásale un libro: escribe el guion, rueda los planos, pone voces y música y lo monta.' },
    { sel: '.mode[data-v=plato]', title: 'Crear escenas', text: 'El plató 3D: decorados, personajes, cámaras y acción. Es la base de todo lo demás.' },
    { sel: '.h-pro', title: 'Estudio Pro', text: 'Las herramientas avanzadas: generar con IA (tus claves), laboratorio de modelos, galería, montaje y personajes.' },
    { sel: '#missChip', title: 'Misiones', text: 'Pequeños retos para descubrir todo lo que puede hacer Plató. Aquí ves tu progreso.' },
    { sel: '#helpBtn', title: '¿Perdido?', text: 'Pulsa este botón en cualquier pantalla y te explico lo que hay en ella.' },
  ],
  plato: [
    { frame: F, sel: '#cmd', title: 'Háblale al plató', text: 'Escribe lo que quieres que pase: «mete dos coches y que el rojo persiga al azul». Él lo monta y lo coreografía.' },
    { frame: F, sel: '#tabs button[data-tab=stock]', title: 'Stock', text: 'Decorados completos y personajes con vestuario listos para usar. Prueba el garaje-laboratorio.' },
    { frame: F, sel: '#tabs button[data-tab=cam]', title: 'Cámara y multicámara', text: 'Mueve la cámara, encuadra de un toque y crea varias cámaras para ver la misma toma desde todos los ángulos.' },
    { frame: F, sel: '#tabs button[data-tab=take]', title: 'La toma', text: 'Cada acción se graba en una toma que se repite idéntica: la grabas, la cambias o la llevas a la IA.' },
    { frame: F, sel: '#bRec', title: 'Grabar', text: 'Graba la toma en vídeo, lista para tu montaje o para convertirla en realista con IA.' },
  ],
  games: [
    { sel: '#gCreate', title: 'Crea cualquier juego', text: 'Escribe la idea con tus palabras. Plató escribe el juego, lo prueba jugando solo y corrige sus fallos antes de dártelo.' },
    { sel: '#gLib', title: 'Tus juegos', text: 'Aquí se guardan. Ábrelos para jugar o para mejorarlos pidiendo cambios («que vaya más rápido», «añade trampas»).' },
  ],
  director: [
    { sel: '.dirtop', title: 'Proyectos del Director', text: 'Cada capítulo o libro es un proyecto. Puedes tener varios y volver a ellos.' },
    { sel: 'textarea, .chlist', title: 'Tu historia', text: 'Pega una idea o un capítulo, o sube un libro. La IA lo adapta como un guion de cine, no lo lee en voz alta.' },
    { sel: '.gofoot .go, .prod', title: 'De la idea al capítulo', text: 'Planifica, rueda la previz sola, genera el vídeo final, las voces y la música, y monta el capítulo con subtítulos.' },
  ],
  studio: [
    { sel: '.models', title: 'Modelos', text: 'Elige uno o varios para comparar. Ves el coste antes de generar y nunca se pasa de tu presupuesto.' },
    { sel: '.gofoot', title: 'Generar', text: 'Lanza la generación con tus propias claves: pagas al proveedor solo lo que usas.' },
  ],
  lab: [{ sel: '.labtabs', title: 'Laboratorio', text: 'Cientos de modelos de imagen, vídeo, voz y música con una sola clave de Muapi, cada uno con sus propios controles.' }],
  gallery: [{ sel: '.ghead', title: 'Galería', text: 'Todo lo que generas y grabas. Compara dos resultados a la vez o usa uno como entrada de otra generación.' }],
  edit: [{ sel: '.edcanvas', title: 'Montaje', text: 'Une planos, recorta, añade música, voces y subtítulos, y exporta el vídeo final.' }],
  chars: [{ sel: '#view .card', title: 'Personajes', text: 'Fichas con descripción e imágenes para que cada personaje tenga siempre el mismo aspecto en la IA.' }],
  settings: [{ sel: '#mcpCard', title: 'IA externa', text: 'Conecta Claude u otras IAs por MCP para que manejen Plató por ti.' }, { sel: '#guideCard', title: 'La guía', text: 'Aquí puedes repetir los recorridos o apagarlos.' }],
};
export const TIPS = {
  'tab:stock': ['Stock', 'Toca un decorado para cargarlo entero. Luego añade personajes con vestuario y dales órdenes escritas.'],
  'tab:cam': ['Multicámara', 'Baja hasta «Multicámara»: «Cobertura automática» crea 4 cámaras sobre tu personaje y el monitor te enseña todas a la vez.'],
  'tab:take': ['La toma', 'Lo que haces se graba solo. «Repetir» la vuelve a reproducir idéntica, y puedes grabarla desde cada cámara.'],
  'tab:env': ['Ambiente', 'Cambia la hora, el clima y el lugar. La misma toma de día o de noche lluviosa cambia por completo.'],
  'tab:add': ['Añadir', 'Mantén pulsado el suelo para soltar algo justo ahí.'],
  'coverage': ['Monitor multicámara', 'Toca un monitor (o pulsa 1-9) para cortar a esa cámara. Con «Realizar en directo» grabas tu propio montaje.'],
  'set': ['Decorado cargado', 'Ahora pide acción: «que el científico camine hacia el coche y el chaval le salude».'],
};
export const MISSIONS = [
  ['set', 'Carga un decorado del stock', 'Crear → 📦 Stock'], ['char', 'Añade un personaje con vestuario', 'Crear → 📦 Stock → Personajes'], ['take', 'Da una orden de acción', 'Crear: escribe qué pasa'],
  ['coverage', 'Ve la misma toma desde 4 cámaras', 'Crear → 🎥 Cámara → Cobertura automática'], ['record', 'Graba una toma en vídeo', 'Crear → ⏺'], ['game-play', 'Juega una partida', 'Jugar → elige un juego'],
  ['game-create', 'Crea un juego describiéndolo', 'Jugar → ¿A qué jugamos hoy?'], ['director-plan', 'Planifica un capítulo con el Director', 'Contar historias'], ['generate', 'Genera algo con IA', 'Estudio Pro → Estudio IA'], ['montage', 'Exporta un montaje', 'Estudio Pro → Montaje'],
];

let S = load(); const listeners = new Set();
export const onGuide = f => { listeners.add(f); return () => listeners.delete(f); };
const changed = () => { for (const f of listeners) f(); };
export const missionsDone = () => MISSIONS.filter(([id]) => S.done[id]).length;
export function guideEvent(name) {
  if (name.startsWith('tab:') || TIPS[name]) maybeTip(name);
  const m = MISSIONS.find(([id]) => id === name); if (m && !S.done[name]) { S.done[name] = Date.now(); save(S); changed();
    setTimeout(() => toast(`🏅 Misión cumplida: ${m[1]}`, 4200, { sub: `${missionsDone()} de ${MISSIONS.length} · sigue descubriendo` }), 600); }
}
export function guideSettings() { return { off: S.off }; }
export function setGuideOff(v) { S.off = !!v; save(S); }
export function resetGuide() { S = { seen: {}, tips: {}, done: S.done, off: false }; save(S); changed(); }

/* ---------- Recorrido con foco ---------- */
let active = null;
function targetRect(step) {
  let doc = document, off = { x: 0, y: 0 };
  if (step.frame) { const fr = document.querySelector(step.frame); if (!fr || fr.hidden) return null; try { doc = fr.contentDocument; } catch (e) { return null; } const r = fr.getBoundingClientRect(); off = { x: r.left, y: r.top }; }
  if (!doc) return null; const t = [...doc.querySelectorAll(step.sel)].find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); if (!t) return null;
  if (!step.frame) t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const r = t.getBoundingClientRect(); return { x: r.left + off.x, y: r.top + off.y, w: r.width, h: r.height };
}
export function startTour(name, { force = false } = {}) {
  const steps = (TOURS[name] || []).slice(); if (!steps.length) { toast('Aquí no hay recorrido todavía'); return; }
  if (!force && (S.off || S.seen[name])) return; S.seen[name] = true; save(S); endTour();
  const veil = el('div', { class: 'gd-veil' }), hole = el('div', { class: 'gd-hole' }), bub = el('div', { class: 'gd-bub', role: 'dialog' }); document.body.append(veil, hole, bub);
  let i = 0; active = { veil, hole, bub, onR: null };
  const show = () => { const st = steps[i]; const r = targetRect(st); bub.innerHTML = '';
    bub.append(el('div', { class: 'gd-k' }, `${i + 1} / ${steps.length}`), el('b', {}, st.title), el('p', {}, st.text),
      el('div', { class: 'gd-acts' }, btn('Saltar', endTour, 'mini-b'), i ? btn('←', () => { i--; show(); }, 'mini-b') : null, btn(i === steps.length - 1 ? '¡Entendido!' : 'Siguiente →', () => { if (++i >= steps.length) endTour(); else show(); }, 'b on')));
    if (r) { const pad = 8; Object.assign(hole.style, { display: 'block', left: r.x - pad + 'px', top: r.y - pad + 'px', width: r.w + pad * 2 + 'px', height: r.h + pad * 2 + 'px' }); veil.classList.add('clear'); }
    else { hole.style.display = 'none'; veil.classList.remove('clear'); }
    requestAnimationFrame(() => { const bw = bub.offsetWidth, bh = bub.offsetHeight, W = innerWidth, H = innerHeight; let x, y;
      if (r) { x = Math.min(W - bw - 12, Math.max(12, r.x + r.w / 2 - bw / 2)); y = r.y + r.h + 16; if (y + bh > H - 12) y = r.y - bh - 16; if (y < 12) y = Math.min(H - bh - 12, Math.max(12, r.y + r.h / 2 - bh / 2)); }
      else { x = (W - bw) / 2; y = (H - bh) / 2; } bub.style.left = x + 'px'; bub.style.top = y + 'px'; }); };
  active.onR = () => show(); addEventListener('resize', active.onR); addEventListener('keydown', esc); show();
}
function esc(e) { if (e.key === 'Escape') endTour(); }
export function endTour() { if (!active) return; active.veil.remove(); active.hole.remove(); active.bub.remove(); removeEventListener('resize', active.onR); removeEventListener('keydown', esc); active = null; }
export function maybeTour(view) { if (!S.off && !S.seen[view] && TOURS[view]) setTimeout(() => { if ((location.hash.slice(1) || 'home') === view) startTour(view); }, view === 'plato' ? 1600 : 700); }
function maybeTip(name) { const t = TIPS[name]; if (!t || S.off || S.tips[name] || active) return; S.tips[name] = true; save(S); toast(`💡 ${t[0]}`, 7000, { sub: t[1] }); }

/* ---------- Tarjeta de misiones ---------- */
export function missionsCard() {
  const n = missionsDone(); const next = MISSIONS.find(([id]) => !S.done[id]);
  return el('section', { class: 'card h-miss', id: 'missCard' }, el('div', { class: 'h-mh' }, el('b', {}, '🏅 Misiones'), el('small', {}, `${n} de ${MISSIONS.length}`)),
    el('div', { class: 'h-bar' }, el('i', { style: `width:${n / MISSIONS.length * 100}%` })),
    next ? el('p', { class: 'note' }, 'Siguiente: ', el('b', {}, next[1]), ` · ${next[2]}`) : el('p', { class: 'note' }, '¡Las has completado todas! Ya conoces Plató de arriba abajo.'),
    el('div', { class: 'h-mlist' }, MISSIONS.map(([id, t]) => el('span', { class: 'h-m' + (S.done[id] ? ' ok' : '') }, S.done[id] ? '✓ ' : '○ ', t))));
}
export function guideSettingsCard() {
  return el('section', { class: 'card', id: 'guideCard' }, el('h3', {}, '🎓 Guía'), el('p', { class: 'note' }, 'Los recorridos aparecen la primera vez que entras en cada sitio y los consejos cuando descubres algo nuevo.'),
    el('div', { class: 'row-btns' }, btn('↺ Volver a ver los recorridos', () => { resetGuide(); toast('Los recorridos volverán a salir'); }, 'mini-b'), btn(S.off ? 'Activar la guía' : 'Apagar la guía', e => { setGuideOff(!S.off); e.target.textContent = S.off ? 'Activar la guía' : 'Apagar la guía'; }, 'mini-b')));
}
addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'plato:event' && typeof e.data.name === 'string') guideEvent(e.data.name); });
