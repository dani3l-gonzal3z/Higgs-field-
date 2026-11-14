// 🔌 Taller de electrónica: monta el circuito, prográmalo y simúlalo; luego llévalo a la mesa.
// Motores: avr8js (Arduino) y rp2040js + MicroPython (Pico y, con una capa de soporte, ESP32, STM32 y placas Linux), de Wokwi;
// piezas de @wokwi/elements; protoboards, dibujos de placas y firmware de Velxio.
import { el, btn, toast, modal, confirmBox, download } from './core.js';
import { localBase } from './local.js';
import { llmReady, llmJSON, llmText } from './llm.js';
import { BOARDS, PARTS, TYPE_ALIAS, staticNets, evaluate, definePico, HD44780, bom, describePin, fmtOhms, COLOR_ES } from './taller/circuit.js';
import { FAMILIES, defineBoards, boardByType, BOARD_ALIAS, supportCode, gpMap, mcuPins, analogPins, pinLabel as boardPinLabel, powerOf, fileName, keyOf } from './taller/boards.js';
import { EXAMPLES, exampleCircuit, exampleCode, supports, insideCode, norm, PREBUILT } from './taller/examples.js';
import { AvrRunner, PicoRunner, UNO_PINS } from './taller/sim.js';

const KEY = 'plato.taller.v1';
const WIRE_COLORS = ['green', 'blue', 'orange', 'purple', 'yellow', 'white', 'cyan'];
const T = { board: 'pico', circuit: null, code: '', sel: null, wireFrom: null, runner: null, ui: {}, geo: { pins: {} }, zoom: 1, serial: '', ex: 'blink', dirty: false, inside: {} };
let ready = null;
const loadLibs = () => ready || (ready = (async () => { await import('./vendor/wokwi-elements.js'); await import('./vendor/velxio-breadboards.js'); definePico(); defineBoards(); })());

function save() { try { localStorage.setItem(KEY, JSON.stringify({ board: T.board, circuit: T.circuit, code: T.code, ex: T.ex, inside: T.inside })); } catch (e) {} }
function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.circuit) Object.assign(T, s); } catch (e) {} if (!BOARDS[T.board]) T.circuit = null; if (!T.circuit) useExample('blink', 'pico', false); T.inside = T.inside || {}; }
function useExample(id, board = T.board, render = true) {
  let ex = EXAMPLES.find(e => e.id === id) || EXAMPLES[0]; if (!supports(ex, board)) ex = EXAMPLES[0];
  stop(); T.fit = true; T.serial = ''; T.ex = ex.id; T.board = board; T.circuit = exampleCircuit(ex, board); T.code = exampleCode(ex, board); T.sel = null; T.ui = {}; save(); if (render) draw(); }
const boardPart = () => T.circuit.parts.find(p => boardByType(p.type));
const SIM_KIND = b => b.engine === 'shim' ? (b.flavor === 'linux' ? 'Simulada · Python' : 'Simulada · MicroPython') : 'Chip emulado';

let R = null; // nodos de la vista
export async function renderTaller(r) {
  load(); r.classList.add('tl-host');
  R = { root: el('div', { class: 'tl' }) }; r.append(R.root);
  R.root.append(el('div', { class: 'empty' }, 'Abriendo el taller…'));
  await loadLibs(); draw();
}

/* ---------- Pintado ---------- */
function draw() {
  if (!R) return; const root = R.root; root.innerHTML = '';
  const b = BOARDS[T.board];
  // Barra superior
  const bar = el('div', { class: 'tl-bar' },
    btn(el('span', { class: 'tl-bname' }, el('b', {}, (FAMILIES.find(f => f[0] === b.family) || ['', '🔲'])[1].split(' ')[0] + ' ' + b.name), el('small', {}, `${b.chip} · ${b.lang === 'cpp' ? 'C++' : b.flavor === 'linux' ? 'Python' : 'MicroPython'} ▾`)), boardPicker, 'b tl-bpick'),
    btn('🔩 Por dentro', inside, 'b'),
    R.runBtn = btn(T.runner ? '■ Parar' : '▶ Simular', () => T.runner ? stop() : start(), 'b on tl-run'),
    btn('＋ Pieza', palette, 'b'), btn('📚 Ejemplos', examples, 'b'), btn('🤖 Profe', teacher, 'b'), btn('🧰 A la mesa', toReal, 'b'), btn('⋯', more, 'b'));
  R.warn = el('div', { class: 'tl-warn' });
  // Lienzo
  R.world = el('div', { class: 'tl-world', style: `transform:scale(${T.zoom})` });
  R.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); R.svg.classList.add('tl-wires'); R.svg.setAttribute('width', 2000); R.svg.setAttribute('height', 1400);
  R.stage = el('div', { class: 'tl-stage', on: { pointerdown: e => { if (e.target === R.stage || e.target === R.world || e.target === R.svg) { T.sel = null; T.wireFrom = null; tools(); paintWires(); } } } },
    R.world, el('div', { class: 'tl-zoom' }, btn('−', () => setZoom(T.zoom / 1.2), 'mini-b'), btn('＋', () => setZoom(T.zoom * 1.2), 'mini-b')));
  R.tools = el('div', { class: 'tl-tools' });
  for (const p of T.circuit.parts) R.world.append(partNode(p));
  R.world.append(R.svg);
  // Panel lateral: código y monitor
  R.code = el('textarea', { class: 'tl-code', spellcheck: false, value: T.code, on: { input: e => { T.code = e.target.value; save(); }, keydown: tabKey } });
  R.code.value = T.code;
  R.mon = el('pre', { class: 'tl-mon' }, T.serial || (b.lang === 'python' ? 'La salida de print() aparece aquí.' : 'La salida de Serial.print() aparece aquí.'));
  const inp = el('input', { class: 'txt', placeholder: 'Escribe y pulsa Intro para mandarlo por el puerto serie', on: { keydown: e => { if (e.key === 'Enter' && T.runner) { T.runner.write(e.target.value + '\n'); e.target.value = ''; } } } });
  const side = el('div', { class: 'tl-side' }, el('div', { class: 'tl-h' }, el('b', {}, b.lang === 'cpp' ? '⚙️ Arduino C++' : b.flavor === 'linux' ? `🐍 Python · ${b.lib}` : b.flavor === 'stm32' ? '🐍 MicroPython · STM32' : '🐍 MicroPython'), el('small', {}, (EXAMPLES.find(e => e.id === T.ex) || {}).title || 'Tu circuito')), R.code, el('div', { class: 'tl-h' }, el('b', {}, '🖥 Monitor')), R.mon, inp);
  root.append(bar, R.warn, el('div', { class: 'tl-main' }, el('div', { class: 'tl-left' }, R.tools, R.stage), side));
  tools(); requestAnimationFrame(() => requestAnimationFrame(() => { measure(); if (T.fit !== false) fit(); paintWires(); }));
}
// Encaja el circuito en la pantalla (las piezas de verdad son pequeñas: mejor verlas grandes).
function fit() { const all = Object.values(T.geo.pins).flat(); if (!all.length) return; const xs = all.map(p => p.ax), ys = all.map(p => p.ay);
  const w = Math.max(...xs) + 60, h = Math.max(...ys) + 80; const r = R.stage.getBoundingClientRect(); const z = Math.max(0.8, Math.min(2.2, Math.min(r.width / w, r.height / h)));
  setZoom(Math.round(z * 100) / 100); T.fit = false; }
function tabKey(e) { if (e.key !== 'Tab') return; e.preventDefault(); const t = e.target, s = t.selectionStart; const ind = BOARDS[T.board].lang === 'cpp' ? '  ' : '    '; t.value = t.value.slice(0, s) + ind + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = s + ind.length; T.code = t.value; save(); }
function setZoom(z) { T.zoom = Math.max(0.4, Math.min(2.5, z)); R.world.style.transform = `scale(${T.zoom})`; }

function partNode(p) {
  const type = TYPE_ALIAS[p.type] || p.type; const elx = document.createElement(type);
  for (const [k, v] of Object.entries(p.attrs || {})) if (v != null) elx.setAttribute(k, v);
  const wrap = el('div', { class: 'tl-part' + (T.sel && T.sel.part === p.id ? ' sel' : ''), 'data-id': p.id, style: `left:${p.left}px;top:${p.top}px;transform:rotate(${p.rotate || 0}deg)` }, elx);
  if (PARTS[type] && PARTS[type].kind === 'bb') wrap.classList.add('bb');
  // Interacción de la pieza durante la simulación
  elx.addEventListener('button-press', () => { T.ui[p.id] = { ...(T.ui[p.id] || {}), pressed: true }; });
  elx.addEventListener('button-release', () => { T.ui[p.id] = { ...(T.ui[p.id] || {}), pressed: false }; });
  elx.addEventListener('input', e => { T.ui[p.id] = { ...(T.ui[p.id] || {}), value: +(e.detail ?? elx.value) }; });
  // Arrastrar
  let st = null;
  wrap.addEventListener('pointerdown', e => { if (e.button) return; const interactive = T.runner && ['wokwi-pushbutton', 'wokwi-potentiometer', 'wokwi-slide-switch'].includes(type); if (interactive) return;
    e.preventDefault(); wrap.setPointerCapture(e.pointerId); st = { x: e.clientX, y: e.clientY, l: p.left, t: p.top, moved: false }; });
  wrap.addEventListener('pointermove', e => { if (!st) return; const dx = (e.clientX - st.x) / T.zoom, dy = (e.clientY - st.y) / T.zoom; if (!st.moved && Math.hypot(dx, dy) < 4) return; st.moved = true;
    p.left = Math.round(st.l + dx); p.top = Math.round(st.t + dy); wrap.style.left = p.left + 'px'; wrap.style.top = p.top + 'px'; measure(p.id); paintWires(); });
  wrap.addEventListener('pointerup', () => { if (!st) return; const moved = st.moved; st = null; if (moved) { snap(p); save(); } else { T.sel = { part: p.id }; T.wireFrom = null; document.querySelectorAll('.tl-part.sel').forEach(x => x.classList.remove('sel')); wrap.classList.add('sel'); tools(); } paintWires(); });
  return wrap;
}
// Geometría de patas: posición absoluta en el mundo de cada pin (teniendo en cuenta el giro).
function measure(only) {
  for (const p of T.circuit.parts) { if (only && p.id !== only) continue; const w = R.world.querySelector(`.tl-part[data-id="${p.id}"]`); if (!w) continue; const e = w.firstChild; const info = e.pinInfo || [];
    const W = e.offsetWidth, H = e.offsetHeight, a = (p.rotate || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    T.geo.pins[p.id] = info.map(q => { const dx = q.x - W / 2, dy = q.y - H / 2; return { name: q.name, ax: p.left + W / 2 + dx * c - dy * s, ay: p.top + H / 2 + dx * s + dy * c }; }); }
}
// Al soltar una pieza sobre la protoboard, sus patas caen justo en los agujeros.
function snap(p) {
  const type = TYPE_ALIAS[p.type] || p.type; const bb = boardByType(type); if ((PARTS[type] || {}).kind === 'bb' || (bb && (bb.key === 'uno' || bb.family === 'linux' || bb.drawn))) return;
  const holes = T.circuit.parts.filter(q => (PARTS[TYPE_ALIAS[q.type] || q.type] || {}).kind === 'bb').flatMap(q => T.geo.pins[q.id] || []); if (!holes.length) return;
  const mine = T.geo.pins[p.id] || []; let best = null, bd = 100;
  for (const pin of mine) for (const h of holes) { const d = (h.ax - pin.ax) ** 2 + (h.ay - pin.ay) ** 2; if (d < bd) { bd = d; best = [h.ax - pin.ax, h.ay - pin.ay]; } }
  if (best) { p.left = Math.round((p.left + best[0]) * 10) / 10; p.top = Math.round((p.top + best[1]) * 10) / 10; const w = R.world.querySelector(`.tl-part[data-id="${p.id}"]`); w.style.left = p.left + 'px'; w.style.top = p.top + 'px'; measure(p.id); toast('📍 En la protoboard', 900); }
}

/* ---------- Cables ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
const pinXY = ref => { const [id, pin] = ref.split(':'); const q = (T.geo.pins[id] || []).find(x => x.name === pin); return q ? [q.ax, q.ay] : null; };
function paintWires() {
  if (!R || !R.svg) return; const svg = R.svg; svg.innerHTML = '';
  T.circuit.connections.forEach((c, i) => { const a = pinXY(c[0]), b = pinXY(c[1]); if (!a || !b) return;
    const dx = Math.max(20, Math.abs(b[0] - a[0]) / 2); const d = `M${a[0]},${a[1]} C${a[0] + (b[0] > a[0] ? dx : -dx) * 0.4},${a[1] + 30} ${b[0] - (b[0] > a[0] ? dx : -dx) * 0.4},${b[1] + 30} ${b[0]},${b[1]}`;
    const sel = T.sel && T.sel.wire === i; const col = { green: '#2ecc40', blue: '#3a7bd5', orange: '#ff851b', purple: '#b10dc9', yellow: '#ffdc00', white: '#eee', cyan: '#39cccc', red: '#e8433a', black: '#222' }[c[2]] || c[2] || '#2ecc40';
    const hit = document.createElementNS(SVGNS, 'path'); hit.setAttribute('d', d); hit.setAttribute('class', 'tl-hit'); hit.addEventListener('pointerdown', e => { e.stopPropagation(); T.sel = { wire: i }; T.wireFrom = null; tools(); paintWires(); });
    const path = document.createElementNS(SVGNS, 'path'); path.setAttribute('d', d); path.setAttribute('stroke', col); path.setAttribute('class', 'tl-wire' + (sel ? ' sel' : ''));
    svg.append(hit, path); });
  // Patas: se tocan para tender cables (no en la protoboard, que tiene 170-830 agujeros: ahí se muestran al acercarse)
  for (const p of T.circuit.parts) { const isBB = (PARTS[TYPE_ALIAS[p.type] || p.type] || {}).kind === 'bb';
    for (const q of T.geo.pins[p.id] || []) { const ref = p.id + ':' + q.name; const on = T.wireFrom === ref;
      const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', q.ax); c.setAttribute('cy', q.ay); c.setAttribute('r', isBB ? 3.2 : 4.2); c.setAttribute('class', 'tl-pin' + (on ? ' on' : '') + (isBB ? ' bb' : ''));
      const tt = document.createElementNS(SVGNS, 'title'); tt.textContent = pinLabel(p, q.name); c.append(tt);
      c.addEventListener('pointerdown', e => { e.stopPropagation(); tapPin(ref); }); svg.append(c); } }
}
function pinLabel(p, name) { const t = TYPE_ALIAS[p.type] || p.type; const bb = boardByType(t); if (bb) return `${bb.name}: ${boardPinLabel(bb, name)}`; const info = PARTS[t]; return info && info.pins && info.pins[name] ? `${info.name}: ${info.pins[name]}` : `${p.id}: ${name}`; }
function tapPin(ref) {
  if (T.runner) return toast('Para el circuito (■) para cambiar cables');
  if (!T.wireFrom) { T.wireFrom = ref; T.sel = null; tools(); paintWires(); toast('Ahora toca la otra pata', 1200); return; }
  if (T.wireFrom === ref) { T.wireFrom = null; paintWires(); return; }
  const n = T.circuit.connections.length; const pw = r => { const [id, pin] = r.split(':'); const p = T.circuit.parts.find(x => x.id === id); const bb = p && boardByType(p.type); return bb ? powerOf(bb, pin) : /GND/.test(pin) ? 'gnd' : /^(VCC|V\+)$/.test(pin) ? '5v' : null; };
  const kinds = [pw(ref), pw(T.wireFrom)]; const color = kinds.includes('gnd') ? 'black' : kinds.some(Boolean) ? 'red' : WIRE_COLORS[n % WIRE_COLORS.length];
  T.circuit.connections.push([T.wireFrom, ref, color, []]); T.wireFrom = null; T.sel = { wire: n }; save(); tools(); paintWires();
}

/* ---------- Barra de herramientas de la selección ---------- */
function tools() {
  if (!R || !R.tools) return; const box = R.tools; box.innerHTML = '';
  if (T.wireFrom) { box.append(el('span', {}, '🔗 Toca la pata de destino'), btn('Cancelar', () => { T.wireFrom = null; tools(); paintWires(); }, 'mini-b')); return; }
  if (T.sel && T.sel.wire != null) { const c = T.circuit.connections[T.sel.wire]; if (!c) return;
    box.append(el('span', { class: 'tl-desc' }, `Cable: ${describePin(T.circuit, c[0])} → ${describePin(T.circuit, c[1])}`),
      el('select', { class: 'txt mini', on: { change: e => { c[2] = e.target.value; save(); paintWires(); } } }, ['green', 'blue', 'orange', 'purple', 'yellow', 'white', 'red', 'black'].map(k => el('option', { value: k, selected: c[2] === k }, COLOR_ES[k] || k))),
      btn('🗑 Quitar', () => { T.circuit.connections.splice(T.sel.wire, 1); T.sel = null; save(); tools(); paintWires(); }, 'mini-b')); return; }
  if (T.sel && T.sel.part) { const p = T.circuit.parts.find(x => x.id === T.sel.part); if (!p) return; const t = TYPE_ALIAS[p.type] || p.type; const info = PARTS[t]; const isBoard = !info;
    box.append(el('b', {}, isBoard ? BOARDS[T.board].name : `${info.icon} ${info.name}`)); if (isBoard) box.append(btn('🔩 Por dentro', inside, 'mini-b'), btn('🔁 Cambiar placa', boardPicker, 'mini-b'));
    for (const [k, list] of Object.entries((info && info.opts) || {})) box.append(el('select', { class: 'txt mini', on: { change: e => { p.attrs = { ...(p.attrs || {}), [k]: e.target.value }; save(); redrawPart(p); } } }, list.map(v => el('option', { value: v, selected: (p.attrs || {})[k] === v }, k === 'value' ? fmtOhms(v) : COLOR_ES[v] || v))));
    if (t === 'wokwi-photoresistor-sensor') box.append(slider('☀️ Luz', T.ui[p.id]?.light ?? 0.5, v => { T.ui[p.id] = { ...(T.ui[p.id] || {}), light: v }; }));
    if (t === 'wokwi-hc-sr04') box.append(slider('📏 Distancia', (T.ui[p.id]?.cm ?? 100) / 400, v => { T.ui[p.id] = { ...(T.ui[p.id] || {}), cm: Math.round(2 + v * 398) }; }, v => Math.round(2 + v * 398) + ' cm'));
    if (!isBoard) { box.append(btn('⟳ Girar', () => { p.rotate = ((p.rotate || 0) + 90) % 360; save(); redrawPart(p); }, 'mini-b'), btn('🗑', () => { T.circuit.parts = T.circuit.parts.filter(x => x !== p); T.circuit.connections = T.circuit.connections.filter(c => !c[0].startsWith(p.id + ':') && !c[1].startsWith(p.id + ':')); T.sel = null; save(); draw(); }, 'mini-b')); }
    return; }
  box.append(el('span', { class: 'note' }, T.runner ? 'Pulsa los botones y gira los potenciómetros del circuito. Toca un sensor para cambiar lo que «ve».' : 'Toca una pata y luego otra para tender un cable. Arrastra las piezas; si caen sobre la protoboard, se clavan solas.'));
}
function slider(label, v, set, fmt = x => Math.round(x * 100) + ' %') { const out = el('small', {}, fmt(v)); const s = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: v, on: { input: e => { set(+e.target.value); out.textContent = fmt(+e.target.value); } } }); return el('label', { class: 'tl-sl' }, label, s, out); }
function redrawPart(p) { const w = R.world.querySelector(`.tl-part[data-id="${p.id}"]`); if (w) w.replaceWith(partNode(p)); requestAnimationFrame(() => { measure(p.id); paintWires(); }); }

/* ---------- Añadir piezas, ejemplos, placa ---------- */
function palette() {
  const grid = el('div', { class: 'tl-pal' }); let close;
  for (const [type, info] of Object.entries(PARTS)) grid.append(btn(el('span', {}, el('i', {}, info.icon), el('b', {}, info.name)), () => { addPart(type); close(); }, 'tl-pi'));
  close = modal('Añadir pieza', el('div', {}, grid, el('p', { class: 'note' }, 'Consejo: pon primero la protoboard y suelta encima las piezas; o une las patas directamente con cables, como prefieras.')));
}
function addPart(type) {
  const info = PARTS[type]; const base = type.replace(/^(wokwi|velxio)-/, '').replace(/-.*/, ''); let n = 1; while (T.circuit.parts.some(p => p.id === base + n)) n++;
  const sc = R.stage.getBoundingClientRect(); const left = Math.round((R.stage.scrollLeft + sc.width * 0.45) / T.zoom), top = Math.round((R.stage.scrollTop + sc.height * 0.3) / T.zoom);
  const p = { type, id: base + n, left, top, rotate: 0, attrs: { ...(info.attrs || {}) } }; T.circuit.parts.push(p); T.sel = { part: p.id }; save(); R.world.querySelectorAll('.tl-part.sel').forEach(x => x.classList.remove('sel'));
  R.world.insertBefore(partNode(p), R.svg); requestAnimationFrame(() => requestAnimationFrame(() => { measure(p.id); paintWires(); tools(); }));
}
function examples() {
  const list = el('div', { class: 'tl-exs' }); let close;
  for (const ex of EXAMPLES) { const ok = supports(ex, T.board); const bt = btn(el('span', {}, el('b', {}, ex.title + ' ' + '⭐'.repeat(ex.level)), el('small', {}, ok ? ex.about : `La ${BOARDS[T.board].name} no tiene entradas analógicas: este necesita un ADC externo.`)), async () => { if (!ok) return; if (T.circuit.parts.length > 1 && !(await confirmBox('Abrir ejemplo', 'Se sustituye el circuito y el código actuales.', 'Abrir'))) return; close(); useExample(ex.id); }, 'tl-ex' + (ok ? '' : ' off')); list.append(bt); }
  close = modal('Ejemplos', list, { wide: true });
}
async function switchBoard(k) {
  if (k === T.board) return; const ex = EXAMPLES.find(e => e.id === T.ex);
  if (ex) { if (!supports(ex, k)) toast(`«${ex.title}» necesita una entrada analógica y la ${BOARDS[k].name} no tiene: abro el parpadeo.`, 4000); useExample(ex.id, k); return; }
  if (!(await confirmBox('Cambiar de placa', `Tu circuito es tuyo: abro el ejemplo «Parpadeo» para la ${BOARDS[k].name}. (Guárdalo antes con ⋯ → Guardar si lo quieres.)`, 'Cambiar'))) return; useExample('blink', k);
}
/* ---------- Elegir placa ---------- */
function boardPicker() {
  let close; const body = el('div', { class: 'tl-boards' });
  for (const [fam, title, sub] of FAMILIES) {
    const list = Object.values(BOARDS).filter(b => b.family === fam); if (!list.length) continue;
    body.append(el('h4', {}, title, el('small', {}, ' · ' + sub)));
    const grid = el('div', { class: 'tl-bgrid' });
    for (const b of list) grid.append(btn(el('span', {}, el('b', {}, b.name), el('i', {}, b.chip), el('em', { class: b.engine === 'shim' ? 'sim' : 'emu' }, SIM_KIND(b)), el('small', {}, b.about)), () => { close(); switchBoard(b.key); }, 'tl-bcard' + (b.key === T.board ? ' on' : '')));
    body.append(grid);
  }
  body.append(el('p', { class: 'note' }, '«Chip emulado»: el procesador se emula instrucción a instrucción. «Simulada»: tu programa corre en MicroPython sobre un RP2040 emulado, con una capa que imita los pines y librerías de esa placa (la ves y la cambias en 🔩 Por dentro). La lógica de tu código, los tiempos y los circuitos se comportan igual; lo que no se simula son las radios (WiFi, Bluetooth), las cámaras o la IA de la placa.'));
  close = modal('Elige placa', body, { wide: true });
}
/* ---------- Por dentro: qué lleva la placa y el código que corre dentro ---------- */
function inside() {
  const b = BOARDS[T.board]; let close;
  const how = b.engine === 'avr' ? `Se emula el chip ${b.chip} entero (avr8js): tu C++ se compila con arduino-cli y el simulador ejecuta el binario instrucción a instrucción, con sus temporizadores, ADC y puerto serie.`
    : b.engine === 'pico' ? `Se emula el chip ${b.chip.split(' ')[0]} entero (rp2040js) con el firmware oficial de MicroPython 1.20 dentro. Lo que escribes se manda por el REPL, como haría Thonny.`
    : b.flavor === 'linux' ? `La ${b.name} es un ordenador con Linux: allí tu programa es Python normal que usa ${b.lib}. Aquí corre en MicroPython sobre un RP2040 emulado, con una capa que imita ${b.lib} (y RPi.GPIO, gpiozero y wiringpi) sobre los 40 pines.`
    : `Tu programa corre en MicroPython sobre un RP2040 emulado. La capa de abajo traduce los pines de la ${b.name} (${b.chip}) y sus módulos (${b.flavor === 'stm32' ? 'machine y pyb' : 'machine, neopixel, network'}) al chip simulado.`;
  const rows = []; const g = gpMap(b); const an = new Set(analogPins(b));
  const art = (customElements.get(b.tag) && document.createElement(b.tag).pinInfo) || [];
  for (const p of art) rows.push(el('tr', {}, el('td', {}, p.name), el('td', {}, boardPinLabel(b, p.name).replace(/^[^·]*·?\s*/, '') || (an.has(p.name) ? 'analógica' : '—'))));
  const pinTable = el('details', {}, el('summary', {}, `📌 Patillaje (${art.length} patas)`), el('table', { class: 'tl-pins' }, el('tr', {}, el('th', {}, 'Pata'), el('th', {}, 'Qué es')), ...rows));
  const parts = [el('p', {}, el('b', {}, `${b.name} · ${b.chip}`), ' ', el('em', { class: 'tl-kind ' + (b.engine === 'shim' ? 'sim' : 'emu') }, SIM_KIND(b))), el('p', { class: 'note' }, how)];
  if (b.note) parts.push(el('p', { class: 'note' }, 'ℹ️ ' + b.note));
  parts.push(pinTable);
  parts.push(el('div', { class: 'row-btns' }, btn('📦 Cargar el programa de fábrica', async () => { if (T.code.trim() && !(await confirmBox('Programa de fábrica', 'Sustituye tu código por el que trae la placa de serie (un parpadeo).', 'Cargar'))) return; T.code = insideCode(T.board); R.code.value = T.code; save(); close(); toast('📦 Cargado: es lo que corre en la placa al sacarla de la caja'); }, 'mini-b')));
  if (b.engine === 'shim') {
    const orig = supportCode(b); const ta = el('textarea', { class: 'tl-code tl-inside', spellcheck: false, rows: 16 }); ta.value = T.inside[T.board] || orig;
    const st = el('small', { class: 'note' }, T.inside[T.board] ? '✏️ Cambiada por ti' : 'Original');
    parts.push(el('h4', {}, '🧬 Soporte de la placa (lo que corre debajo de tu código)'),
      el('p', { class: 'note' }, 'Se ejecuta antes de tu programa. Puedes tocarlo: añadir funciones a un módulo, cambiar qué GPIO del chip simulado va a cada pata, inventarte una librería… Si rompes algo, «Restaurar».'), ta,
      el('div', { class: 'row-btns' }, btn('💾 Guardar', () => { if (ta.value.trim() === orig.trim()) delete T.inside[T.board]; else T.inside[T.board] = ta.value; save(); st.textContent = T.inside[T.board] ? '✏️ Cambiada por ti' : 'Original'; toast('Guardado: se usa al pulsar ▶'); }, 'mini-b on'),
        btn('↩️ Restaurar', () => { ta.value = orig; delete T.inside[T.board]; save(); st.textContent = 'Original'; }, 'mini-b'), st));
  }
  close = modal('🔩 Por dentro', el('div', { class: 'tl-insidebox' }, ...parts), { wide: true });
}
function more() {
  let close; const file = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none', on: { change: async e => { const f = e.target.files[0]; if (!f) return; try { importDiagram(JSON.parse(await f.text())); close(); } catch (er) { toast('No es un diagram.json válido'); } } } });
  close = modal('Más', el('div', { class: 'tl-more' },
    btn('🆕 Circuito vacío', async () => { if (!(await confirmBox('Empezar de cero', 'Se borra el circuito actual.', 'Vaciar'))) return; stop(); T.circuit = { version: 1, author: 'Plató', editor: 'plato-taller', parts: [exampleCircuit(EXAMPLES[0], T.board).parts[0]], connections: [] }; T.code = insideCode(T.board); T.ex = null; save(); close(); draw(); }, 'b'),
    btn('📥 Abrir diagram.json (Wokwi / Velxio)', () => file.click(), 'b'), file,
    btn('📤 Guardar (diagram.json + código)', () => download(new Blob([JSON.stringify({ ...T.circuit, plato: { board: T.board, code: T.code } }, null, 2)], { type: 'application/json' }), 'diagram.json'), 'b'),
    btn('💾 Descargar el código', () => download(new Blob([T.code], { type: 'text/plain' }), fileName(BOARDS[T.board])), 'b'),
    el('p', { class: 'note' }, 'El formato es el de Wokwi y Velxio: puedes abrir aquí sus proyectos y llevarte los tuyos allí.')));
}
function importDiagram(d) {
  if (!d || !Array.isArray(d.parts)) throw new Error('formato');
  const parts = d.parts.map(p => ({ type: TYPE_ALIAS[p.type] || BOARD_ALIAS[p.type] || p.type, from: p.type, id: p.id, left: +p.left || 0, top: +p.top || 0, rotate: +p.rotate || 0, attrs: p.attrs || {} }));
  const bp = parts.find(p => boardByType(p.type)); if (!bp) return toast('Ese proyecto usa una placa que el taller aún no tiene.'); const brd = boardByType(bp.type).key;
  // Wokwi llama «D2» a los pines del ESP32 que aquí son «2»
  const ren = bp.from === 'wokwi-esp32-devkit-v1' ? (n => /^D\d+$/.test(n) ? n.slice(1) : ({ 'GND.1': 'GND', 'GND.2': 'GND2' }[n] || n)) : (n => n);
  const fix = ref => { const [id, pin] = String(ref).split(':'); return id === bp.id ? id + ':' + ren(pin) : ref; };
  const unknown = parts.filter(p => !PARTS[p.type] && p !== bp).map(p => p.type);
  stop(); T.fit = true; T.board = brd; T.circuit = { version: 1, author: d.author || '', editor: 'plato-taller', parts: parts.filter(p => PARTS[p.type] || p === bp).map(({ from, ...p }) => p), connections: (d.connections || []).filter(c => Array.isArray(c) && c.length >= 2).map(c => [fix(c[0]), fix(c[1]), c[2] || 'green', c[3] || []]) };
  T.code = (d.plato && d.plato.code) || T.code; T.ex = null; save(); draw(); if (unknown.length) toast('Piezas que aún no tengo: ' + [...new Set(unknown)].join(', '), 5000);
}

/* ---------- Simulación ---------- */
let frame = null, audio = null;
async function start() {
  if (T.runner) return; T.serial = ''; R.mon.textContent = ''; R.runBtn.textContent = '⏳'; R.mon.classList.remove('err');
  const say = s => { T.serial += s; R.mon.textContent = T.serial.slice(-6000); R.mon.scrollTop = R.mon.scrollHeight; };
  try {
    measure(); let runner;
    const b = BOARDS[T.board];
    if (b.engine === 'avr') { const hex = await compileUno(T.code, say); if (!hex) { R.runBtn.textContent = '▶ Simular'; return; } runner = await AvrRunner.create(hex, { pins: [...UNO_PINS, ...(b.extraPins || [])] }); }
    else { const g = gpMap(b); const pins = mcuPins(b);
      if (b.engine === 'pico') { say(`Arrancando MicroPython en la ${b.name} (chip emulado)…\n`); runner = await PicoRunner.create(T.code, b.key === 'pico' ? {} : { map: g.map, pins }); }
      else { say(`Simulando la ${b.name}: ${b.flavor === 'linux' ? 'Python con ' + b.lib : 'MicroPython'} sobre un RP2040 emulado…\n`);
        const adcKeys = (b.adc || []).filter(k => g.keys[k] != null); const adc = Object.fromEntries((b.io || []).filter(x => x[1] && adcKeys.includes(x[0])).map(x => [x[1], adcKeys.indexOf(x[0])]));
        runner = await PicoRunner.create(T.code, { map: g.map, pins, adc, prelude: (T.inside[T.board] || supportCode(b)).replace(/\r/g, '').replace(/\n*$/, '\n') }); } }
    runner.serial = say; runner.onError = e => { say('\n❌ ' + e.message + '\n'); R.mon.classList.add('err'); stop(true); };
    T.runner = runner; wireUp(runner); runner.start(); R.runBtn.textContent = '■ Parar'; R.root.classList.add('running'); tools(); loop();
  } catch (e) { say('❌ ' + e.message + '\n'); R.mon.classList.add('err'); R.runBtn.textContent = '▶ Simular'; }
}
async function compileUno(code, say) {
  const pre = PREBUILT[norm(code)]; if (pre) { const r = await fetch(pre); if (r.ok) { say('(programa ya compilado)\n'); return await r.text(); } }
  if (!localBase()) { say('Para compilar C++ hace falta Plató abierto como aplicación en tu ordenador (usa arduino-cli).\nMientras tanto: elige una placa con Python (Pico, ESP32, STM32…), que funciona aquí mismo, o el ejemplo «Parpadeo».\n'); R.mon.classList.add('err'); return null; }
  say('Compilando con arduino-cli…\n');
  const r = await fetch(localBase() + '/api/taller/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ board: T.board, code }) }); const j = await r.json();
  if (!r.ok || j.error) { say('❌ ' + (j.error || 'No se pudo compilar') + '\n' + (j.log || '')); R.mon.classList.add('err'); return null; }
  say(`✅ Compilado (${j.size || '?'} bytes)\n`); return j.hex;
}
// Escuchas que necesitan precisión de microsegundos: servo (ancho de pulso), LCD (flanco de E), sensor de distancia.
function wireUp(runner) {
  T.uf0 = staticNets(T.circuit, T.geo); T.forced = new Set(); const bp = boardPart(); const net = id => T.uf0.f(id);
  const mcuOn = ref => runner.pins.find(pin => net(bp.id + ':' + pin) === net(ref));
  T.extra = {}; T.lcd = {};
  for (const p of T.circuit.parts) {
    if (p.type === 'wokwi-servo') { const pin = mcuOn(p.id + ':PWM'); if (pin) { let t0 = 0; runner.onEdge(pin, (v, t) => { if (v) t0 = t; else { const w = t - t0; if (w > 300 && w < 3000) T.extra[p.id] = { angle: Math.max(0, Math.min(180, (w - 544) / (2400 - 544) * 180)) }; } }); } }
    if (p.type === 'wokwi-lcd1602') { const m = Object.fromEntries(['RS', 'E', 'D4', 'D5', 'D6', 'D7'].map(k => [k, mcuOn(p.id + ':' + k)])); if (m.E && m.RS && m.D4) { const dec = T.lcd[p.id] = new HD44780(); const lv = pin => pin && runner.level(pin).out ? 1 : 0;
      runner.onEdge(m.E, v => { if (!v) dec.latch(lv(m.RS), lv(m.D4) | lv(m.D5) << 1 | lv(m.D6) << 2 | lv(m.D7) << 3); }); } }
    if (p.type === 'wokwi-hc-sr04') { const trig = mcuOn(p.id + ':TRIG'), echo = mcuOn(p.id + ':ECHO'); if (trig && echo) { T.forced.add(echo); let t0 = 0; runner.setInput(echo, false);
      runner.onEdge(trig, (v, t) => { if (v) t0 = t; else if (t - t0 >= 8) { const cm = (T.ui[p.id] && T.ui[p.id].cm) || 100; runner.after(250, () => { runner.setInput(echo, true); runner.after(cm * 58, () => runner.setInput(echo, false)); }); } }); } }
  }
}
function loop() {
  const r = T.runner; if (!r) return; const bp = boardPart();
  const forcedRunner = new Proxy(r, { get: (o, k) => k === 'setInput' ? (pin, v) => { if (!T.forced.has(pin)) o.setInput(pin, v); } : k === 'setAnalog' ? (pin, v) => { if (!T.forced.has(pin)) o.setAnalog(pin, v); } : typeof o[k] === 'function' ? o[k].bind(o) : o[k] });
  const res = evaluate({ circuit: T.circuit, uf0: T.uf0, runner: forcedRunner, board: { key: T.board, id: bp.id }, ui: T.ui });
  for (const [id, props] of Object.entries({ ...res.out, ...T.extra })) { const e = R.world.querySelector(`.tl-part[data-id="${id}"]`); if (!e) continue; const x = e.firstChild;
    for (const [k, v] of Object.entries(props)) { if (k === 'burn') { e.classList.toggle('burn', !!v); continue; } if (k === 'freq') continue; if (x[k] !== v && !(Array.isArray(v) && JSON.stringify(x[k]) === JSON.stringify(v))) x[k] = v; } }
  for (const [id, dec] of Object.entries(T.lcd)) { const x = R.world.querySelector(`.tl-part[data-id="${id}"]`); if (x) { x.firstChild.characters = dec.chars(); } }
  // Zumbador
  const bz = Object.values(res.out).find(o => o.hasSignal);
  try { if (bz) { if (!audio) { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; g.gain.value = 0; o.connect(g).connect(ctx.destination); o.start(); audio = { ctx, o, g }; } audio.o.frequency.value = Math.max(40, Math.min(8000, bz.freq)); audio.g.gain.value = 0.06; } else if (audio) audio.g.gain.value = 0; } catch (e) {}
  const w = res.warn.join(' '); if (R.warn.textContent !== w) { R.warn.textContent = w; R.warn.classList.toggle('on', !!w); }
  frame = setTimeout(loop, 33);
}
function stop(keepMsg) {
  if (T.runner) { try { T.runner.stop(); } catch (e) {} } T.runner = null; clearTimeout(frame);
  if (audio) { try { audio.g.gain.value = 0; } catch (e) {} }
  if (!R || !R.world) return; R.root.classList.remove('running'); if (R.runBtn) R.runBtn.textContent = '▶ Simular'; if (R.warn && !keepMsg) { R.warn.textContent = ''; R.warn.classList.remove('on'); }
  for (const w of R.world.querySelectorAll('.tl-part')) { const x = w.firstChild; w.classList.remove('burn'); if ('value' in x && x.tagName === 'WOKWI-LED') { x.value = false; } if (x.tagName === 'WOKWI-RGB-LED') { x.ledRed = x.ledGreen = x.ledBlue = 0; } if (x.tagName === 'WOKWI-BUZZER') x.hasSignal = false; if ('led13' in x) { x.led13 = false; x.ledPower = false; } if ('led25' in x) x.led25 = false; if ('ledBuiltIn' in x) { x.ledBuiltIn = false; x.ledPower = false; } if ('leds' in x) x.leds = {}; if (x.tagName === 'WOKWI-7SEGMENT') x.values = [0, 0, 0, 0, 0, 0, 0, 0]; }
  tools();
}
export function leaveTaller() { stop(); }
export const _t = { T, draw: () => draw(), useExample, start, stop, tapPin, addPart, measure: () => measure(), paint: () => paintWires(), importDiagram, loadDesign };

/* ---------- El profe: monta el circuito por ti o te lo explica ---------- */
function catalogText() {
  const lines = Object.entries(PARTS).filter(([, i]) => i.kind !== 'bb').map(([t, i]) => `- ${t} (${i.name}) pines: ${Object.keys(i.pins).join(', ') || 'RS, E, D4, D5, D6, D7, VSS, VDD, RW, A, K'}${i.opts ? ' · attrs: ' + Object.entries(i.opts).map(([k, v]) => `${k}=${v.join('|')}`).join(' ') : ''}`);
  return lines.join('\n');
}
function teacher() {
  const ta = el('textarea', { class: 'txt', rows: 3, placeholder: 'Ej.: «un semáforo con botón para peatones» o «que el servo se mueva según la luz»' }); const out = el('div', { class: 'tl-ans' }); let close;
  const b = BOARDS[T.board];
  close = modal('🤖 El profe del taller', el('div', {}, ta, el('div', { class: 'row-btns' },
    btn('🔧 Móntamelo', async e => { if (!llmReady()) return toast('Elige un modelo en Ajustes (o uno local en IA local)'); const want = ta.value.trim(); if (!want) return; const bt = e.currentTarget; bt.textContent = '⏳ Diseñando…'; bt.disabled = true;
      try { const j = await llmJSON(`Eres un profesor de electrónica. Diseña un circuito sencillo y seguro para: "${want}".
Placa: ${b.name} (id "${b.id}"). Patas de señal: ${(mcuPins(b) || [...UNO_PINS, ...(b.extraPins || [])]).join(', ')}; analógicas: ${analogPins(b).join(', ') || 'ninguna'}; alimentación: ${Object.entries(b.power).map(([k, v]) => `${k}=${v ? v + ' V' : 'GND'}`).join(', ')}.${b.flavor === 'linux' ? ' Los nombres de pata son los números físicos de la cabecera.' : ''}
Piezas disponibles:\n${catalogText()}
Reglas: cada LED con su resistencia de 220 en serie; los botones entre un pin y GND (con pull-up interno); usa solo pines que existan${b.vcc < 4 && !b.tol5 ? '; nada de 5 V en pines de señal (la placa va a 3,3 V)' : ''}.
Código en ${langHint(b)}, con comentarios cortos en español.
Responde SOLO JSON: {"title":"…","parts":[{"type":"wokwi-led","id":"led1","attrs":{"color":"red"}}],"connections":[["led1:A","r1:2"],["r1:1","${b.id}:${b.roles.led}"]],"code":"…","explain":["paso 1","paso 2"]}`, { maxTokens: 3500 });
        loadDesign(j); close(); toast('🔧 ¡Montado! Pulsa ▶ para probarlo');
      } catch (er) { out.textContent = '❌ ' + er.message; } bt.textContent = '🔧 Móntamelo'; bt.disabled = false; }, 'b on'),
    btn('🧑‍🏫 Explícame mi circuito', async e => { if (!llmReady()) return toast('Elige un modelo en Ajustes'); const bt = e.currentTarget; bt.textContent = '⏳';
      try { out.textContent = await llmText(`Explica en español, a alguien que empieza, qué hace este circuito y su código, en 6-10 frases cortas. Señala cualquier error o peligro (LED sin resistencia, cortocircuitos, 5 V en pines de 3,3 V). La placa es una ${BOARDS[T.board].name}.\nCircuito: ${JSON.stringify({ parts: T.circuit.parts.map(p => ({ id: p.id, type: p.type, attrs: p.attrs })), connections: T.circuit.connections.map(c => [c[0], c[1]]) })}\nCódigo:\n${T.code}`, { maxTokens: 900 }); } catch (er) { out.textContent = '❌ ' + er.message; } bt.textContent = '🧑‍🏫 Explícame mi circuito'; }, 'b')), out));
}
function loadDesign(j) {
  if (!j || !Array.isArray(j.parts) || !Array.isArray(j.connections)) throw new Error('El profe no devolvió un circuito válido');
  const b = BOARDS[T.board]; const parts = [exampleCircuit(EXAMPLES[0], T.board).parts[0]]; let col = 0, row = 0;
  for (const p of j.parts) { const t = TYPE_ALIAS[p.type] || p.type; if (!PARTS[t] || PARTS[t].kind === 'bb' || !p.id || p.id === b.id) continue;
    const sbc = b.flavor === 'linux'; parts.push({ type: t, id: String(p.id).replace(/[^\w-]/g, ''), left: (sbc ? 60 : b.px + 10) + col * 120, top: (sbc ? b.py : 30) + row * 110, rotate: 0, attrs: { ...(PARTS[t].attrs || {}), ...(p.attrs || {}) } }); if (++col > 2) { col = 0; row++; } }
  const ids = new Set(parts.map(p => p.id)); const conns = j.connections.filter(c => Array.isArray(c) && ids.has(String(c[0]).split(':')[0]) && ids.has(String(c[1]).split(':')[0])).map((c, i) => [c[0], c[1], /GND/.test(c[0] + c[1]) ? 'black' : /5V|3V3|VBUS|VCC|V\+/.test(c[0] + c[1]) ? 'red' : WIRE_COLORS[i % WIRE_COLORS.length], []]);
  stop(); T.fit = true; T.circuit = { version: 1, author: 'Profe de Plató', editor: 'plato-taller', parts, connections: conns }; T.code = String(j.code || T.code); T.ex = null; T.explain = j.explain || []; save(); draw();
  if (T.explain.length) setTimeout(() => modal('📝 ' + (j.title || 'Tu circuito'), el('ol', { class: 'tl-steps' }, T.explain.map(s => el('li', {}, s)))), 400);
}

/* ---------- Llevarlo a la mesa ---------- */
function toReal() {
  const b = BOARDS[T.board]; const items = bom(T.circuit); const steps = T.circuit.connections.map((c, i) => el('label', { class: 'tl-step', on: { mouseenter: () => { T.sel = { wire: i }; paintWires(); } } }, el('input', { type: 'checkbox' }), el('span', {}, `${i + 1}. Une ${describePin(T.circuit, c[0])} con ${describePin(T.circuit, c[1])}${c[2] ? ` (cable ${COLOR_ES[c[2]] || c[2]})` : ''}.`)));
  const st = el('small', { class: 'lai-log' });
  const upload = localBase() ? btn('⬆ Grabar en mi placa (USB)', async e => { const bt = e.currentTarget; bt.disabled = true; st.textContent = '⏳ Buscando la placa y grabando…';
      try { const r = await fetch(localBase() + '/api/taller/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ board: T.board, code: T.code, kind: b.engine === 'avr' ? 'avr' : b.flavor === 'linux' ? 'linux' : 'mpy' }) }); const j = await r.json(); st.textContent = j.error ? '❌ ' + j.error : '✅ ' + (j.text || 'Grabado'); } catch (er) { st.textContent = '❌ ' + er.message; } bt.disabled = false; }, 'b on')
    : el('p', { class: 'note' }, realHint(b));
  modal('🧰 Llévalo a la mesa', el('div', { class: 'tl-real' },
    el('h4', {}, '🛒 Lista de la compra'), el('ul', {}, items.map(x => el('li', {}, `${x.n} × ${x.item}`))),
    el('h4', {}, '🔌 Montaje paso a paso'), el('p', { class: 'note' }, 'Hazlo con la placa desconectada del USB. Pasa el ratón por un paso para ver ese cable en el circuito.'), el('div', {}, steps),
    el('h4', {}, '⬆ El programa'), upload, st,
    el('div', { class: 'row-btns' }, btn('💾 Descargar ' + fileName(b), () => download(new Blob([T.code], { type: 'text/plain' }), fileName(b)), 'mini-b'))), { wide: true });
}

function langHint(b) {
  if (b.lang === 'cpp') return 'Arduino C++ (sin librerías raras; Servo y LiquidCrystal valen)';
  if (b.flavor === 'linux') return b.lib === 'gpiozero' ? 'Python con gpiozero (pines por número BCM; la tabla físico→BCM es la de Raspberry Pi)' : b.lib === 'wiringpi' ? 'Python con wiringpi, llamando a wiringPiSetupPhys() (pines por número físico)' : `Python con ${b.lib} en modo GPIO.BOARD (pines por número físico)${b.pwmPins ? `; PWM solo en los pines ${b.pwmPins.join(', ')}` : ''}`;
  if (b.flavor === 'stm32') return `MicroPython para STM32 (machine.Pin('${keyOf(b, b.roles.led)}'), machine.ADC, y PWM con pyb.Timer(n, freq=…).channel(c, pyb.Timer.PWM, pin=…))`;
  if (b.flavor === 'esp32') return 'MicroPython para ESP32 (machine.Pin(n), PWM, ADC(Pin(n), atten=ADC.ATTN_11DB)); los pines por su número de GPIO';
  return `MicroPython para la ${b.name} (machine.Pin, PWM, ADC)`;
}
function realHint(b) {
  const tail = ' Con Plató abierto como aplicación en tu ordenador lo grabo yo por USB.';
  if (b.engine === 'avr') return 'Para pasarlo a tu Arduino: pega el código en el IDE de Arduino y súbelo.' + tail;
  if (b.flavor === 'linux') return `En la ${b.name} de verdad: guarda el código como main.py, cópialo (scp, un pendrive o pégalo en Thonny/VS Code) y ejecútalo con «python3 main.py». Puede necesitar sudo para acceder a los pines.`;
  if (b.key === 'bluepill') return 'La Blue Pill no tiene MicroPython oficial: este código te sirve para probar la idea; en la placa real tradúcelo a C (STM32CubeIDE) o a Arduino (núcleo STM32duino).';
  return `Para pasarlo a tu ${b.name}: instálale MicroPython (micropython.org/download), abre Thonny y guarda este código como main.py.` + tail;
}
