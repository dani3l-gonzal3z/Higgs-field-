// Taller: catálogo de piezas, red eléctrica (nets) y evaluación "de verdad suficiente" para aprender.
// El formato del circuito es el diagram.json de Wokwi/Velxio, así que se importa y exporta tal cual.
import { BOARDS, boardByType, powerOf, analogPins, PICO_PINS_ART } from './boards.js';
import { Netlist, LED_VF, LED_RS, fmtA, fmtV } from './solver.js';
export { BOARDS };
// kind: cómo se comporta. label/hint: lo que ve la gente.
export const PARTS = {
  'wokwi-led': { name: 'LED', icon: '💡', kind: 'led', attrs: { color: 'red' }, opts: { color: ['red', 'green', 'blue', 'yellow', 'white', 'orange'] }, pins: { A: 'ánodo + (pata larga)', C: 'cátodo − (pata corta)' }, real: 'LED de 5 mm' },
  'wokwi-resistor': { name: 'Resistencia', icon: '〰️', kind: 'res', attrs: { value: '220' }, opts: { value: ['220', '330', '1000', '4700', '10000'] }, pins: { 1: 'pata 1', 2: 'pata 2' }, real: 'Resistencia' },
  'wokwi-pushbutton': { name: 'Botón', icon: '🔘', kind: 'button', attrs: { color: 'green' }, opts: { color: ['green', 'red', 'blue', 'yellow', 'black'] }, pins: { '1.l': 'pata 1', '2.l': 'pata 2', '1.r': 'pata 1 (otro lado)', '2.r': 'pata 2 (otro lado)' }, real: 'Pulsador de 6 o 12 mm' },
  'wokwi-slide-switch': { name: 'Interruptor', icon: '🎚', kind: 'switch', attrs: {}, pins: { 1: 'extremo 1', 2: 'central (común)', 3: 'extremo 2' }, real: 'Interruptor deslizante' },
  'wokwi-potentiometer': { name: 'Potenciómetro', icon: '🎛', kind: 'pot', attrs: {}, pins: { GND: 'GND (−)', SIG: 'central (señal)', VCC: 'VCC (+)' }, real: 'Potenciómetro de 10 kΩ' },
  'wokwi-photoresistor-sensor': { name: 'Sensor de luz', icon: '☀️', kind: 'ldr', attrs: {}, pins: { VCC: 'VCC (+)', GND: 'GND (−)', DO: 'salida digital', AO: 'salida analógica' }, real: 'Módulo fotorresistor (LDR)' },
  'wokwi-buzzer': { name: 'Zumbador', icon: '🔊', kind: 'buzzer', attrs: {}, pins: { 1: '− (negro)', 2: '+ (rojo)' }, real: 'Zumbador pasivo' },
  'wokwi-servo': { name: 'Servo', icon: '🦾', kind: 'servo', attrs: {}, pins: { GND: 'GND (marrón)', 'V+': '+5 V (rojo)', PWM: 'señal (naranja)' }, real: 'Micro servo SG90' },
  'wokwi-rgb-led': { name: 'LED RGB', icon: '🌈', kind: 'rgb', attrs: {}, pins: { R: 'rojo', COM: 'común (−)', G: 'verde', B: 'azul' }, real: 'LED RGB de cátodo común' },
  'wokwi-7segment': { name: '7 segmentos', icon: '🔢', kind: 'seg7', attrs: { color: 'red' }, pins: { A: 'segmento A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', DP: 'punto', 'COM.1': 'común (−)', 'COM.2': 'común (−)' }, real: 'Display de 7 segmentos (cátodo común)' },
  'wokwi-lcd1602': { name: 'Pantalla LCD', icon: '📟', kind: 'lcd', attrs: { pins: 'full' }, pins: {}, real: 'LCD 16×2 HD44780' },
  'wokwi-hc-sr04': { name: 'Sensor de distancia', icon: '📏', kind: 'sonar', attrs: {}, pins: { VCC: 'VCC (+5 V)', TRIG: 'TRIG (disparo)', ECHO: 'ECHO (eco)', GND: 'GND (−)' }, real: 'Sensor ultrasónico HC-SR04' },
  'velxio-breadboard-mini': { name: 'Protoboard mini', icon: '🟫', kind: 'bb', attrs: {}, pins: {}, real: 'Protoboard de 170 puntos' },
  'velxio-breadboard': { name: 'Protoboard', icon: '🟫', kind: 'bb', attrs: {}, pins: {}, real: 'Protoboard de 830 puntos' },
};
export const TYPE_ALIAS = { 'wokwi-breadboard': 'velxio-breadboard', 'wokwi-breadboard-half': 'velxio-breadboard', 'wokwi-breadboard-mini': 'velxio-breadboard-mini' };
export const RES_OHMS = v => { const m = /^([\d.]+)\s*([kKmM]?)/.exec(String(v || '')); if (!m) return 1000; return +m[1] * (m[2].toLowerCase() === 'k' ? 1e3 : m[2].toLowerCase() === 'm' ? 1e6 : 1); };

/* ---------- Placa Raspberry Pi Pico (arte de Velxio/Fritzing; patillaje a paso de 0,1" como el resto) ---------- */
export function definePico() {
  if (typeof customElements === 'undefined' || customElements.get('wokwi-pi-pico')) return;
  customElements.define('wokwi-pi-pico', class extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: 'open' }); this._led = false; }
    connectedCallback() { this.shadowRoot.innerHTML = `<style>:host{display:inline-block;line-height:0;position:relative}img{display:block;width:79px;height:200px}i{position:absolute;left:28px;top:8px;width:7px;height:5px;border-radius:2px;background:#3f3;box-shadow:0 0 8px 3px #3f3;opacity:0;transition:opacity .05s}</style><img src="${new URL('../../taller/art/pi-pico.svg', import.meta.url)}" draggable="false" alt="Raspberry Pi Pico"><i></i>`; }
    get pinInfo() { return PICO_PINS_ART; }
    set led25(v) { this._led = v; const i = this.shadowRoot && this.shadowRoot.querySelector('i'); if (i) i.style.opacity = v ? 1 : 0; }
    get led25() { return this._led; }
  });
}

/* ---------- Red eléctrica ---------- */
class UF { constructor() { this.p = new Map(); } f(a) { if (!this.p.has(a)) this.p.set(a, a); let r = a; while (this.p.get(r) !== r) r = this.p.get(r); this.p.set(a, r); return r; } u(a, b) { this.p.set(this.f(a), this.f(b)); } clone() { const c = new UF(); c.p = new Map(this.p); return c; } }
const BB_HOLE = /^(\d+)([tb])\.([a-j])$/, BB_RAIL = /^([tb][pn])\.(\d+)$/;
// Uniones fijas: cables, columnas de la protoboard, patas que se clavan en la protoboard, GND internos, etc.
export function staticNets(circuit, geo) {
  const uf = new UF(); const parts = circuit.parts;
  for (const c of circuit.connections) uf.u(c[0], c[1]);
  for (const p of parts) {
    const t = TYPE_ALIAS[p.type] || p.type; const pins = (geo.pins[p.id] || []);
    if (PARTS[t] && PARTS[t].kind === 'bb') { const groups = {}; for (const pin of pins) { const h = BB_HOLE.exec(pin.name), r = BB_RAIL.exec(pin.name); const g = h ? 'c' + h[1] + h[2] : r ? 'r' + r[1] : null; if (g) (groups[g] = groups[g] || []).push(pin.name); } for (const g of Object.values(groups)) for (let i = 1; i < g.length; i++) uf.u(p.id + ':' + g[0], p.id + ':' + g[i]); }
    if (t === 'wokwi-pushbutton') { uf.u(p.id + ':1.l', p.id + ':1.r'); uf.u(p.id + ':2.l', p.id + ':2.r'); }
    if (t === 'wokwi-7segment') uf.u(p.id + ':COM.1', p.id + ':COM.2');
    if (t === 'wokwi-arduino-uno') { uf.u(p.id + ':A4', p.id + ':A4.2'); uf.u(p.id + ':A5', p.id + ':A5.2'); }
    if (t === 'wokwi-arduino-nano') ['11', '12', '13'].forEach(n => uf.u(p.id + ':' + n, p.id + ':' + n + '.2'));
    const brd = boardByType(t); if (brd) { const first = {}; for (const pin of Object.keys(brd.power || {})) { const c = powerOf(brd, pin); if (first[c]) uf.u(p.id + ':' + first[c], p.id + ':' + pin); else first[c] = pin; } }
  }
  // Patas clavadas en la protoboard (a menos de 4 px de un agujero)
  const holes = []; for (const p of parts) if ((PARTS[TYPE_ALIAS[p.type] || p.type] || {}).kind === 'bb') for (const pin of geo.pins[p.id] || []) holes.push({ id: p.id + ':' + pin.name, x: pin.ax, y: pin.ay });
  if (holes.length) for (const p of parts) { if ((PARTS[TYPE_ALIAS[p.type] || p.type] || {}).kind === 'bb') continue; for (const pin of geo.pins[p.id] || []) { let best = null, bd = 16; for (const h of holes) { const d = (h.x - pin.ax) ** 2 + (h.y - pin.ay) ** 2; if (d < bd) { bd = d; best = h; } } if (best) uf.u(p.id + ':' + pin.name, best.id); } }
  return uf;
}

/* ---------- Evaluación en cada fotograma ---------- */
// Devuelve el estado visual de cada pieza y avisos (LED sin resistencia, cortocircuito, 5 V en la Pico…).
// Límites por pin de cada chip (mA, recomendado) y resistencia interna equivalente de una salida (Ω)
const CHIP = { avr: { max: 20, abs: 40, r: 25, pull: 35000 }, rp2040: { max: 12, abs: 16, r: 40, pull: 50000 }, esp32: { max: 20, abs: 40, r: 30, pull: 45000 }, stm32: { max: 8, abs: 25, r: 40, pull: 40000 }, linux: { max: 8, abs: 16, r: 50, pull: 50000 } };
export const chipOf = B => CHIP[B.engine === 'avr' ? 'avr' : B.family === 'rp2040' ? 'rp2040' : B.family] || CHIP.rp2040;
const ldrCache = new Map();
export function evaluate({ circuit, uf0, runner, board, ui }) {
  const uf = uf0.clone(); const parts = circuit.parts; const B = BOARDS[board.key]; const VCC = B.vcc; const chip = chipOf(B); const warn = new Set(); const out = {};
  for (const p of parts) { const t = p.type, st = ui[p.id] || {};
    if (t === 'wokwi-pushbutton' && st.pressed) uf.u(p.id + ':1.l', p.id + ':2.l');
    if (t === 'wokwi-slide-switch') uf.u(p.id + ':2', p.id + ':' + (st.value ? '3' : '1')); }
  const net = id => uf.f(id); const bid = board.id;
  const gndPin = Object.keys(B.power || {}).find(k => B.power[k] === 0); const N = new Netlist(net(bid + ':' + gndPin));
  const P = (id, pin) => net(id + ':' + pin);
  // Alimentación de la placa (fuente casi ideal)
  for (const [pin, v] of Object.entries(B.power || {})) if (v) N.V('pwr:' + pin, P(bid, pin), v, 0.05, 'rail');
  // Pines del microcontrolador: salida = fuente con su resistencia interna; entrada = alta impedancia (+ pull-up/down)
  const mcuPins = runner ? runner.pins : []; const duty = {};
  for (const pin of mcuPins) { const l = runner.level(pin); const n = P(bid, pin);
    if (l.out != null) { const d = runner.duty(pin); duty[pin] = d; const pwm = d.rate > 30; const v = pwm ? (d.duty > 0.01 ? VCC : 0) : l.out ? VCC : 0; N.V('pin:' + pin, n, v, chip.r, 'pin'); }
    else if (l.pullup) N.V('pu:' + pin, n, VCC, chip.pull, 'pull'); else if (l.pulldown) N.V('pd:' + pin, n, 0, chip.pull, 'pull'); }
  // Las piezas
  const ldrs = [];
  for (const p of parts) { const id = p.id, st = ui[p.id] || {}, a = p.attrs || {};
    switch (p.type) {
      case 'wokwi-resistor': N.R(id, P(id, '1'), P(id, '2'), RES_OHMS(a.value)); break;
      case 'wokwi-led': N.D(id, P(id, 'A'), P(id, 'C'), LED_VF[a.color || 'red'] || 1.9, LED_RS(a.color || 'red'), 'led'); break;
      case 'wokwi-rgb-led': [['R', 1.75, 15], ['G', 2.5, 30], ['B', 2.6, 30]].forEach(([k, vf, rs]) => N.D(id + ':' + k, P(id, k), P(id, 'COM'), vf, rs, 'led')); break;
      case 'wokwi-7segment': ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'].forEach(k => N.D(id + ':' + k, P(id, k), P(id, 'COM.1'), 1.8, 20, 'led')); break;
      case 'wokwi-potentiometer': { const x = Math.max(0.0005, Math.min(0.9995, (st.value ?? 512) / 1023)); N.R(id + ':lo', P(id, 'GND'), P(id, 'SIG'), 10000 * x); N.R(id + ':hi', P(id, 'SIG'), P(id, 'VCC'), 10000 * (1 - x)); break; }
      case 'wokwi-slide-potentiometer': { const x = Math.max(0.0005, Math.min(0.9995, (st.value ?? 50) / 100)); N.R(id + ':lo', P(id, 'GND'), P(id, 'SIG'), 10000 * x); N.R(id + ':hi', P(id, 'SIG'), P(id, 'VCC'), 10000 * (1 - x)); break; }
      case 'wokwi-photoresistor-sensor': { const lux = st.light ?? 0.5; N.R(id + ':fix', P(id, 'VCC'), P(id, 'AO'), 10000); N.R(id + ':ldr', P(id, 'AO'), P(id, 'GND'), 100000 * Math.pow(10, -2 * lux)); N.R(id + ':led', P(id, 'VCC'), P(id, 'GND'), 1500); ldrs.push(p); break; }
      case 'wokwi-buzzer': N.R(id, P(id, '2'), P(id, '1'), 4000); break;
      case 'wokwi-servo': N.R(id, P(id, 'V+'), P(id, 'GND'), 500); break;
      case 'wokwi-hc-sr04': N.R(id, P(id, 'VCC'), P(id, 'GND'), 330); break;
      case 'wokwi-lcd1602': N.R(id + ':logic', P(id, 'VDD'), P(id, 'VSS'), 3300); N.D(id + ':bl', P(id, 'A'), P(id, 'K'), 2.8, 40, 'led'); break;
      default: { const def = EXTRA_PARTS[p.type]; if (def && def.net) def.net(N, id, k => P(id, k), st, a); }
      // (las piezas de parts.js registran aquí su modelo)
    }
  }
  N.solve();
  // Comparador del módulo de luz (DO): necesita saber la tensión de AO y de VCC
  if (ldrs.length) { for (const p of ldrs) { const vcc = N.volt(P(p.id, 'VCC')), ao = N.volt(P(p.id, 'AO')); const thr = (ui[p.id] && ui[p.id].threshold) ?? 0.5; const dark = vcc > 1 && ao > vcc * thr; N.V(p.id + ':do', P(p.id, 'DO'), dark ? 0 : vcc || 0, 100); out[p.id] = { ledPower: vcc > 1, ledDO: dark }; } N.solve(); }
  const V = n => N.volt(n) ?? 0; const I = id => N.byId(id).reduce((s, e) => s + N.current(e), 0);
  // Entradas del microcontrolador
  const analog = new Set(analogPins(B));
  for (const pin of mcuPins) { const l = runner.level(pin); if (l.out != null) continue; const n = P(bid, pin); const fl = N.floating(n); const v = fl ? (l.pullup ? VCC : 0) : V(n);
    runner.setInput(pin, v > VCC / 2); if (analog.has(pin)) runner.setAnalog(pin, Math.max(0, Math.min(VCC, v)));
    if (VCC < 4 && !B.tol5 && v > VCC + 0.4) warn.add(`⚠️ El pin ${pin} recibe ${fmtV(v)}: la ${B.name} real solo aguanta ${String(VCC).replace('.', ',')} V en sus pines.`); }
  // Avisos eléctricos
  let total = 0;
  for (const e of N.els) { if (e.tag === 'pin') { const i = N.current(e); const ma = Math.abs(i) * 1000; if (ma > chip.abs) warn.add(`🔥 El pin ${e.id.slice(4)} está dando ${fmtA(Math.abs(i))}: la ${B.name} aguanta como mucho ${chip.abs} mA por pin (${chip.max} mA recomendado). Se rompería.`); else if (ma > chip.max + 0.5) warn.add(`⚠️ El pin ${e.id.slice(4)} da ${fmtA(Math.abs(i))}: más de los ${chip.max} mA recomendados para la ${B.name}. Sube la resistencia.`); }
    if (e.tag === 'rail') { const i = N.current(e); total += Math.max(0, i); if (i > 1.5) warn.add('⚡ Cortocircuito: la alimentación de la placa está unida directamente a GND (o a otra tensión). En la vida real algo se quemaría.'); } }
  // Lo que se ve: LEDs según su corriente (y el PWM del pin que los mueve)
  const pinOf = n => mcuPins.find(pin => net(bid + ':' + pin) === n);
  // Pin que mueve un punto: directamente o a través de una resistencia
  const drv = i => { if (i < 0) return null; const d = pinOf(N.names[i]); if (d) return d; for (const r of N.els) if (r.t === 'R' && (r.a === i || r.b === i)) { const o = r.a === i ? r.b : r.a; const q = o >= 0 && pinOf(N.names[o]); if (q) return q; } return null; };
  const dutyOn = (e) => { const pa = drv(e.a), pc = drv(e.b); return pa && duty[pa] && duty[pa].rate > 30 ? duty[pa].duty : pc && duty[pc] && duty[pc].rate > 30 ? 1 - duty[pc].duty : 1; };
  const glow = id => { const es = N.byId(id); if (!es.length) return { on: 0, i: 0 }; const e = es[0]; const i = N.current(e); if (i < 2e-4) return { on: 0, i }; return { on: Math.max(0.08, Math.min(1, Math.pow(i / 0.012, 0.6)) * dutyOn(e)), i, burn: i > 0.035 }; };
  for (const p of parts) {
    const id = p.id;
    if (p.type === 'wokwi-led') { const g = glow(id); out[id] = { value: g.on > 0, brightness: g.on }; if (g.burn) { warn.add(`🔥 El LED ${id} lleva ${fmtA(g.i)}: en la vida real se fundiría. Ponle una resistencia en serie (220 Ω a 5 V, 100 Ω a 3,3 V).`); out[id].burn = true; } }
    else if (p.type === 'wokwi-rgb-led') { const r = glow(id + ':R'), g = glow(id + ':G'), bl = glow(id + ':B'); out[id] = { ledRed: r.on, ledGreen: g.on, ledBlue: bl.on }; if (r.burn || g.burn || bl.burn) warn.add('🔥 El LED RGB va sin resistencias: pon una en cada color.'); }
    else if (p.type === 'wokwi-7segment') { out[id] = { values: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'].map(s => glow(id + ':' + s).on ? 1 : 0) }; }
    else if (p.type === 'wokwi-buzzer') { const p2 = pinOf(net(id + ':2')) || pinOf(net(id + ':1')); const d = p2 && duty[p2]; out[id] = { hasSignal: !!(d && d.rate > 40 && Math.abs(I(id)) > 1e-5), freq: d ? d.rate / 2 : 0 }; }
    else if (p.type === 'wokwi-servo') { const vs = V(net(id + ':V+')) - V(net(id + ':GND')); if (vs > 0.5 && vs < 4.4) warn.add(`🦾 El servo ${id} está a ${fmtV(vs)}: los SG90 necesitan 5 V; a 3,3 V se mueven flojos o nada.`); }
    else if (p.type === 'wokwi-lcd1602') { const vd = V(net(id + ':VDD')) - V(net(id + ':VSS')); out[id] = { ...(out[id] || {}), backlight: glow(id + ':bl').on > 0 }; if (vd < 4) out[id].lowPower = true; }
    else { const def = EXTRA_PARTS[p.type]; if (def && def.show) { const o = def.show(id, { N, V, I, net: k => net(id + ':' + k), ui: (ui[id] = ui[id] || {}), warn, B }); if (o) out[id] = o; } }
  }
  if (runner) out[bid] = boardLeds(B, runner, duty);
  return { out, warn: [...warn], pinOf, net, N, total };
}
// Piezas que añaden su propio modelo eléctrico (transistores, diodos, motores…): las registra parts.js
export const EXTRA_PARTS = {};

// Estado de los LEDs de la placa, con el nombre de propiedad que espera su dibujo
export function boardLeds(B, runner, duty = {}) {
  const lit = (ref, low) => { const l = runner.level(ref); const d = duty[ref]; const on = d && d.rate > 30 ? d.duty > 0.2 : !!l.out; return l.out == null && !(d && d.rate > 30) ? false : low ? !on : on; };
  const ref = k => B.engine === 'avr' ? k : '#' + k; const L = B.led;
  if (L && L.prop) return { [L.prop]: lit(ref(L.pin || L.key), L.low), ...(L.extra || {}) };
  const o = {};
  if (L) o[L.id || 'led'] = lit(ref(L.key), L.low);
  if (B.flash) o.flash = lit(ref(B.flash));
  for (const [id, k] of B.leds || []) o[id] = lit(ref(k));
  if (B.rgbPins) { const c = k => (lit(ref(B.rgbPins[k]), B.rgbPins.low) ? 255 : 0); o.rgb = { r: c('r'), g: c('g'), b: c('b') }; }
  if (B.rgb && runner.rgb) o.rgb = runner.rgb;
  return { leds: o };
}

/* ---------- Pantalla LCD HD44780 en modo 4 bits (RS, E, D4-D7) ---------- */
export class HD44780 {
  constructor() { this.reset(); }
  reset() { this.ddram = new Uint8Array(80).fill(32); this.addr = 0; this.nib = null; this.four = false; this.inc = 1; this.display = true; this.cursor = false; this.blink = false; this.inited = 0; }
  latch(rs, d) { // d = nibble D7..D4
    if (!this.four) { // arranque: el controlador empieza en 8 bits; la librería manda 0x3 tres veces y luego 0x2
      if (!rs && d === 0x2) { this.four = true; this.nib = null; } return; }
    if (this.nib == null) { this.nib = d; return; } const v = (this.nib << 4) | d; this.nib = null; rs ? this.data(v) : this.cmd(v);
  }
  cmd(v) {
    if (v & 0x80) { this.addr = v & 0x7f; return; }
    if (v & 0x40) return; // CGRAM (caracteres propios): no se dibujan aquí
    if (v & 0x20) { if (!(v & 0x10)) this.four = true; return; }
    if (v & 0x10) { return; }
    if (v & 0x08) { this.display = !!(v & 4); this.cursor = !!(v & 2); this.blink = !!(v & 1); return; }
    if (v & 0x04) { this.inc = v & 2 ? 1 : -1; return; }
    if (v & 0x02) { this.addr = 0; return; }
    if (v & 0x01) { this.ddram.fill(32); this.addr = 0; }
  }
  data(v) { this.ddram[this.addr & 0x7f] = v; this.addr = (this.addr + this.inc + 0x80) % 0x80; }
  chars() { const c = new Uint8Array(32); for (let i = 0; i < 16; i++) { c[i] = this.ddram[i]; c[16 + i] = this.ddram[0x40 + i]; } return this.display ? c : new Uint8Array(32).fill(32); }
  get cursorXY() { const a = this.addr; return a >= 0x40 ? [a - 0x40, 1] : [a, 0]; }
}

/* ---------- Pasos para montarlo en la vida real ---------- */
export function bom(circuit) {
  const m = new Map(); for (const p of circuit.parts) { const t = TYPE_ALIAS[p.type] || p.type; if (PARTS[t] && PARTS[t].real === null) continue; const info = PARTS[t] || (boardByType(t) ? { real: boardByType(t).name } : { real: t });
    const k = info.real + (t === 'wokwi-resistor' ? ` de ${fmtOhms(p.attrs && p.attrs.value)}` : t === 'wokwi-led' ? ` ${COLOR_ES[(p.attrs && p.attrs.color) || 'red'] || ''}` : ''); m.set(k, (m.get(k) || 0) + 1); }
  const wires = circuit.connections.length; if (wires) m.set('Cables dupont macho-macho', wires);
  return [...m.entries()].map(([k, n]) => ({ item: k.trim(), n }));
}
export const COLOR_ES = { red: 'rojo', green: 'verde', blue: 'azul', yellow: 'amarillo', white: 'blanco', orange: 'naranja', black: 'negro' };
export const fmtOhms = v => { const o = RES_OHMS(v); return o >= 1e6 ? o / 1e6 + ' MΩ' : o >= 1e3 ? o / 1e3 + ' kΩ' : o + ' Ω'; };
export function describePin(circuit, ref) {
  const [id, pin] = ref.split(':'); const p = circuit.parts.find(x => x.id === id); if (!p) return ref; const t = TYPE_ALIAS[p.type] || p.type;
  const board = boardByType(t); if (board) { const pw = powerOf(board, pin); return pw ? `el ${pw === 'gnd' ? 'GND' : pw === '5v' ? '5 V' : '3,3 V'} (pata ${pin}) de la ${board.name}` : board.flavor === 'linux' ? `el pin físico ${pin} de la ${board.name}` : `el pin ${pin} de la ${board.name}`; }
  const info = PARTS[t] || { name: t, pins: {} }; const label = (info.pins || {})[pin] || pin;
  if (info.kind === 'bb') return `el agujero ${pin} de la protoboard`;
  const extra = t === 'wokwi-led' ? ` ${COLOR_ES[(p.attrs && p.attrs.color) || 'red']}` : t === 'wokwi-resistor' ? ` de ${fmtOhms(p.attrs && p.attrs.value)}` : '';
  return `${label} del ${info.name.toLowerCase()}${extra} (${id})`;
}
