// 🔌 Taller de electrónica: monta el circuito, prográmalo y simúlalo; luego llévalo a la mesa.
// Motores: avr8js (Arduino) y rp2040js + MicroPython (Pico y, con una capa de soporte, ESP32, STM32 y placas Linux), de Wokwi;
// piezas de @wokwi/elements; protoboards, dibujos de placas y firmware de Velxio.
import { el, btn, toast, modal, confirmBox, download } from './core.js';
import { localBase } from './local.js';
import { llmReady, llmJSON, llmText } from './llm.js';
import { BOARDS, PARTS, TYPE_ALIAS, staticNets, evaluate, definePico, HD44780, bom, describePin, fmtOhms, COLOR_ES, chipOf } from './taller/circuit.js';
import { FAMILIES, defineBoards, boardByType, BOARD_ALIAS, supportCode, libsCode, LIB_SRC, gpMap, mcuPins, analogPins, pinLabel as boardPinLabel, powerOf, fileName, keyOf } from './taller/boards.js';
import { EXAMPLES, exampleCircuit, exampleCode, supports, insideCode, norm, PREBUILT } from './taller/examples.js';
import { AvrRunner, PicoRunner, UNO_PINS } from './taller/sim.js';
import { codeEditor, completionsFor } from './taller/editor.js';
import { fmtA, fmtV } from './taller/solver.js';
import { Recorder, instrumentsPanel } from './taller/instruments.js';
import { defineParts } from './taller/parts.js';
import { I2CBus, PinSlave, attachRP2040, attachAVR } from './taller/i2c.js';
import { SSD1306, MPU6050, BMP280, DS1307, LcdI2C, WS2812 } from './taller/devices.js';
import { RealBoard, webSerialOk } from './taller/webserial.js';
import { Plant, PLANTS } from './taller/plant.js';
import { PLANT_SIGNALS, plantProgram, hasProgram } from './taller/plantcode.js';
import { UtilLink, UTIL_CH, fetchFirmware } from './taller/util.js';

const KEY = 'plato.taller.v1', PKEY = 'plato.taller.plant.v1';
const WIRE_COLORS = ['green', 'blue', 'orange', 'purple', 'yellow', 'white', 'cyan'];
const T = { board: 'pico', circuit: null, code: '', sel: null, wireFrom: null, runner: null, ui: {}, geo: { pins: {} }, zoom: 1, serial: '', ex: 'blink', dirty: false, inside: {} };
let ready = null;
const loadLibs = () => ready || (ready = (async () => { await import('./vendor/wokwi-elements.js'); await import('./vendor/velxio-breadboards.js'); definePico(); defineBoards(); defineParts(); })());

function save() { try { localStorage.setItem(KEY, JSON.stringify({ board: T.board, circuit: T.circuit, code: T.code, ex: T.ex, inside: T.inside, mode: T.mode })); } catch (e) {} }
function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.circuit) Object.assign(T, s); } catch (e) {} if (!BOARDS[T.board]) T.circuit = null; if (!T.circuit) useExample('blink', 'pico', false); T.inside = T.inside || {}; }
function useExample(id, board = T.board, render = true) {
  let ex = EXAMPLES.find(e => e.id === id) || EXAMPLES[0]; if (!supports(ex, board)) ex = EXAMPLES[0];
  if (T.circuit && R) hist(); stop(); T.fit = true; T.serial = ''; T.ex = ex.id; T.board = board; T.circuit = exampleCircuit(ex, board); T.code = exampleCode(ex, board); T.sel = null; T.ui = {}; save(); if (render) draw(); }
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
    el('div', { class: 'tl-seg' }, btn('🔌 Circuito', () => setMode('circuit'), 'b' + (T.mode !== 'plant' ? ' on' : '')), btn('🏭 Planta', () => setMode('plant'), 'b' + (T.mode === 'plant' ? ' on' : ''))),
    btn(el('span', { class: 'tl-bname' }, el('b', {}, (FAMILIES.find(f => f[0] === b.family) || ['', '🔲'])[1].split(' ')[0] + ' ' + b.name), el('small', {}, `${b.chip} · ${b.lang === 'cpp' ? 'C++' : b.flavor === 'linux' ? 'Python' : 'MicroPython'} ▾`)), boardPicker, 'b tl-bpick'),
    btn('🔩 Por dentro', inside, 'b'),
    R.runBtn = btn(T.runner ? '■ Parar' : '▶ Simular', () => T.runner ? stop() : start(), 'b on tl-run'), R.pauseBtn = btn(T.paused ? '▶' : '⏸', togglePause, 'b tl-pause'),
    btn('＋ Pieza', palette, 'b'), btn('📈', () => { T.showIns = !T.showIns; draw(); }, 'b' + (T.showIns ? ' on' : '')), btn('📚 Ejemplos', examples, 'b'), btn('🤖 Profe', teacher, 'b'), btn('🧰 A la mesa', toReal, 'b'), btn('⋯', more, 'b'));
  R.warn = el('div', { class: 'tl-warn' }); R.status = el('div', { class: 'tl-status' }); R.probeEl = el('div', { class: 'tl-probe', hidden: true });
  // Lienzo
  R.world = el('div', { class: 'tl-world', style: `transform:scale(${T.zoom})` });
  R.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); R.svg.classList.add('tl-wires'); R.svg.setAttribute('width', 2000); R.svg.setAttribute('height', 1400);
  R.stage = el('div', { class: 'tl-stage', on: { pointerdown: stageDown, pointermove: stageMove, pointerup: stageUp, wheel: e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(T.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } } } },
    R.world, el('div', { class: 'tl-zoom' }, btn('−', () => setZoom(T.zoom / 1.2), 'mini-b'), btn('＋', () => setZoom(T.zoom * 1.2), 'mini-b')));
  R.tools = el('div', { class: 'tl-tools' });
  for (const p of T.circuit.parts) R.world.append(partNode(p));
  R.world.append(R.svg);
  // Panel lateral: código y monitor
  R.ed = codeEditor({ value: T.code, lang: b.lang === 'cpp' ? 'cpp' : 'python', completions: completionsFor(b), onChange: v => { T.code = v; save(); } }); R.code = R.ed.el; R.code.classList.add('tl-code');
  R.mon = el('pre', { class: 'tl-mon' }, T.serial || (b.lang === 'python' ? 'La salida de print() aparece aquí.' : 'La salida de Serial.print() aparece aquí.'));
  const inp = el('input', { class: 'txt', placeholder: 'Escribe y pulsa Intro para mandarlo por el puerto serie', on: { keydown: e => { if (e.key === 'Enter' && T.runner) { T.runner.write(e.target.value + '\n'); e.target.value = ''; } } } });
  const side = el('div', { class: 'tl-side' }, el('div', { class: 'tl-h' }, el('b', {}, b.lang === 'cpp' ? '⚙️ Arduino C++' : b.flavor === 'linux' ? `🐍 Python · ${b.lib}` : b.flavor === 'stm32' ? '🐍 MicroPython · STM32' : '🐍 MicroPython'), el('small', {}, (EXAMPLES.find(e => e.id === T.ex) || {}).title || 'Tu circuito')), R.code, el('div', { class: 'tl-h' }, el('b', {}, '🖥 Monitor')), R.mon, inp);
  const plantMode = T.mode === 'plant'; if (R.pv) { R.pv.dispose(); R.pv = null; } R.plantHost = plantMode ? el('div', { class: 'tl-planthost' }, el('div', { class: 'empty' }, 'Montando la planta 3D…')) : null;
  root.append(bar, R.warn, el('div', { class: 'tl-main' }, el('div', { class: 'tl-left' + (plantMode ? ' plant' : '') }, R.tools, el('div', { class: 'tl-stagewrap' }, R.stage, R.probeEl), R.plantHost || '', T.showIns ? insPanel().el : '', R.status), side));
  if (plantMode) mountPlant(R.plantHost);
  tools(); requestAnimationFrame(() => requestAnimationFrame(() => { measure(); if (T.fit !== false) fit(); paintWires(); }));
}
// Encaja el circuito en la pantalla (las piezas de verdad son pequeñas: mejor verlas grandes).
function fit() { const all = Object.values(T.geo.pins).flat(); if (!all.length) return; const xs = all.map(p => p.ax), ys = all.map(p => p.ay);
  const w = Math.max(...xs) + 60, h = Math.max(...ys) + 80; const r = R.stage.getBoundingClientRect(); const z = Math.max(0.8, Math.min(2.2, Math.min(r.width / w, r.height / h)));
  setZoom(Math.round(z * 100) / 100); T.fit = false; }
function setZoom(z) { T.zoom = Math.max(0.4, Math.min(2.5, z)); R.world.style.transform = `scale(${T.zoom})`; }

function partNode(p) {
  const type = TYPE_ALIAS[p.type] || p.type; const elx = document.createElement(type);
  for (const [k, v] of Object.entries(p.attrs || {})) if (v != null) elx.setAttribute(k, v);
  const wrap = el('div', { class: 'tl-part' + (selIds().includes(p.id) ? ' sel' : ''), 'data-id': p.id, style: `left:${p.left}px;top:${p.top}px;transform:rotate(${p.rotate || 0}deg)` }, elx);
  if (PARTS[type] && PARTS[type].kind === 'bb') wrap.classList.add('bb');
  // Interacción de la pieza durante la simulación
  elx.addEventListener('button-press', () => { T.ui[p.id] = { ...(T.ui[p.id] || {}), pressed: true }; });
  elx.addEventListener('button-release', () => { T.ui[p.id] = { ...(T.ui[p.id] || {}), pressed: false }; });
  elx.addEventListener('input', e => { T.ui[p.id] = { ...(T.ui[p.id] || {}), value: +(e.detail ?? elx.value) }; });
  // Arrastrar (si está seleccionada con otras, se mueven todas); Mayús+clic añade o quita de la selección
  let st = null;
  wrap.addEventListener('pointerdown', e => { if (e.button) return; const interactive = T.runner && ['wokwi-pushbutton', 'wokwi-potentiometer', 'wokwi-slide-switch', 'wokwi-slide-potentiometer', 'wokwi-analog-joystick'].includes(type); if (interactive) return;
    e.preventDefault(); e.stopPropagation(); if (T.tool === 'probe') return probeAt(p, e);
    if (e.shiftKey) { const ids = selIds(); setSel({ parts: ids.includes(p.id) ? ids.filter(x => x !== p.id) : [...ids, p.id] }); return; }
    if (!selIds().includes(p.id)) setSel({ parts: [p.id] });
    wrap.setPointerCapture(e.pointerId); st = { x: e.clientX, y: e.clientY, moved: false, from: selIds().map(id => { const q = T.circuit.parts.find(x => x.id === id); return q && [q, q.left, q.top]; }).filter(Boolean) }; });
  wrap.addEventListener('pointermove', e => { if (!st) return; const dx = (e.clientX - st.x) / T.zoom, dy = (e.clientY - st.y) / T.zoom; if (!st.moved && Math.hypot(dx, dy) < 4) return; if (!st.moved) hist(); st.moved = true;
    for (const [q, l, t] of st.from) { q.left = Math.round(l + dx); q.top = Math.round(t + dy); const w = partEl(q.id); if (w) { w.style.left = q.left + 'px'; w.style.top = q.top + 'px'; } measure(q.id); } paintWires(); });
  wrap.addEventListener('pointerup', () => { if (!st) return; const moved = st.moved; const n = st.from.length; st = null; if (moved) { if (n === 1) snap(p); save(); } tools(); paintWires(); });
  return wrap;
}
const partEl = id => R.world.querySelector(`.tl-part[data-id="${id}"]`);
const selIds = () => (T.sel && T.sel.parts) || [];
function setSel(sel) { T.sel = sel; if (R && R.world) R.world.querySelectorAll('.tl-part').forEach(w => w.classList.toggle('sel', selIds().includes(w.dataset.id))); tools(); paintWires(); }
const worldXY = e => { const r = R.world.getBoundingClientRect(); return [(e.clientX - r.left) / T.zoom, (e.clientY - r.top) / T.zoom]; };

/* ---------- Historial: deshacer y rehacer ---------- */
const H = { undo: [], redo: [] };
function hist() { H.undo.push(JSON.stringify(T.circuit)); if (H.undo.length > 120) H.undo.shift(); H.redo.length = 0; }
function undo() { if (!H.undo.length) return toast('Nada que deshacer', 800); if (T.runner) stop(); H.redo.push(JSON.stringify(T.circuit)); T.circuit = JSON.parse(H.undo.pop()); T.sel = null; save(); draw(); }
function redo() { if (!H.redo.length) return toast('Nada que rehacer', 800); if (T.runner) stop(); H.undo.push(JSON.stringify(T.circuit)); T.circuit = JSON.parse(H.redo.pop()); T.sel = null; save(); draw(); }

/* ---------- Lienzo: selección por recuadro, codos de cable, polímetro ---------- */
let band = null;
function stageDown(e) {
  if (e.target !== R.stage && e.target !== R.world && e.target !== R.svg) return; if (e.button) return;
  const [x, y] = worldXY(e);
  if (T.wireFrom) { (T.bends = T.bends || []).push([Math.round(x), Math.round(y)]); paintWires(); return; } // un codo del cable que estás tendiendo
  if (T.tool === 'probe') { T.probe = null; showProbe(); return; }
  band = { x, y, x2: x, y2: y, add: e.shiftKey ? selIds() : [], el: el('div', { class: 'tl-band' }) }; R.world.append(band.el); R.stage.setPointerCapture(e.pointerId);
}
function stageMove(e) {
  if (T.wireFrom && R.preview) { const [x, y] = worldXY(e); R.preview.setAttribute('data-mouse', x + ',' + y); paintPreview(x, y); }
  if (!band) return; const [x, y] = worldXY(e); band.x2 = x; band.y2 = y; const l = Math.min(band.x, x), t = Math.min(band.y, y);
  Object.assign(band.el.style, { left: l + 'px', top: t + 'px', width: Math.abs(x - band.x) + 'px', height: Math.abs(y - band.y) + 'px' });
}
function stageUp() {
  if (!band) return; const b = band; band = null; b.el.remove(); const l = Math.min(b.x, b.x2), r = Math.max(b.x, b.x2), t = Math.min(b.y, b.y2), bo = Math.max(b.y, b.y2);
  if (r - l < 4 && bo - t < 4) { setSel(null); return; }
  const hit = T.circuit.parts.filter(p => { const w = partEl(p.id); if (!w) return false; return p.left < r && p.left + w.offsetWidth > l && p.top < bo && p.top + w.offsetHeight > t; }).map(p => p.id);
  setSel(hit.length || b.add.length ? { parts: [...new Set([...b.add, ...hit])] } : null);
}

/* ---------- Teclado ---------- */
let clip = null;
function onKey(e) {
  if (!R || !R.root.isConnected || T.mode === 'plant') return; const tg = e.target; if (tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
  if (document.querySelector('.modal-bg, .modal')) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); return undo(); }
  if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); return redo(); }
  if (mod && k === 'a') { e.preventDefault(); return setSel({ parts: T.circuit.parts.map(p => p.id) }); }
  if (mod && k === 'c') { if (copySel()) { e.preventDefault(); toast('📋 Copiado', 700); } return; }
  if (mod && k === 'x') { if (copySel()) { e.preventDefault(); delSel(); } return; }
  if (mod && k === 'v') { e.preventDefault(); return paste(); }
  if (mod && k === 'd') { e.preventDefault(); if (copySel()) paste(); return; }
  if (mod && k === 's') { e.preventDefault(); return download(new Blob([JSON.stringify({ ...T.circuit, plato: { board: T.board, code: T.code } }, null, 2)], { type: 'application/json' }), 'diagram.json'); }
  if (mod || e.altKey) return;
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); return delSel(); }
  if (k === 'escape') { T.wireFrom = null; T.bends = null; T.tool = null; return setSel(null); }
  if (k === 'r') return rotSel();
  if (k === 'm') return setTool(T.tool === 'probe' ? null : 'probe');
  if (k === 'p') return togglePause();
  if (k === ' ') { e.preventDefault(); return T.runner ? stop() : start(); }
  if (k === '+' || k === '=') return setZoom(T.zoom * 1.2);
  if (k === '-') return setZoom(T.zoom / 1.2);
  if (k === '0') { T.fit = true; return fit(); }
  const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
  if (arrows && selIds().length) { e.preventDefault(); const d = e.shiftKey ? 9.6 : 1; hist(); for (const id of selIds()) { const p = T.circuit.parts.find(x => x.id === id); if (!p) continue; p.left += arrows[0] * d; p.top += arrows[1] * d; const w = partEl(id); w.style.left = p.left + 'px'; w.style.top = p.top + 'px'; measure(id); } save(); paintWires(); }
}
document.addEventListener('keydown', onKey);
const isBoardPart = p => !!boardByType(TYPE_ALIAS[p.type] || p.type);
function copySel() { const ids = new Set(selIds().filter(id => { const p = T.circuit.parts.find(x => x.id === id); return p && !isBoardPart(p); })); if (!ids.size) return false;
  clip = { parts: T.circuit.parts.filter(p => ids.has(p.id)).map(p => JSON.parse(JSON.stringify(p))), connections: T.circuit.connections.filter(c => ids.has(c[0].split(':')[0]) && ids.has(c[1].split(':')[0])).map(c => JSON.parse(JSON.stringify(c))) };
  try { localStorage.setItem('plato.taller.clip', JSON.stringify(clip)); } catch (e) {} return true; }
function paste() {
  if (!clip) try { clip = JSON.parse(localStorage.getItem('plato.taller.clip') || 'null'); } catch (e) {} if (!clip || !clip.parts.length) return toast('El portapapeles está vacío', 900);
  if (T.runner) stop(); hist(); const ren = {};
  for (const p of clip.parts) { const base = p.id.replace(/\d+$/, '') || 'p'; let n = 1; while (T.circuit.parts.some(q => q.id === base + n) || Object.values(ren).includes(base + n)) n++; ren[p.id] = base + n; }
  const np = clip.parts.map(p => ({ ...JSON.parse(JSON.stringify(p)), id: ren[p.id], left: p.left + 24, top: p.top + 24 }));
  const nc = clip.connections.map(c => [ren[c[0].split(':')[0]] + ':' + c[0].split(':')[1], ren[c[1].split(':')[0]] + ':' + c[1].split(':')[1], c[2], c[3] || []]);
  T.circuit.parts.push(...np); T.circuit.connections.push(...nc); clip = { parts: np, connections: nc }; T.sel = { parts: np.map(p => p.id) }; save(); draw();
}
function delSel() {
  if (T.runner) return toast('Para el circuito (■) para cambiar cosas');
  if (T.sel && T.sel.wire != null) { hist(); T.circuit.connections.splice(T.sel.wire, 1); T.sel = null; save(); tools(); paintWires(); return; }
  const ids = new Set(selIds().filter(id => { const p = T.circuit.parts.find(x => x.id === id); return p && !isBoardPart(p); })); if (!ids.size) return;
  hist(); T.circuit.parts = T.circuit.parts.filter(p => !ids.has(p.id)); T.circuit.connections = T.circuit.connections.filter(c => !ids.has(c[0].split(':')[0]) && !ids.has(c[1].split(':')[0])); T.sel = null; save(); draw();
}
function rotSel() { const ps = selIds().map(id => T.circuit.parts.find(x => x.id === id)).filter(p => p && !isBoardPart(p)); if (!ps.length) return; hist(); for (const p of ps) { p.rotate = ((p.rotate || 0) + 90) % 360; redrawPart(p); } save(); }
export function leaveKeys() { document.removeEventListener('keydown', onKey); }
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
const WIRE_HEX = { green: '#2ecc40', blue: '#3a7bd5', orange: '#ff851b', purple: '#b10dc9', yellow: '#ffdc00', white: '#eee', cyan: '#39cccc', red: '#e8433a', black: '#222', brown: '#8b5a2b', gray: '#888', violet: '#8f5cff' };
// Codos en formato Wokwi: movimientos relativos «h10», «v-20» desde la pata de salida
function bendPts(c, a) { const pts = []; let [x, y] = a; for (const m of c[3] || []) { const r = /^([hv])(-?[\d.]+)$/.exec(m); if (!r) continue; if (r[1] === 'h') x += +r[2]; else y += +r[2]; pts.push([x, y]); } return pts; }
function encodeBends(a, pts) { const out = []; let [x, y] = a; for (const [px, py] of pts) { const dx = Math.round(px - x), dy = Math.round(py - y); if (dx) out.push('h' + dx); if (dy) out.push('v' + dy); x += dx; y += dy; } return out; }
// Recorrido del cable: sin codos, una curva suave; con codos, tramos rectos con esquinas redondeadas
function wirePath(a, b, pts) {
  if (!pts.length) { const dx = Math.max(20, Math.abs(b[0] - a[0]) / 2); return `M${a[0]},${a[1]} C${a[0] + (b[0] > a[0] ? dx : -dx) * 0.4},${a[1] + 30} ${b[0] - (b[0] > a[0] ? dx : -dx) * 0.4},${b[1] + 30} ${b[0]},${b[1]}`; }
  const all = [a, ...pts]; const last = all[all.length - 1]; if (last[0] !== b[0] && last[1] !== b[1]) all.push([b[0], last[1]]); all.push(b);
  let d = `M${all[0][0]},${all[0][1]}`; for (let i = 1; i < all.length - 1; i++) { const [px, py] = all[i - 1], [x, y] = all[i], [nx, ny] = all[i + 1]; const r = Math.min(5, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2); const ux = Math.sign(x - px), uy = Math.sign(y - py), vx = Math.sign(nx - x), vy = Math.sign(ny - y);
    d += ` L${x - ux * r},${y - uy * r} Q${x},${y} ${x + vx * r},${y + vy * r}`; }
  return d + ` L${b[0]},${b[1]}`;
}
function paintWires() {
  if (!R || !R.svg) return; const svg = R.svg; svg.innerHTML = '';
  T.circuit.connections.forEach((c, i) => { const a = pinXY(c[0]), b = pinXY(c[1]); if (!a || !b) return; const pts = bendPts(c, a);
    const d = wirePath(a, b, pts); const sel = T.sel && T.sel.wire === i; const col = WIRE_HEX[c[2]] || c[2] || '#2ecc40';
    const hit = document.createElementNS(SVGNS, 'path'); hit.setAttribute('d', d); hit.setAttribute('class', 'tl-hit');
    hit.addEventListener('pointerdown', e => { e.stopPropagation(); if (T.tool === 'probe') return probeNet(c[0], e); setSel({ wire: i }); T.wireFrom = null; });
    hit.addEventListener('dblclick', e => { e.stopPropagation(); if (T.runner) return; hist(); const [x, y] = worldXY(e); const P = [...pts]; let at = P.length, bd = 1e9; const chain = [a, ...P, b];
      for (let k = 0; k < chain.length - 1; k++) { const [x1, y1] = chain[k], [x2, y2] = chain[k + 1]; const L = Math.hypot(x2 - x1, y2 - y1) || 1; const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / L / L)); const dd = Math.hypot(x - x1 - t * (x2 - x1), y - y1 - t * (y2 - y1)); if (dd < bd) { bd = dd; at = k; } }
      P.splice(at, 0, [x, y]); c[3] = encodeBends(a, P); save(); setSel({ wire: i }); });
    const path = document.createElementNS(SVGNS, 'path'); path.setAttribute('d', d); path.setAttribute('stroke', col); path.setAttribute('class', 'tl-wire' + (sel ? ' sel' : ''));
    svg.append(hit, path);
    // Asas de los codos del cable seleccionado: se arrastran; doble clic las quita
    if (sel && !T.runner) pts.forEach((q, k) => { const h = document.createElementNS(SVGNS, 'circle'); h.setAttribute('cx', q[0]); h.setAttribute('cy', q[1]); h.setAttribute('r', 4.5); h.setAttribute('class', 'tl-bend');
      let drag = false; h.addEventListener('pointerdown', e => { e.stopPropagation(); hist(); drag = true; h.setPointerCapture(e.pointerId); });
      h.addEventListener('pointermove', e => { if (!drag) return; const [x, y] = worldXY(e); const P = [...pts]; P[k] = [Math.round(x), Math.round(y)]; c[3] = encodeBends(a, P); paintWiresSoon(); });
      h.addEventListener('pointerup', () => { drag = false; save(); });
      h.addEventListener('dblclick', e => { e.stopPropagation(); hist(); const P = pts.filter((_, j) => j !== k); c[3] = encodeBends(a, P); save(); paintWires(); });
      svg.append(h); }); });
  // Cable que se está tendiendo (con sus codos)
  R.preview = null; if (T.wireFrom) { const a = pinXY(T.wireFrom); if (a) { R.preview = document.createElementNS(SVGNS, 'path'); R.preview.setAttribute('class', 'tl-wire tl-prev'); svg.append(R.preview); paintPreview(...(T.mouse || a)); } }
  // Patas: se tocan para tender cables (no en la protoboard, que tiene 170-830 agujeros: ahí se muestran al acercarse)
  for (const p of T.circuit.parts) { const isBB = (PARTS[TYPE_ALIAS[p.type] || p.type] || {}).kind === 'bb';
    for (const q of T.geo.pins[p.id] || []) { const ref = p.id + ':' + q.name; const on = T.wireFrom === ref;
      const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', q.ax); c.setAttribute('cy', q.ay); c.setAttribute('r', isBB ? 3.2 : 4.2); c.setAttribute('class', 'tl-pin' + (on ? ' on' : '') + (isBB ? ' bb' : ''));
      const tt = document.createElementNS(SVGNS, 'title'); tt.textContent = pinLabel(p, q.name); c.append(tt);
      c.addEventListener('pointerdown', e => { e.stopPropagation(); if (T.tool === 'probe') return probeNet(ref, e); tapPin(ref); }); svg.append(c); } }
  if (T.probe) paintProbe();
}
let pwRaf = 0; const paintWiresSoon = () => { if (!pwRaf) pwRaf = requestAnimationFrame(() => { pwRaf = 0; paintWires(); }); };
function paintPreview(x, y) { if (!R.preview) return; T.mouse = [x, y]; const a = pinXY(T.wireFrom); if (!a) return; const pts = T.bends || []; R.preview.setAttribute('d', 'M' + [a, ...pts, [x, y]].map(q => q.join(',')).join(' L')); }
function pinLabel(p, name) { const t = TYPE_ALIAS[p.type] || p.type; const bb = boardByType(t); if (bb) return `${bb.name}: ${boardPinLabel(bb, name)}`; const info = PARTS[t]; return info && info.pins && info.pins[name] ? `${info.name}: ${info.pins[name]}` : `${p.id}: ${name}`; }
function tapPin(ref) {
  if (T.runner) return toast('Para el circuito (■) para cambiar cables');
  if (!T.wireFrom) { T.wireFrom = ref; T.bends = []; T.sel = null; tools(); paintWires(); toast('Toca la otra pata (o el lienzo para hacer codos)', 1600); return; }
  if (T.wireFrom === ref) { T.wireFrom = null; T.bends = null; paintWires(); return; }
  const n = T.circuit.connections.length; const pw = r => { const [id, pin] = r.split(':'); const p = T.circuit.parts.find(x => x.id === id); const bb = p && boardByType(p.type); return bb ? powerOf(bb, pin) : /GND/.test(pin) ? 'gnd' : /^(VCC|V\+)$/.test(pin) ? '5v' : null; };
  const kinds = [pw(ref), pw(T.wireFrom)]; const color = kinds.includes('gnd') ? 'black' : kinds.some(Boolean) ? 'red' : WIRE_COLORS[n % WIRE_COLORS.length];
  hist(); const a = pinXY(T.wireFrom); T.circuit.connections.push([T.wireFrom, ref, color, a && T.bends && T.bends.length ? encodeBends(a, T.bends) : []]); T.wireFrom = null; T.bends = null; T.sel = { wire: n }; save(); tools(); paintWires();
}

/* ---------- Barra de herramientas de la selección ---------- */
function tools() {
  if (!R || !R.tools) return; const box = R.tools; box.innerHTML = '';
  const kit = el('span', { class: 'tl-kit' }, btn('↶', undo, 'mini-b', ), btn('↷', redo, 'mini-b'), btn(T.tool === 'probe' ? '📟 Polímetro ✓' : '📟 Polímetro', () => setTool(T.tool === 'probe' ? null : 'probe'), 'mini-b' + (T.tool === 'probe' ? ' on' : '')));
  kit.firstChild.title = 'Deshacer (Ctrl+Z)'; kit.children[1].title = 'Rehacer (Ctrl+Y)'; kit.children[2].title = 'Polímetro (M): toca un cable o una pata para ver la tensión; una pieza para ver su corriente';
  if (T.tool === 'probe') { box.append(kit, el('span', { class: 'note' }, T.runner ? 'Toca un punto del circuito (tensión) o una pieza (corriente).' : 'Pulsa ▶ y toca un punto o una pieza para medir.')); return; }
  if (T.wireFrom) { box.append(el('span', {}, `🔗 Toca la pata de destino${T.bends && T.bends.length ? ` · ${T.bends.length} codo(s)` : ' · toca el lienzo para hacer codos'}`), btn('Cancelar', () => { T.wireFrom = null; T.bends = null; tools(); paintWires(); }, 'mini-b')); return; }
  if (T.sel && T.sel.wire != null) { const c = T.circuit.connections[T.sel.wire]; if (!c) return;
    box.append(kit, el('span', { class: 'tl-desc' }, `Cable: ${describePin(T.circuit, c[0])} → ${describePin(T.circuit, c[1])}`),
      el('select', { class: 'txt mini', on: { change: e => { hist(); c[2] = e.target.value; save(); paintWires(); } } }, Object.keys(WIRE_HEX).map(k => el('option', { value: k, selected: c[2] === k }, COLOR_ES[k] || k))),
      (c[3] || []).length ? btn('〰 Sin codos', () => { hist(); c[3] = []; save(); paintWires(); }, 'mini-b') : el('small', { class: 'note' }, 'Doble clic en el cable: codo'),
      btn('🗑', delSel, 'mini-b')); return; }
  const ids = selIds();
  if (ids.length > 1) { box.append(kit, el('b', {}, `${ids.length} piezas`), btn('⟳ Girar', rotSel, 'mini-b'), btn('📋 Duplicar', () => { if (copySel()) paste(); }, 'mini-b'), btn('🗑', delSel, 'mini-b'), el('small', { class: 'note' }, 'Flechas: mover · Ctrl+C/V')); return; }
  if (ids.length === 1) { const p = T.circuit.parts.find(x => x.id === ids[0]); if (!p) return; const t = TYPE_ALIAS[p.type] || p.type; const info = PARTS[t]; const isBoard = !info;
    box.append(kit, el('b', {}, isBoard ? BOARDS[T.board].name : `${info.icon} ${info.name}`)); if (isBoard) box.append(btn('🔩 Por dentro', inside, 'mini-b'), btn('🔁 Cambiar placa', boardPicker, 'mini-b'));
    for (const [k, list] of Object.entries((info && info.opts) || {})) box.append(el('select', { class: 'txt mini', on: { change: e => { hist(); p.attrs = { ...(p.attrs || {}), [k]: e.target.value }; save(); redrawPart(p); } } }, list.map(v => el('option', { value: v, selected: String((p.attrs || {})[k]) === String(v) }, k === 'value' ? fmtOhms(v) : COLOR_ES[v] || v))));
    if (info && info.text) box.append(el('input', { class: 'txt mini', value: (p.attrs || {}).text || '', on: { change: e => { hist(); p.attrs = { ...(p.attrs || {}), text: e.target.value }; save(); redrawPart(p); } } }));
    for (const sp of (info && info.sliders) || []) box.append(slider(sp.label, sp.get(T.ui[p.id] || {}), v => { T.ui[p.id] = { ...(T.ui[p.id] || {}), ...sp.set(v) }; }, sp.fmt));
    if (t === 'plato-pir') box.append(holdBtn('🚶 Moverse delante', p.id, 'motion'));
    if (t === 'plato-joystick') box.append(holdBtn('🔘 Pulsar la palanca', p.id, 'sw'));
    if (t === 'wokwi-ds1307') box.append(el('small', { class: 'note' }, 'Va con la hora de tu ordenador (y se puede cambiar desde el programa).'));
    if (t === 'wokwi-photoresistor-sensor') box.append(slider('☀️ Luz', T.ui[p.id]?.light ?? 0.5, v => { T.ui[p.id] = { ...(T.ui[p.id] || {}), light: v }; }));
    if (t === 'wokwi-hc-sr04') box.append(slider('📏 Distancia', (T.ui[p.id]?.cm ?? 100) / 400, v => { T.ui[p.id] = { ...(T.ui[p.id] || {}), cm: Math.round(2 + v * 398) }; }, v => Math.round(2 + v * 398) + ' cm'));
    if (!isBoard) box.append(btn('⟳', rotSel, 'mini-b'), btn('🗑', delSel, 'mini-b'));
    return; }
  box.append(kit, el('span', { class: 'note' }, T.runner ? 'Pulsa los botones y gira los potenciómetros del circuito. Toca un sensor para cambiar lo que «ve».' : 'Toca una pata y luego otra para tender un cable. Arrastra en vacío para seleccionar varias piezas. Atajos: Supr, R, Ctrl+Z/C/V/D, Espacio = simular.'));
}
function setTool(t) { T.tool = t; T.probe = null; showProbe(); tools(); paintWires(); }
function slider(label, v, set, fmt = x => Math.round(x * 100) + ' %') { const out = el('small', {}, fmt(v)); const s = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: v, on: { input: e => { set(+e.target.value); out.textContent = fmt(+e.target.value); } } }); return el('label', { class: 'tl-sl' }, label, s, out); }
function redrawPart(p) { const w = R.world.querySelector(`.tl-part[data-id="${p.id}"]`); if (w) w.replaceWith(partNode(p)); requestAnimationFrame(() => { measure(p.id); paintWires(); }); }

/* ---------- Añadir piezas, ejemplos, placa ---------- */
function palette() {
  const grid = el('div', { class: 'tl-pal' }); let close;
  const GROUPS = [['basicas', 'Básicas'], ['entradas', 'Entradas'], ['sensores', 'Sensores'], ['pantallas', 'Pantallas'], ['luces', 'Luces'], ['potencia', 'Potencia y motores'], ['protoboard', 'Protoboards']];
  const groupOf = info => info.group || (info.kind === 'bb' ? 'protoboard' : ['button', 'switch', 'pot'].includes(info.kind) ? 'entradas' : ['ldr', 'sonar'].includes(info.kind) ? 'sensores' : ['lcd', 'seg7'].includes(info.kind) ? 'pantallas' : ['servo'].includes(info.kind) ? 'potencia' : 'basicas');
  const q = el('input', { class: 'txt', placeholder: 'Buscar pieza…', on: { input: () => fill() } }); const body = el('div', {});
  const fill = () => { body.innerHTML = ''; const f = q.value.trim().toLowerCase(); for (const [gk, gt] of GROUPS) { const items = Object.entries(PARTS).filter(([t, i]) => groupOf(i) === gk && (!f || (i.name + ' ' + (i.real || '') + ' ' + t).toLowerCase().includes(f))); if (!items.length) continue;
    body.append(el('h4', { class: 'tl-palh' }, gt)); const g2 = el('div', { class: 'tl-pal' }); for (const [type, info] of items) { const b2 = btn(el('span', {}, el('i', {}, info.icon), el('b', {}, info.name)), () => { addPart(type); close(); }, 'tl-pi'); b2.title = info.real || ''; g2.append(b2); } body.append(g2); } };
  fill(); void grid;
  close = modal('Añadir pieza', el('div', {}, q, body, el('p', { class: 'note' }, 'Consejo: pon primero la protoboard y suelta encima las piezas; o une las patas directamente con cables, como prefieras.')));
}
function addPart(type) {
  const info = PARTS[type]; const base = type.replace(/^(wokwi|velxio)-/, '').replace(/-.*/, ''); let n = 1; while (T.circuit.parts.some(p => p.id === base + n)) n++;
  const sc = R.stage.getBoundingClientRect(); const left = Math.round((R.stage.scrollLeft + sc.width * 0.45) / T.zoom), top = Math.round((R.stage.scrollTop + sc.height * 0.3) / T.zoom);
  hist(); const p = { type, id: base + n, left, top, rotate: 0, attrs: { ...(info.attrs || {}) } }; T.circuit.parts.push(p); T.sel = { parts: [p.id] }; save(); R.world.querySelectorAll('.tl-part.sel').forEach(x => x.classList.remove('sel'));
  R.world.insertBefore(partNode(p), R.svg); requestAnimationFrame(() => requestAnimationFrame(() => { measure(p.id); paintWires(); tools(); }));
}
function examples() {
  const list = el('div', { class: 'tl-exs' }); let close;
  for (const ex of EXAMPLES) { const ok = supports(ex, T.board); const bt = btn(el('span', {}, el('b', {}, ex.title + ' ' + '⭐'.repeat(ex.level)), el('small', {}, ok ? ex.about : `No disponible en la ${BOARDS[T.board].name} (necesita algo que esta placa no tiene, como entradas analógicas).`)), async () => { if (!ok) return; if (T.circuit.parts.length > 1 && !(await confirmBox('Abrir ejemplo', 'Se sustituye el circuito y el código actuales.', 'Abrir'))) return; close(); useExample(ex.id); }, 'tl-ex' + (ok ? '' : ' off')); list.append(bt); }
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
  parts.push(el('div', { class: 'row-btns' }, btn('📦 Cargar el programa de fábrica', async () => { if (T.code.trim() && !(await confirmBox('Programa de fábrica', 'Sustituye tu código por el que trae la placa de serie (un parpadeo).', 'Cargar'))) return; T.code = insideCode(T.board); R.ed.value = T.code; save(); close(); toast('📦 Cargado: es lo que corre en la placa al sacarla de la caja'); }, 'mini-b')));
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
      if (b.engine === 'pico') { say(`Arrancando MicroPython en la ${b.name} (chip emulado)…\n`); runner = await PicoRunner.create(T.code, b.key === 'pico' ? { prelude: libsCode() } : { map: g.map, pins, prelude: libsCode() }); }
      else { say(`Simulando la ${b.name}: ${b.flavor === 'linux' ? 'Python con ' + b.lib : 'MicroPython'} sobre un RP2040 emulado…\n`);
        const adcKeys = (b.adc || []).filter(k => g.keys[k] != null); const adc = Object.fromEntries((b.io || []).filter(x => x[1] && adcKeys.includes(x[0])).map(x => [x[1], adcKeys.indexOf(x[0])]));
        runner = await PicoRunner.create(T.code, { map: g.map, pins, adc, prelude: (T.inside[T.board] || supportCode(b)).replace(/\r/g, '').replace(/\n*$/, '\n') }); } }
    runner.serial = say; runner.onError = e => { say('\n❌ ' + e.message + '\n'); R.mon.classList.add('err'); markErr(e.message); stop(true); };
    T.rec = new Recorder(); T.rec.now = () => runner.timeUs(); for (const pin of runner.pins) runner.onEdge(pin, (v, t) => T.rec && T.rec.push(pin, t, v));
    { const si = runner.setInput.bind(runner); runner.setInput = (pin, v) => { si(pin, v); if (T.rec) T.rec.push(pin, runner.timeUs(), v); }; } if (R.ins) R.ins.reset();
    T.runner = runner; wireUp(runner); runner.start(); R.runBtn.textContent = '■ Parar'; R.root.classList.add('running'); tools(); loop();
  } catch (e) { say('❌ ' + e.message + '\n'); R.mon.classList.add('err'); R.runBtn.textContent = '▶ Simular'; }
}
async function compileUno(code, say) {
  const pre = PREBUILT[norm(code)]; if (pre) { const r = await fetch(pre); if (r.ok) { say('(programa ya compilado)\n'); return await r.text(); } }
  if (!localBase()) { say('Para compilar C++ hace falta Plató abierto como aplicación en tu ordenador (usa arduino-cli).\nMientras tanto: elige una placa con Python (Pico, ESP32, STM32…), que funciona aquí mismo, o el ejemplo «Parpadeo».\n'); R.mon.classList.add('err'); return null; }
  say('Compilando con arduino-cli…\n');
  const r = await fetch(localBase() + '/api/taller/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ board: T.board, code }) }); const j = await r.json();
  if (!r.ok || j.error) { say('❌ ' + (j.error || 'No se pudo compilar') + '\n' + (j.log || '')); R.mon.classList.add('err'); markErr((j.error || '') + '\n' + (j.log || '')); return null; }
  say(`✅ Compilado (${j.size || '?'} bytes)\n`); return j.hex;
}
// Escuchas que necesitan precisión de microsegundos: servo (ancho de pulso), LCD (flanco de E), sensor de distancia.
function wireUp(runner) {
  T.uf0 = staticNets(T.circuit, T.geo); T.forced = new Set(); const bp = boardPart(); const net = id => T.uf0.f(id);
  const mcuOn = ref => runner.pins.find(pin => net(bp.id + ':' + pin) === net(ref));
  T.extra = {}; T.lcd = {}; T.np = {};
  for (const p of T.circuit.parts) {
    if (p.type === 'wokwi-servo') { const pin = mcuOn(p.id + ':PWM'); if (pin) { let t0 = 0; runner.onEdge(pin, (v, t) => { if (v) t0 = t; else { const w = t - t0; if (w > 300 && w < 3000) T.extra[p.id] = { angle: Math.max(0, Math.min(180, (w - 544) / (2400 - 544) * 180)) }; } }); } }
    if (p.type === 'wokwi-lcd1602') { const m = Object.fromEntries(['RS', 'E', 'D4', 'D5', 'D6', 'D7'].map(k => [k, mcuOn(p.id + ':' + k)])); if (m.E && m.RS && m.D4) { const dec = T.lcd[p.id] = new HD44780(); const lv = pin => pin && runner.level(pin).out ? 1 : 0;
      runner.onEdge(m.E, v => { if (!v) dec.latch(lv(m.RS), lv(m.D4) | lv(m.D5) << 1 | lv(m.D6) << 2 | lv(m.D7) << 3); }); } }
    if (p.type === 'wokwi-hc-sr04') { const trig = mcuOn(p.id + ':TRIG'), echo = mcuOn(p.id + ':ECHO'); if (trig && echo) { T.forced.add(echo); let t0 = 0; runner.setInput(echo, false);
      runner.onEdge(trig, (v, t) => { if (v) t0 = t; else if (t - t0 >= 8) { const cm = (T.ui[p.id] && T.ui[p.id].cm) || 100; runner.after(250, () => { runner.setInput(echo, true); runner.after(cm * 58, () => runner.setInput(echo, false)); }); } }); } }
    // Tiras NeoPixel: se descodifica el tren de pulsos del pin de datos
    if ((PARTS[p.type] || {}).kind === 'ws2812') { const din = mcuOn(p.id + ':DIN'); if (din) { const dec = T.np[p.id] = new WS2812(+(p.attrs && (p.attrs.pixels || (p.attrs.rows && p.attrs.rows * p.attrs.cols))) || PARTS[p.type].n); runner.onEdge(din, (v, t) => dec.edge(v, t)); } }
    // DHT22: cuando el micro baja la línea ≥ 0,5 ms y la suelta, contesta con sus 40 bits
    if (p.type === 'plato-dht22') { const pin = mcuOn(p.id + ':SDA'); if (pin && runner.onRaw) { T.forced.add(pin); runner.setInput(pin, true); let t0 = -1, busy = false;
      runner.onRaw(pin, low => { const t = runner.timeUs(); if (low) { t0 = t; return; } if (t0 < 0 || busy || t - t0 < 500) { if (!busy) runner.setInput(pin, true); return; } busy = true;
        const u = T.ui[p.id] || {}; const h = Math.round((u.hum ?? 55) * 10), tc = Math.round((u.temp ?? 24) * 10); const tw = tc < 0 ? 0x8000 | -tc : tc; const bytes = [h >> 8, h & 255, tw >> 8, tw & 255]; bytes.push(bytes.reduce((a, b) => a + b, 0) & 255);
        const seq = [[30, 0], [80, 1], [80, 0]]; for (const b of bytes) for (let k = 7; k >= 0; k--) { seq.push([50, 1]); seq.push([(b >> k) & 1 ? 70 : 26, 0]); } seq.push([50, 1]);
        let i = 0; const step = () => { if (i >= seq.length) { busy = false; t0 = -1; return; } const [d, v] = seq[i++]; runner.after(d, () => { runner.setInput(pin, !!v); if (T.rec) T.rec.push(pin, runner.timeUs(), v); step(); }); }; runner.setInput(pin, true); step(); }); } }
  }
  // I2C: un bus por cada par SDA/SCL, con sus dispositivos; y el periférico de hardware del chip conectado a todos
  T.dev = {}; const groups = new Map(); const all = new I2CBus();
  for (const p of T.circuit.parts) { const info = PARTS[p.type] || {}; if (info.kind !== 'i2c') continue; const [ks, kc] = p.type === 'wokwi-ssd1306' ? ['DATA', 'CLK'] : ['SDA', 'SCL'];
    const dev = T.dev[p.id] = p.type === 'wokwi-ssd1306' ? new SSD1306() : p.type === 'plato-lcd1602-i2c' ? new LcdI2C() : p.type === 'wokwi-mpu6050' ? new MPU6050() : p.type === 'plato-bmp280' ? new BMP280() : new DS1307();
    let addr = info.addr; if (p.type === 'wokwi-mpu6050' && net(p.id + ':AD0') === net(bp.id + ':' + (Object.keys(BOARDS[T.board].power).find(k => BOARDS[T.board].power[k] === 3.3) || '3V3'))) addr = 0x69;
    all.add(addr, dev); const sda = mcuOn(p.id + ':' + ks), scl = mcuOn(p.id + ':' + kc); if (!sda || !scl) continue; const key = sda + '|' + scl; if (!groups.has(key)) groups.set(key, new I2CBus()); groups.get(key).add(addr, dev); }
  if (runner.onRaw && !(runner instanceof AvrRunner)) for (const [key, bus] of groups) { const [sda, scl] = key.split('|'); T.forced.add(sda); T.forced.add(scl); new PinSlave(bus, runner, sda, scl, (a, c) => { if (T.rec) { const t = runner.timeUs(); T.rec.push(sda, t, a); T.rec.push(scl, t, c); } }); runner.setInput(sda, true); runner.setInput(scl, true); }
  if (all.devs.size) { if (runner.mcu) attachRP2040(runner.mcu, all); if (runner.twi) attachAVR(runner.twi, all); }
}
function loop() {
  const r = T.runner; if (!r) return; const bp = boardPart();
  const forcedRunner = new Proxy(r, { get: (o, k) => k === 'setInput' ? (pin, v) => { if (!T.forced.has(pin)) o.setInput(pin, v); } : k === 'setAnalog' ? (pin, v) => { if (!T.forced.has(pin)) o.setAnalog(pin, v); } : typeof o[k] === 'function' ? o[k].bind(o) : o[k] });
  const res = evaluate({ circuit: T.circuit, uf0: T.uf0, runner: forcedRunner, board: { key: T.board, id: bp.id }, ui: T.ui });
  for (const [id, props] of Object.entries({ ...res.out, ...T.extra })) { const e = R.world.querySelector(`.tl-part[data-id="${id}"]`); if (!e) continue; const x = e.firstChild;
    for (const [k, v] of Object.entries(props)) { if (k === 'burn') { e.classList.toggle('burn', !!v); continue; } if (k === 'freq') continue; if (x[k] !== v && !(Array.isArray(v) && JSON.stringify(x[k]) === JSON.stringify(v))) x[k] = v; } }
  for (const [id, dec] of Object.entries(T.lcd)) { const x = R.world.querySelector(`.tl-part[data-id="${id}"]`); if (x) { x.firstChild.characters = dec.chars(); } }
  // Dispositivos I2C: sensores con los valores de sus mandos, pantallas con lo que les ha llegado
  for (const [id, dev] of Object.entries(T.dev || {})) { const u = T.ui[id] || {}; const x = partEl(id) && partEl(id).firstChild; if (dev.state) for (const k of Object.keys(dev.state)) if (u[k] != null) dev.state[k] = u[k];
    if (dev instanceof SSD1306 && x && dev.dirty && x.imageData) { dev.paint(x.imageData); x.redraw(); }
    if (dev instanceof LcdI2C && x) { x.characters = dev.lcd.chars(); x.backlight = dev.backlight; }
    if (dev instanceof BMP280 && x) x.state = { temp: dev.state.temp }; }
  const g = v => Math.min(1, Math.pow(v / 255, 0.5));
  for (const [id, dec] of Object.entries(T.np || {})) { if (!dec.dirty) continue; dec.dirty = false; const x = partEl(id) && partEl(id).firstChild; if (!x) continue; const px = dec.px.map(c => ({ r: g(c.r), g: g(c.g), b: g(c.b) }));
    if (x.tagName === 'WOKWI-NEOPIXEL') Object.assign(x, px[0]); else if (x.tagName === 'WOKWI-NEOPIXEL-MATRIX') { const cols = +x.cols || 8; px.forEach((c, i) => x.setPixel(Math.floor(i / cols), i % cols, c)); } else if (x.setPixel) px.forEach((c, i) => x.setPixel(i, c)); }
  // Zumbador
  const bz = Object.values(res.out).find(o => o.hasSignal);
  try { if (bz) { if (!audio) { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; g.gain.value = 0; o.connect(g).connect(ctx.destination); o.start(); audio = { ctx, o, g }; } audio.o.frequency.value = Math.max(40, Math.min(8000, bz.freq)); audio.g.gain.value = 0.06; } else if (audio) audio.g.gain.value = 0; } catch (e) {}
  const w = res.warn.join(' '); if (R.warn.textContent !== w) { R.warn.textContent = w; R.warn.classList.toggle('on', !!w); }
  T.res = res; if (T.probe) showProbe(); statusLine();
  frame = setTimeout(loop, 33);
}
function stop(keepMsg) {
  T.pio = null; if (T.runner) { try { T.runner.stop(); } catch (e) {} } T.runner = null; T.paused = false; if (R && R.pauseBtn) R.pauseBtn.textContent = '⏸'; clearTimeout(frame); T.probe = null; if (R && R.probeEl) R.probeEl.hidden = true;
  if (audio) { try { audio.g.gain.value = 0; } catch (e) {} }
  if (!R || !R.world) return; R.root.classList.remove('running'); if (R.runBtn) R.runBtn.textContent = '▶ Simular'; if (R.warn && !keepMsg) { R.warn.textContent = ''; R.warn.classList.remove('on'); }
  for (const w of R.world.querySelectorAll('.tl-part')) { const x = w.firstChild; w.classList.remove('burn'); if ('value' in x && x.tagName === 'WOKWI-LED') { x.value = false; } if (x.tagName === 'WOKWI-RGB-LED') { x.ledRed = x.ledGreen = x.ledBlue = 0; } if (x.tagName === 'WOKWI-BUZZER') x.hasSignal = false; if ('led13' in x) { x.led13 = false; x.ledPower = false; } if ('led25' in x) x.led25 = false; if ('ledBuiltIn' in x) { x.ledBuiltIn = false; x.ledPower = false; } if ('leds' in x) x.leds = {}; if (x.tagName === 'WOKWI-7SEGMENT') x.values = [0, 0, 0, 0, 0, 0, 0, 0]; }
  tools();
}
export function leaveTaller() { stop(); if (R && R.pv) { R.pv.dispose(); R.pv = null; } if (T.util) T.util.safe().catch(() => {}); }
export const _t = { T, draw: () => draw(), useExample, start, stop, tapPin, addPart, measure: () => measure(), paint: () => paintWires(), importDiagram, loadDesign, getPlant: () => getPlant(), loadPlant: id => loadExamplePlant(id), autoAssign: () => autoAssign(), writeProgram: () => writeProgram(), setMode: m => setMode(m) };

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
  const b = BOARDS[T.board]; const items = bom(T.circuit); const steps = T.circuit.connections.map((c, i) => el('label', { class: 'tl-step', on: { mouseenter: () => { setSel({ wire: i }); } } }, el('input', { type: 'checkbox' }), el('span', {}, `${i + 1}. Une ${describePin(T.circuit, c[0])} con ${describePin(T.circuit, c[1])}${c[2] ? ` (cable ${COLOR_ES[c[2]] || c[2]})` : ''}.`)));
  const st = el('small', { class: 'lai-log' });
  const upload = localBase() ? btn('⬆ Grabar en mi placa (USB)', async e => { const bt = e.currentTarget; bt.disabled = true; st.textContent = '⏳ Buscando la placa y grabando…';
      try { const r = await fetch(localBase() + '/api/taller/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ board: T.board, code: T.code, kind: b.engine === 'avr' ? 'avr' : b.flavor === 'linux' ? 'linux' : 'mpy' }) }); const j = await r.json(); st.textContent = j.error ? '❌ ' + j.error : '✅ ' + (j.text || 'Grabado'); } catch (er) { st.textContent = '❌ ' + er.message; } bt.disabled = false; }, 'b on')
    : el('p', { class: 'note' }, realHint(b));
  modal('🧰 Llévalo a la mesa', el('div', { class: 'tl-real' },
    el('h4', {}, '🛒 Lista de la compra'), el('ul', {}, items.map(x => el('li', {}, `${x.n} × ${x.item}`))),
    el('h4', {}, '🔌 Montaje paso a paso'), el('p', { class: 'note' }, 'Hazlo con la placa desconectada del USB. Pasa el ratón por un paso para ver ese cable en el circuito.'), el('div', {}, steps),
    el('h4', {}, '⬆ El programa'), upload, st, realUsb(b),
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

// Marca en el editor la línea del error (Python: «File "<stdin>", line N»; C++: «sketch.ino:N:M: error»)
function markErr(msg) {
  const py = [...String(msg).matchAll(/File "<stdin>", line (\d+)/g)].pop(); const cc = /sketch\.ino:(\d+):\d+: (?:fatal )?error: ([^\n]+)/.exec(msg);
  const line = py ? +py[1] : cc ? +cc[1] : 0; const what = cc ? cc[2] : String(msg).trim().split('\n').pop();
  if (line && R && R.ed) R.ed.markError(line, what);
}

/* ---------- Polímetro y línea de estado ---------- */
function probeNet(ref, e) { if (!T.runner) return toast('Pulsa ▶ para medir', 1000); const [x, y] = pinXY(ref) || worldXY(e); T.probe = { kind: 'net', ref, x, y }; showProbe(); paintWires(); }
function probeAt(p, e) { if (!T.runner) return toast('Pulsa ▶ para medir', 1000); const [x, y] = worldXY(e); T.probe = { kind: 'part', id: p.id, x, y }; showProbe(); paintWires(); }
function paintProbe() { const pr = T.probe; if (!pr || !R.svg) return; const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', pr.x); c.setAttribute('cy', pr.y); c.setAttribute('r', 6); c.setAttribute('class', 'tl-probept'); R.svg.append(c); }
function showProbe() {
  const box = R && R.probeEl; if (!box) return; const pr = T.probe; const res = T.res;
  if (!pr || !res || !res.N) { box.hidden = true; return; }
  const N = res.N; let html = '';
  if (pr.kind === 'net') { const n = res.net(pr.ref); const v = N.volt(n); const fl = N.floating(n); html = `<b>${fl ? 'al aire' : fmtV(v ?? 0)}</b><small>${describePin(T.circuit, pr.ref)}${fl ? ' · no está unido a nada que fije su tensión' : ''}</small>`; }
  else { const p = T.circuit.parts.find(x => x.id === pr.id); if (!p) { box.hidden = true; return; } const es = N.els.filter(e => e.id === p.id || String(e.id).startsWith(p.id + ':')); const I = es.reduce((a, e) => a + Math.abs(N.current(e)), 0);
    const v2 = (a, b) => (N.volt(res.net(p.id + ':' + a)) ?? 0) - (N.volt(res.net(p.id + ':' + b)) ?? 0);
    if (boardByType(p.type)) { const pins = N.els.filter(e => e.tag === 'pin').map(e => [e.id.slice(4), N.current(e)]).filter(x => Math.abs(x[1]) > 5e-5).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
      html = `<b>${fmtA(res.total)}</b><small>consumo total de la placa${pins.length ? '<br>' + pins.map(([k, i]) => `pin ${k}: ${fmtA(i)} ${i > 0 ? 'sale' : 'entra'}`).join('<br>') : ''}</small>`; }
    else if (p.type === 'wokwi-resistor') html = `<b>${fmtA(I)}</b><small>caída ${fmtV(Math.abs(v2('1', '2')))} · ${fmtOhms((p.attrs || {}).value)} · ${(Math.abs(v2('1', '2')) * I * 1000).toFixed(1).replace('.', ',')} mW</small>`;
    else if (p.type === 'wokwi-led') html = `<b>${fmtA(I)}</b><small>LED · ${fmtV(v2('A', 'C'))} entre sus patas</small>`;
    else if (p.type === 'wokwi-potentiometer' || p.type === 'wokwi-slide-potentiometer') html = `<b>${fmtV(v2('SIG', 'GND'))}</b><small>en la pata central</small>`;
    else html = es.length ? `<b>${fmtA(I)}</b><small>${p.id}</small>` : `<b>—</b><small>${p.id}: sin modelo eléctrico</small>`; }
  box.innerHTML = html; box.hidden = false; const z = T.zoom; box.style.left = (pr.x * z + 14 - R.stage.scrollLeft) + 'px'; box.style.top = (pr.y * z - 10 - R.stage.scrollTop) + 'px';
}
function statusLine() { const r = T.runner, res = T.res; if (!R.status || !r) return; const t = r.timeUs ? r.timeUs() / 1e6 : 0; const B = BOARDS[T.board];
  R.status.textContent = `⏱ ${t.toFixed(1).replace('.', ',')} s simulados · ⚡ ${fmtA(res ? res.total : 0)} de la placa${T.paused ? ' · ⏸ en pausa' : ''}`; R.status.title = `Límite por pin en la ${B.name}: ${chipOf(B).max} mA recomendado, ${chipOf(B).abs} mA máximo`; }

function insPanel() { if (!R.ins) R.ins = instrumentsPanel({ el, btn, download, getRec: () => T.rec, getNames: () => ({}), getSerial: () => T.serial || '', isRunning: () => !!T.runner }); return R.ins; }

// Botón que se mantiene pulsado mientras lo tocas
function holdBtn(label, id, key) { const b = btn(label, () => {}, 'mini-b'); const set = v => { T.ui[id] = { ...(T.ui[id] || {}), [key]: v }; b.classList.toggle('on', v); };
  b.addEventListener('pointerdown', () => set(true)); b.addEventListener('pointerup', () => set(false)); b.addEventListener('pointerleave', () => set(false)); return b; }

// Pausa: el chip se congela (y con él el tiempo simulado); el circuito se queda como estaba para medirlo con calma
function togglePause() { const r = T.runner; if (!r || !r.pause) return; T.paused = !T.paused; if (T.paused) r.pause(); else r.resume(); if (R.pauseBtn) R.pauseBtn.textContent = T.paused ? '▶' : '⏸'; R.root.classList.toggle('paused', T.paused); statusLine(); }

/* ---------- Tu placa de verdad por USB, desde el navegador (Web Serial) ---------- */
function realUsb(b) {
  const mpy = b.engine !== 'avr' && b.flavor !== 'linux'; if (!mpy) return '';
  const box = el('div', { class: 'tl-usb' }); box.append(el('h4', {}, '🔌 Tu placa de verdad, sin instalar nada'));
  if (!webSerialOk()) { box.append(el('p', { class: 'note' }, 'Con Chrome o Edge en el ordenador puedes conectar aquí mismo tu placa por USB (con MicroPython instalado): ejecutar el programa, grabarlo como main.py y ver su monitor.')); return box; }
  const mon = el('pre', { class: 'tl-mon tl-usbmon' }, T.real && T.real.connected ? '(conectada)\n' : 'Conecta la placa (con MicroPython) por USB y pulsa «Conectar».\n'); const say = t => { mon.textContent = (mon.textContent + t).slice(-5000); mon.scrollTop = mon.scrollHeight; };
  if (T.real) T.real.onText = say;
  const libs = () => Object.keys(LIB_SRC).filter(k => new RegExp(`^\\s*(import|from)\\s+${k}\\b`, 'm').test(T.code));
  const act = (label, fn, cls = 'mini-b') => btn(label, async e => { const bt = e.currentTarget; bt.disabled = true; try { await fn(); } catch (er) { say('\n❌ ' + er.message + '\n'); } bt.disabled = false; render(); }, cls);
  const row = el('div', { class: 'row-btns' });
  const render = () => { row.innerHTML = ''; const on = T.real && T.real.connected;
    if (!on) row.append(act('🔌 Conectar', async () => { T.real = new RealBoard(say); await T.real.connect(); const i = await T.real.info(); say(`✅ Conectada${i ? ': ' + i : ''}\n`); }, 'mini-b on'));
    else row.append(
      act('▶ Ejecutar en la placa', async () => { say('\n— ejecutando —\n'); await T.real.run(T.code); }, 'mini-b on'),
      act('💾 Grabar como main.py', async () => { for (const k of libs()) { say(`📚 copiando ${k}.py…\n`); await T.real.save(LIB_SRC[k], k + '.py'); await new Promise(r => setTimeout(r, 1200)); } say('💾 grabando main.py…\n'); await T.real.save(T.code); say('✅ Grabado: arranca solo cada vez que la enciendes.\n'); }),
      act('■ Parar', () => T.real.stop()), act('⏏ Desconectar', async () => { await T.real.close(); T.real = null; say('Desconectada.\n'); }));
    if (libs().length) row.append(el('small', { class: 'note' }, `Tu programa usa ${libs().join(', ')}: al grabar, también se copian a la placa.`)); };
  render(); box.append(row, mon, el('p', { class: 'note' }, b.engine === 'shim' ? `Ojo: en la ${b.name} real tu código corre en su propio MicroPython (aquí lo simulamos sobre un RP2040), así que el resultado es el mismo salvo diferencias de tiempos.` : 'Es el mismo MicroPython que en el simulador.')); return box;
}

/* ---------- 🏭 Planta: una línea de producción en 3D que tu placa (simulada o de verdad, con el útil) controla ---------- */
function setMode(m) { T.mode = m; save(); draw(); }
function getPlant() {
  if (T.plantObj) return T.plantObj; let d = null; try { d = JSON.parse(localStorage.getItem(PKEY) || 'null'); } catch (e) {}
  const P = T.plantObj = new Plant(d || undefined); if (!d) { const ex = PLANTS[0]; ex.build(P); P.exId = ex.id; P.title = ex.title; autoAssign(true, 'sim'); autoAssign(true, 'util'); } return P; }
function savePlant() { try { localStorage.setItem(PKEY, JSON.stringify(T.plantObj.toJSON())); } catch (e) {} }
async function mountPlant(host) {
  try { const { plantView } = await import('./taller/plant3d.js'); const P = getPlant();
    const pv = await plantView({ plant: P, pinOptions, getIO: plantIOFor, isRunning: () => P.ctl === 'util' ? !!(T.util && T.util.connected) : !!T.runner && !T.paused, onChange: savePlant, controllerBar, clock: () => P.ctl === 'sim' && T.runner ? T.runner.timeUs() / 1e6 : null });
    if (!host.isConnected) { pv.dispose(); return; } host.innerHTML = ''; host.append(pv.el); R.pv = pv;
  } catch (e) { host.innerHTML = ''; host.append(el('div', { class: 'empty' }, 'No se pudo abrir la vista 3D: ' + e.message)); }
}
const boardDigital = b => b.engine === 'avr' ? [...UNO_PINS, ...(b.extraPins || [])] : mcuPins(b);
function pinOptions(dir, type) {
  const P = getPlant();
  if (P.ctl === 'util') { const L = dir === 'in' ? (type === 'a' ? UTIL_CH.toDut.a : type === 'enc' ? UTIL_CH.toDut.enc : UTIL_CH.toDut.d) : (type === 'pwm' ? [...UTIL_CH.fromDut.pwm, ...UTIL_CH.fromDut.d] : UTIL_CH.fromDut.d);
    const say = { DO: 'salida digital del útil', AO: 'tensión del útil', ENC: 'encoder A/B/Z del útil', DI: 'entrada digital del útil', PW: 'PWM medido en DI', AI: 'entrada analógica del útil' };
    return L.map(c => [c, `${c} · ${say[c.replace(/\d+$/, '')]}`]); }
  const b = BOARDS[T.board]; const pins = dir === 'in' && type === 'a' ? analogPins(b) : boardDigital(b).filter(p => dir === 'in' || !inOnly(b, p));
  return pins.map(p => [p, boardPinLabel(b, p)]); }
const inOnly = (b, pin) => (b.inputOnly || []).includes(keyOf(b, pin)); // pines que solo pueden ser entrada (ESP32: 34-39)
// Conecta las señales a pines libres: primero las que usa el programa de ejemplo, luego el resto
function autoAssign(quiet, ctl) {
  const P = getPlant(); ctl = ctl || P.ctl; const map = P.maps[ctl]; for (const k of Object.keys(map)) delete map[k];
  const sigs = P.signals(); const want = PLANT_SIGNALS[P.exId] ? [...PLANT_SIGNALS[P.exId], ...(P.exId === 'clasificadora' ? ['CS1.hay'] : [])] : sigs.filter(s => s[1] === 'in' || s[2] !== 'pwm').map(s => s[0]);
  let skipped = 0;
  if (ctl === 'util') { const n = { DO: 0, AO: 0, DI: 0, ENC: 0 };
    for (const k of want) { const s = sigs.find(x => x[0] === k); if (!s) continue; const [, dir, type] = s; let ch = null;
      if (dir === 'in') ch = type === 'a' ? (n.AO < 4 ? 'AO' + n.AO++ : null) : type === 'enc' ? (n.ENC++ ? null : 'ENC') : (n.DO < 8 ? 'DO' + n.DO++ : null);
      else ch = n.DI < 8 ? (type === 'pwm' ? 'PW' : 'DI') + n.DI++ : null;
      if (ch) map[k] = ch; else skipped++; } }
  else { const b = BOARDS[T.board]; const bp = T.circuit && boardPart(); const used = new Set(); if (bp) for (const c of T.circuit.connections) for (const ref of [c[0], c[1]]) { const [id, pin] = ref.split(':'); if (id === bp.id) used.add(pin); }
    const ana = analogPins(b).filter(p => !used.has(p)); const ser = b.engine === 'avr' ? ['0', '1'] : [];
    const dig = boardDigital(b).filter(p => !used.has(p) && !ser.includes(p)); const digi = [...dig.filter(p => !ana.includes(p)), ...dig.filter(p => ana.includes(p))]; const taken = new Set();
    for (const k of want) { const s = sigs.find(x => x[0] === k); if (!s) continue; const [, dir, type] = s; const pool = dir === 'in' && type === 'a' ? ana : digi; const pin = pool.find(p => !taken.has(p) && (dir === 'in' || !inOnly(b, p)));
      if (pin) { map[k] = pin; taken.add(pin); } else skipped++; } }
  savePlant(); if (!quiet) { if (R && R.pv) R.pv.panel(); toast(skipped ? `Conectadas; ${skipped} señales no caben en ${ctl === 'util' ? 'el útil' : 'esta placa'}` : 'Señales conectadas a pines libres', 1800); }
}
function writeProgram() {
  const P = getPlant(); if (!hasProgram(P.exId)) return toast('Esta planta no es un ejemplo: escribe tu programa (las señales y sus pines están en la lista)', 2500);
  const r = plantProgram(P.exId, P, T.board); if (!r) return; if (T.runner) stop(); T.code = r.code; save(); if (R && R.ed) R.ed.value = r.code;
  toast(r.missing.length ? `Programa escrito; faltan por conectar: ${r.missing.join(', ')}` : 'Programa escrito en el editor: pulsa ▶ Simular', 2200); }
function loadExamplePlant(id) {
  const ex = PLANTS.find(p => p.id === id); if (!ex) return; const P = getPlant(); const ctl = P.ctl; P.load({ ctl }); ex.build(P); P.exId = ex.id; P.title = ex.title; autoAssign(true, 'sim'); autoAssign(true, 'util'); savePlant();
  if (R && R.pv) R.pv.refresh(); }
// Puente con la placa simulada: los sensores fuerzan sus pines, los actuadores se leen del pin (nivel o ciclo de trabajo)
function plantIOFor() { const P = getPlant(); if (P.ctl === 'util') return utilIO(P); if (!T.runner) return null; return T.pio || (T.pio = simIO(T.runner, P)); }
function simIO(runner, P) {
  const cache = {}, enc = {}, lvl = {}; const typeOf = k => (P.signals().find(s => s[0] === k) || [])[2];
  return {
    out: k => { const pin = P.map[k]; if (!pin) return false; if (typeOf(k) === 'pwm') { const d = runner.duty(pin); return d.rate > 0 ? d.duty : (runner.level(pin).out ? 1 : 0); } return !!runner.level(pin).out; },
    in: (k, v) => { const pin = P.map[k]; if (!pin) return; T.forced && T.forced.add(pin);
      if (typeof v === 'number') { if (cache[k] == null || Math.abs(cache[k] - v) > 0.005) { cache[k] = v; runner.setAnalog(pin, v); } }
      else { const b = !!v; if (cache[k] !== b) { cache[k] = b; runner.setInput(pin, b); } } },
    // Encoder: los flancos que tocan en este paso, repartidos en el tiempo con alarmas del reloj simulado
    enc: (k, rate, pos) => { const pin = P.map[k]; if (!pin) return; T.forced && T.forced.add(pin); const e = Math.floor(pos * 2); if (enc[k] == null) { enc[k] = e; return; } const n = Math.abs(e - enc[k]); enc[k] = e; const m = Math.min(n, 400);
      for (let i = 0; i < m; i++) runner.after(Math.round((i + 0.5) * 8333 / m), () => { lvl[k] = !lvl[k]; runner.setInput(pin, lvl[k]); }); },
  }; }
function utilIO(P) { const U = T.util; if (!U || !U.connected) return null;
  return { out: k => { const ch = P.map[k]; return ch ? U.get(ch) : false; }, in: (k, v) => { const ch = P.map[k]; if (ch) U.set(ch, v); }, enc: (k, rate) => { if (P.map[k] === 'ENC') U.set('ENC', rate); } }; }
function controllerBar() {
  const P = getPlant(); const b = BOARDS[T.board]; const box = el('div', { class: 'pl-ctl' });
  const sayMon = t => { T.serial = (T.serial || '') + t; if (R && R.mon) { R.mon.textContent = T.serial.slice(-6000); R.mon.scrollTop = R.mon.scrollHeight; } };
  const act = (label, fn, cls = 'mini-b') => btn(label, async e => { const bt = e.currentTarget; bt.disabled = true; try { await fn(); } catch (er) { toast('❌ ' + er.message, 3000); sayMon('\n❌ ' + er.message + '\n'); } bt.disabled = false; R.pv && R.pv.panel(); }, cls);
  const setCtl = c => { if (P.ctl === c) return; P.ctl = c; if (!Object.keys(P.map).length) autoAssign(true); savePlant(); R.pv && R.pv.panel(); };
  const exSel = el('select', { class: 'pl-sel', on: { change: e => { if (e.target.value) loadExamplePlant(e.target.value); } } }, el('option', { value: '' }, '📚 Cargar una planta de ejemplo…'), ...PLANTS.map(p => el('option', { value: p.id }, p.title)));
  box.append(el('div', { class: 'tl-seg' }, btn(`🧪 ${b.name} simulada`, () => setCtl('sim'), 'mini-b' + (P.ctl === 'sim' ? ' on' : '')), btn('🔌 Placa real (útil)', () => setCtl('util'), 'mini-b' + (P.ctl === 'util' ? ' on' : ''))));
  if (P.ctl === 'sim') box.append(el('p', { class: 'muted' }, `Pulsa ▶ Simular: la ${b.name} ejecuta el programa del editor y mueve la planta. Los sensores entran por sus pines; los motores y cilindros salen de ellos. También lo ves en 📈.`));
  else { const U = T.util; const on = U && U.connected;
    box.append(el('p', { class: 'muted' }, on ? `Útil conectado${U.id ? ' · ' + U.id.replace(/^ID /, '') : ''}. Tu placa de verdad (cableada al útil) manda; la planta reacciona en tiempo real.` : 'Tu placa de verdad (STM32, ESP32, Arduino, PLC…) ejecuta su programa. El útil HIL le da los sensores de la planta y lee sus salidas. Conéctalo por USB.'));
    if (!webSerialOk()) box.append(el('p', { class: 'warn' }, 'Este navegador no tiene Web Serial: usa Chrome o Edge en el ordenador.'));
    else box.append(el('div', { class: 'pl-row' },
      on ? act('⏏ Desconectar', async () => { await U.close(); }) : act('🔌 Conectar el útil', async () => { T.util = new UtilLink(); T.util.log = sayMon; await T.util.connect(); sayMon('Útil conectado.\n'); }, 'mini-b on'),
      act('⬇ Instalar firmware', async () => { if (T.util && T.util.connected) await T.util.close(); const code = await fetchFirmware(); const rb = new RealBoard(sayMon); sayMon('Grabando el firmware del útil (main.py)…\n'); await rb.connect(); await rb.save(code, 'main.py'); await rb.close(); sayMon('✅ Firmware grabado. Ya puedes «Conectar el útil».\n'); }),
      on ? act('🛑 Todo a reposo', async () => { await U.safe(); }) : '')); }
  box.append(el('div', { class: 'pl-row' }, btn('⚡ Conectar señales solas', () => autoAssign(), 'mini-b'), P.ctl === 'sim' && hasProgram(P.exId) ? btn('📝 Escribir el programa', writeProgram, 'mini-b') : '',
    btn('💾', () => download(new Blob([JSON.stringify(P.toJSON(), null, 1)], { type: 'application/json' }), (P.title || 'planta').replace(/\W+/g, '-').toLowerCase() + '.planta.json'), 'mini-b'),
    btn('📂', () => { const i = el('input', { type: 'file', accept: '.json,application/json', on: { change: async e => { const f = e.target.files[0]; if (!f) return; try { P.load(JSON.parse(await f.text())); savePlant(); R.pv && R.pv.refresh(); } catch (er) { toast('Ese archivo no es una planta', 1800); } } } }); i.click(); }, 'mini-b'),
    btn('🆕', async () => { if (!(await confirmBox('¿Empezar una planta vacía?'))) return; P.load({ ctl: P.ctl }); P.title = 'Mi planta'; savePlant(); R.pv && R.pv.refresh(); }, 'mini-b')), exSel);
  if (P.exId) { const ex = PLANTS.find(p => p.id === P.exId); if (ex) box.append(el('p', { class: 'muted' }, ex.about)); }
  return box;
}
