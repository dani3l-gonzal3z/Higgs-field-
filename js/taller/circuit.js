// Taller: catálogo de piezas, red eléctrica (nets) y evaluación "de verdad suficiente" para aprender.
// El formato del circuito es el diagram.json de Wokwi/Velxio, así que se importa y exporta tal cual.
export const BOARDS = {
  uno: { type: 'wokwi-arduino-uno', id: 'uno', name: 'Arduino Uno', lang: 'cpp', vcc: 5 },
  pico: { type: 'wokwi-pi-pico', id: 'pico', name: 'Raspberry Pi Pico', lang: 'python', vcc: 3.3 },
};
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
const K = 79 / 105; // del dibujo de Velxio (5 px/mm) al paso estándar de 9,6 px
const PICO_PINS = [['GP0', 8, 17], ['GP1', 8, 30], ['GND.1', 8, 42], ['GP2', 8, 55], ['GP3', 8, 68], ['GP4', 8, 81], ['GP5', 8, 93], ['GND.2', 8, 106], ['GP6', 8, 119], ['GP7', 8, 131], ['GP8', 8, 144], ['GP9', 8, 157], ['GND.3', 8, 169], ['GP10', 8, 182], ['GP11', 8, 195], ['GP12', 8, 207], ['GP13', 8, 220], ['GND.4', 8, 233], ['GP14', 8, 246], ['GP15', 8, 258],
  ['GP16', 97, 258], ['GP17', 97, 246], ['GND.5', 97, 233], ['GP18', 97, 220], ['GP19', 97, 207], ['GP20', 97, 195], ['GP21', 97, 182], ['GND.6', 97, 169], ['GP22', 97, 157], ['RUN', 97, 144], ['GP26', 97, 131], ['GP27', 97, 119], ['GND.7', 97, 106], ['GP28', 97, 93], ['ADC_VREF', 97, 81], ['3V3', 97, 68], ['3V3_EN', 97, 55], ['GND.8', 97, 42], ['VSYS', 97, 30], ['VBUS', 97, 17]]
  .map(([name, x, y]) => ({ name, x: +(x * K).toFixed(2), y: +(y * K).toFixed(2), signals: [] }));
export function definePico() {
  if (typeof customElements === 'undefined' || customElements.get('wokwi-pi-pico')) return;
  customElements.define('wokwi-pi-pico', class extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: 'open' }); this._led = false; }
    connectedCallback() { this.shadowRoot.innerHTML = `<style>:host{display:inline-block;line-height:0;position:relative}img{display:block;width:79px;height:200px}i{position:absolute;left:28px;top:8px;width:7px;height:5px;border-radius:2px;background:#3f3;box-shadow:0 0 8px 3px #3f3;opacity:0;transition:opacity .05s}</style><img src="${new URL('../../taller/art/pi-pico.svg', import.meta.url)}" draggable="false" alt="Raspberry Pi Pico"><i></i>`; }
    get pinInfo() { return PICO_PINS; }
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
    if (t === 'wokwi-arduino-uno') { ['GND.2', 'GND.3'].forEach(g => uf.u(p.id + ':GND.1', p.id + ':' + g)); uf.u(p.id + ':A4', p.id + ':A4.2'); uf.u(p.id + ':A5', p.id + ':A5.2'); }
    if (t === 'wokwi-pi-pico') for (let i = 2; i <= 8; i++) uf.u(p.id + ':GND.1', p.id + ':GND.' + i);
  }
  // Patas clavadas en la protoboard (a menos de 4 px de un agujero)
  const holes = []; for (const p of parts) if ((PARTS[TYPE_ALIAS[p.type] || p.type] || {}).kind === 'bb') for (const pin of geo.pins[p.id] || []) holes.push({ id: p.id + ':' + pin.name, x: pin.ax, y: pin.ay });
  if (holes.length) for (const p of parts) { if ((PARTS[TYPE_ALIAS[p.type] || p.type] || {}).kind === 'bb') continue; for (const pin of geo.pins[p.id] || []) { let best = null, bd = 16; for (const h of holes) { const d = (h.x - pin.ax) ** 2 + (h.y - pin.ay) ** 2; if (d < bd) { bd = d; best = h; } } if (best) uf.u(p.id + ':' + pin.name, best.id); } }
  return uf;
}

/* ---------- Evaluación en cada fotograma ---------- */
// Devuelve el estado visual de cada pieza y avisos (LED sin resistencia, cortocircuito, 5 V en la Pico…).
export function evaluate({ circuit, uf0, runner, board, ui }) {
  const uf = uf0.clone(); const parts = circuit.parts; const B = board; const VCC = BOARDS[B.key].vcc; const warn = new Set(); const out = {};
  for (const p of parts) { const t = p.type, st = ui[p.id] || {};
    if (t === 'wokwi-pushbutton' && st.pressed) uf.u(p.id + ':1.l', p.id + ':2.l');
    if (t === 'wokwi-slide-switch') uf.u(p.id + ':2', p.id + ':' + (st.value ? '3' : '1')); }
  const net = id => uf.f(id);
  // Fuentes fuertes por net
  const drv = new Map(); const add = (n, v, src) => { const a = drv.get(n) || []; a.push({ v, src }); drv.set(n, a); };
  const bid = B.id;
  if (B.key === 'uno') { add(net(bid + ':5V'), 5, '5V'); add(net(bid + ':3.3V'), 3.3, '3.3V'); add(net(bid + ':GND.1'), 0, 'GND'); }
  else { add(net(bid + ':3V3'), 3.3, '3V3'); add(net(bid + ':VBUS'), 5, 'VBUS'); add(net(bid + ':VSYS'), 5, 'VSYS'); add(net(bid + ':GND.1'), 0, 'GND'); }
  const mcuPins = runner ? runner.pins : []; const duty = {};
  for (const pin of mcuPins) { const l = runner.level(pin); if (l.out == null) continue; const d = runner.duty(pin); duty[pin] = d; const pwm = d.rate > 30; const v = pwm ? (d.duty > 0.01 ? VCC : 0) : l.out ? VCC : 0; add(net(bid + ':' + pin), v, 'pin:' + pin); }
  // Potenciómetro y sensor de luz actúan como fuentes en su salida
  const strong = n => { const a = drv.get(n); if (!a) return null; const hasHi = a.some(x => x.v > 2), hasLo = a.some(x => x.v < 0.3); if (hasHi && hasLo) { warn.add('⚡ Cortocircuito: un mismo punto está unido a + y a GND (o a un pin en alto y otro en bajo). En la vida real algo se calentaría.'); return 0; } return Math.max(...a.map(x => x.v)); };
  for (const p of parts) { const st = ui[p.id] || {};
    if (p.type === 'wokwi-potentiometer') { const g = strong(net(p.id + ':GND')), v = strong(net(p.id + ':VCC')); if (g != null && v != null) add(net(p.id + ':SIG'), g + (v - g) * ((st.value ?? 512) / 1023), 'pot'); }
    if (p.type === 'wokwi-photoresistor-sensor') { const g = strong(net(p.id + ':GND')), v = strong(net(p.id + ':VCC')); if (g != null && v != null) { const lux = st.light ?? 0.5; add(net(p.id + ':AO'), g + (v - g) * (1 - lux), 'ldr'); add(net(p.id + ':DO'), lux > (st.threshold ?? 0.5) ? g : v, 'ldr'); out[p.id] = { ledPower: true, ledDO: lux <= (st.threshold ?? 0.5) }; } }
  }
  // Conexiones débiles: una resistencia une dos nets "con freno"
  const res = parts.filter(p => p.type === 'wokwi-resistor').map(p => [net(p.id + ':1'), net(p.id + ':2'), RES_OHMS(p.attrs && p.attrs.value)]);
  const eff = n => { const s = strong(n); if (s != null) return { v: s, via: 'direct', n }; for (const [a, b, r] of res) { const o = a === n ? b : b === n ? a : null; if (o == null) continue; const s2 = strong(o); if (s2 != null) return { v: s2, via: 'res', r, n: o }; } return null; };
  // Entradas del microcontrolador
  for (const pin of mcuPins) { const l = runner.level(pin); if (l.out != null) continue; const e = eff(net(bid + ':' + pin));
    const isAnalog = B.key === 'uno' ? /^A[0-5]$/.test(pin) : /^GP2[6-8]$/.test(pin);
    if (e) { runner.setInput(pin, e.v > VCC / 2); if (isAnalog) runner.setAnalog(pin, Math.min(VCC, e.v)); if (B.key === 'pico' && e.v > 3.6) warn.add(`⚠️ ${pin} recibe 5 V: la Pico real solo aguanta 3,3 V en sus pines.`); }
    else { runner.setInput(pin, l.pullup ? true : false); if (isAnalog) runner.setAnalog(pin, l.pullup ? VCC : 0); } }
  // Salidas visibles
  const pinOf = n => mcuPins.find(pin => net(bid + ':' + pin) === n);
  const bright = (nA, nC) => { const a = eff(nA), c = eff(nC); if (!a || !c) return { on: 0 }; const dv = a.v - c.v; if (dv < 1.6) return { on: 0 };
    const pa = pinOf(a.n), pc = pinOf(c.n); const d = pa && duty[pa] && duty[pa].rate > 30 ? duty[pa].duty : pc && duty[pc] && duty[pc].rate > 30 ? 1 - duty[pc].duty : 1;
    return { on: Math.max(0.08, d), burn: a.via === 'direct' && c.via === 'direct' }; };
  for (const p of parts) {
    const id = p.id;
    if (p.type === 'wokwi-led') { const b = bright(net(id + ':A'), net(id + ':C')); out[id] = { value: b.on > 0, brightness: b.on }; if (b.burn) { warn.add('🔥 Un LED va sin resistencia: en la vida real se fundiría (o rompería el pin). Pon una de 220 Ω en serie.'); out[id].burn = true; } }
    else if (p.type === 'wokwi-rgb-led') { const c = net(id + ':COM'); const r = bright(net(id + ':R'), c), g = bright(net(id + ':G'), c), bl = bright(net(id + ':B'), c); out[id] = { ledRed: r.on, ledGreen: g.on, ledBlue: bl.on }; if (r.burn || g.burn || bl.burn) warn.add('🔥 El LED RGB va sin resistencias: pon una de 220 Ω en cada color.'); }
    else if (p.type === 'wokwi-7segment') { const c = net(id + ':COM.1'); out[id] = { values: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'].map(s => bright(net(id + ':' + s), c).on ? 1 : 0) }; }
    else if (p.type === 'wokwi-buzzer') { const p2 = pinOf(net(id + ':2')) || pinOf(net(id + ':1')); const d = p2 && duty[p2]; const gnd = eff(net(id + ':1')); out[id] = { hasSignal: !!(d && d.rate > 40 && gnd && gnd.v < 0.5), freq: d ? d.rate / 2 : 0 }; }
  }
  // Placa: LED de la placa
  if (runner) { if (B.key === 'uno') { const l = runner.level('13'); const d = duty['13']; out[bid] = { led13: d && d.rate > 30 ? d.duty > 0.2 : !!l.out, ledPower: true }; } else { const l = runner.level('GP25'); out[bid] = { led25: !!l.out }; } }
  return { out, warn: [...warn], pinOf, net };
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
  const m = new Map(); for (const p of circuit.parts) { const t = TYPE_ALIAS[p.type] || p.type; const info = PARTS[t] || (Object.values(BOARDS).find(b => b.type === t) ? { real: Object.values(BOARDS).find(b => b.type === t).name } : { real: t });
    const k = info.real + (t === 'wokwi-resistor' ? ` de ${fmtOhms(p.attrs && p.attrs.value)}` : t === 'wokwi-led' ? ` ${COLOR_ES[(p.attrs && p.attrs.color) || 'red'] || ''}` : ''); m.set(k, (m.get(k) || 0) + 1); }
  const wires = circuit.connections.length; if (wires) m.set('Cables dupont macho-macho', wires);
  return [...m.entries()].map(([k, n]) => ({ item: k.trim(), n }));
}
export const COLOR_ES = { red: 'rojo', green: 'verde', blue: 'azul', yellow: 'amarillo', white: 'blanco', orange: 'naranja', black: 'negro' };
export const fmtOhms = v => { const o = RES_OHMS(v); return o >= 1e6 ? o / 1e6 + ' MΩ' : o >= 1e3 ? o / 1e3 + ' kΩ' : o + ' Ω'; };
export function describePin(circuit, ref) {
  const [id, pin] = ref.split(':'); const p = circuit.parts.find(x => x.id === id); if (!p) return ref; const t = TYPE_ALIAS[p.type] || p.type;
  const board = Object.values(BOARDS).find(b => b.type === t); if (board) return `el pin ${pin} de la ${board.name}`;
  const info = PARTS[t] || { name: t, pins: {} }; const label = (info.pins || {})[pin] || pin;
  if (info.kind === 'bb') return `el agujero ${pin} de la protoboard`;
  const extra = t === 'wokwi-led' ? ` ${COLOR_ES[(p.attrs && p.attrs.color) || 'red']}` : t === 'wokwi-resistor' ? ` de ${fmtOhms(p.attrs && p.attrs.value)}` : '';
  return `${label} del ${info.name.toLowerCase()}${extra} (${id})`;
}
