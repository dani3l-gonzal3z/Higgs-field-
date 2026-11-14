// Piezas «profesionales» del Taller: transistores, MOSFET, diodo, motor, relé, joystick, sensores I2C, NeoPixel, DHT22, PIR…
// Cada una trae: dibujo propio (o el de @wokwi/elements), su modelo eléctrico para el análisis nodal y sus mandos.
import { PARTS, EXTRA_PARTS } from './circuit.js';
import { fmtA } from './solver.js';

const P9 = 9.6;
function defineSvg(tag, { w, h, pins, svg, props = {} }) {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, class extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: 'open' }); this._p = { ...props }; }
    connectedCallback() { this.render(); }
    static get observedAttributes() { return ['label', 'value', 'text']; } attributeChangedCallback() { this.render(); }
    get pinInfo() { return pins; }
    render() { if (!this.shadowRoot) return; this.shadowRoot.innerHTML = `<style>:host{display:inline-block;line-height:0}svg{display:block;overflow:visible}</style>${svg(this._p, this)}`; }
    set state(v) { const s = JSON.stringify(v); if (s === this._s) return; this._s = s; Object.assign(this._p, v); this.render(); }
  });
}
const lead = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#b9b9b9" stroke-width="1.6"/>`;
const ink = '#222', txt = (x, y, t, s = 7, c = '#333', a = 'middle') => `<text x="${x}" y="${y}" font-size="${s}" fill="${c}" text-anchor="${a}" font-family="system-ui,sans-serif">${t}</text>`;
// Módulo en placa (sensores): rectángulo con su nombre y una tira de pines abajo
function moduleEl(tag, { label, color = '#1a3d8f', w, h = 46, pins, extra = () => '' }) {
  const ps = pins.map((n, i) => ({ name: n, x: (w - (pins.length - 1) * P9) / 2 + i * P9, y: h - 3 }));
  defineSvg(tag, { w, h, pins: ps, svg: (p) => `<svg width="${w}" height="${h}"><rect x=".5" y=".5" width="${w - 1}" height="${h - 9}" rx="3" fill="${color}" stroke="#0005"/>${txt(w / 2, 13, label, 7.5, '#fff')}${extra(p, w, h)}${ps.map(q => `<rect x="${q.x - 2.5}" y="${h - 10}" width="5" height="6" fill="#111"/><circle cx="${q.x}" cy="${q.y - 4}" r="1.5" fill="#d6b44a"/>${txt(q.x, h - 12, q.name, 4.6, '#ddd')}`).join('')}</svg>` });
}

export function defineParts() {
  // Transistor NPN / PNP (encapsulado TO-92 visto de frente: E B C)
  for (const [tag, pnp] of [['plato-npn', false], ['plato-pnp', true]]) defineSvg(tag, { w: 30, h: 44, pins: [{ name: 'E', x: 5, y: 43 }, { name: 'B', x: 15, y: 43 }, { name: 'C', x: 25, y: 43 }],
    svg: p => `<svg width="30" height="44"><path d="M3 22 V8 a12 12 0 0 1 24 0 V22 Z" fill="${p.st === 'sat' ? '#3a3a3a' : '#1d1d1d'}" stroke="#000"/>${txt(15, 13, pnp ? 'PNP' : 'NPN', 6, '#ddd')}${txt(15, 20, p.label || (pnp ? 'BC557' : 'BC547'), 4.6, '#aaa')}${lead(5, 22, 5, 43)}${lead(15, 22, 15, 43)}${lead(25, 22, 25, 43)}${txt(5, 30, 'E', 5, '#888')}${txt(15, 30, 'B', 5, '#888')}${txt(25, 30, 'C', 5, '#888')}${p.st && p.st !== 'off' ? `<circle cx="24" cy="5" r="2.2" fill="${p.st === 'sat' ? '#57e389' : '#ffb43c'}"/>` : ''}</svg>` });
  // MOSFET de canal N (TO-220: G D S)
  defineSvg('plato-nmos', { w: 34, h: 56, pins: [{ name: 'G', x: 7, y: 55 }, { name: 'D', x: 17, y: 55 }, { name: 'S', x: 27, y: 55 }],
    svg: p => `<svg width="34" height="56"><rect x="2" y="0" width="30" height="12" fill="#c0c6cc" stroke="#777"/><circle cx="17" cy="6" r="3" fill="#f4f1ea" stroke="#777"/><rect x="2" y="12" width="30" height="22" fill="#1d1d1d"/>${txt(17, 22, 'IRLZ44N', 5, '#ddd')}${txt(17, 30, p.on ? 'ON' : 'off', 5, p.on ? '#57e389' : '#888')}${lead(7, 34, 7, 55)}${lead(17, 34, 17, 55)}${lead(27, 34, 27, 55)}${txt(7, 42, 'G', 5, '#888')}${txt(17, 42, 'D', 5, '#888')}${txt(27, 42, 'S', 5, '#888')}</svg>` });
  // Diodo (ánodo a la izquierda, banda del cátodo a la derecha)
  defineSvg('plato-diode', { w: 58, h: 12, pins: [{ name: 'A', x: 1, y: 6 }, { name: 'C', x: 57, y: 6 }],
    svg: p => `<svg width="58" height="12">${lead(1, 6, 18, 6)}${lead(40, 6, 57, 6)}<rect x="18" y="1.5" width="22" height="9" rx="2" fill="#1d1d1d"/><rect x="34" y="1.5" width="3" height="9" fill="#ccc"/>${txt(27, 8.5, p.label || '1N4007', 4, '#aaa')}${p.on ? '<circle cx="29" cy="-2" r="1.6" fill="#57e389"/>' : ''}</svg>` });
  // Motor de continua: gira según su corriente
  defineSvg('plato-motor', { w: 58, h: 58, pins: [{ name: '+', x: 20, y: 57 }, { name: '-', x: 38, y: 57 }],
    svg: p => `<svg width="58" height="58"><circle cx="29" cy="27" r="25" fill="#c0c6cc" stroke="#777"/><circle cx="29" cy="27" r="17" fill="#9aa3ab"/><g transform="rotate(${p.angle || 0} 29 27)"><rect x="27" y="10" width="4" height="34" rx="2" fill="#333"/><circle cx="29" cy="27" r="4" fill="#ffb43c"/></g>${txt(29, 56, p.rpm ? Math.round(p.rpm) + ' rpm' : 'motor', 5.5, '#555')}${lead(20, 50, 20, 57)}${lead(38, 50, 38, 57)}${txt(14, 54, '+', 7, '#c33')}${txt(44, 54, '−', 7, '#333')}</svg>` });
  // Módulo de relé (con su transistor y diodo ya montados): IN, VCC, GND · COM, NO, NC
  defineSvg('plato-relay', { w: 96, h: 58, pins: [{ name: 'IN', x: 4, y: 14 }, { name: 'VCC', x: 4, y: 29 }, { name: 'GND', x: 4, y: 44 }, { name: 'NO', x: 92, y: 14 }, { name: 'COM', x: 92, y: 29 }, { name: 'NC', x: 92, y: 44 }],
    svg: p => `<svg width="96" height="58"><rect x=".5" y=".5" width="95" height="57" rx="3" fill="#1a3d8f" stroke="#0005"/><rect x="22" y="8" width="44" height="34" rx="2" fill="#2a6bd1" stroke="#123"/>${txt(44, 22, 'RELÉ', 7, '#fff')}${txt(44, 32, '5V', 6, '#cde')}<circle cx="16" cy="50" r="3" fill="${p.on ? '#ff4040' : '#401010'}"/>${['IN', 'VCC', 'GND'].map((n, i) => txt(10, 16 + i * 15, n, 5, '#ddd', 'start')).join('')}${['NO', 'COM', 'NC'].map((n, i) => txt(86, 16 + i * 15, n, 5, '#ddd', 'end')).join('')}<path d="M72 29 L82 ${p.on ? 14 : 44}" stroke="#ffb43c" stroke-width="2"/></svg>` });
  // Sensores I2C y digitales
  moduleEl('plato-bmp280', { label: 'BMP280', color: '#5b2a86', w: 56, pins: ['VCC', 'GND', 'SCL', 'SDA'], extra: (p, w) => `<rect x="${w / 2 - 5}" y="18" width="10" height="10" fill="#bbb"/>${txt(w / 2, 36, p.temp != null ? `${p.temp.toFixed(1)} °C` : '', 5, '#eee')}` });
  moduleEl('plato-dht22', { label: 'DHT22', color: '#e8e8e8', w: 46, h: 60, pins: ['VCC', 'SDA', 'NC', 'GND'], extra: (p, w) => `${[0, 1, 2, 3, 4].map(i => `<rect x="7" y="${19 + i * 5}" width="${w - 14}" height="2.5" fill="#bbb"/>`).join('')}` });
  moduleEl('plato-pir', { label: 'PIR', color: '#1d6b3a', w: 50, h: 56, pins: ['VCC', 'OUT', 'GND'], extra: (p, w) => `<circle cx="${w / 2}" cy="27" r="13" fill="${p.on ? '#fff8d8' : '#f4f1ea'}" stroke="#bbb"/>${p.on ? `<circle cx="${w / 2}" cy="27" r="4" fill="#ff5a3c"/>` : ''}` });
  moduleEl('plato-joystick', { label: 'JOYSTICK', color: '#222', w: 66, h: 72, pins: ['GND', 'VCC', 'VRX', 'VRY', 'SW'], extra: (p, w) => `<circle cx="${w / 2}" cy="35" r="17" fill="#333" stroke="#555"/><circle cx="${w / 2 + ((p.x ?? 0.5) - 0.5) * 18}" cy="${35 + ((p.y ?? 0.5) - 0.5) * 18}" r="9" fill="${p.sw ? '#ffb43c' : '#555'}" stroke="#111"/>` });
  // Nota de texto (para documentar el circuito)
  defineSvg('plato-note', { w: 0, h: 0, pins: [], svg: (p, el) => { const t = String(el.getAttribute('text') || 'Nota'); const lines = t.split(/\\n|\n/); const w = Math.max(60, Math.min(260, Math.max(...lines.map(l => l.length)) * 6.4 + 16)), h = lines.length * 13 + 12;
    return `<svg width="${w}" height="${h}"><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="3" fill="#fff6b8" stroke="#d9c85a"/>${lines.map((l, i) => `<text x="8" y="${16 + i * 13}" font-size="11" fill="#333" font-family="system-ui,sans-serif">${l.replace(/[<&>]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]))}</text>`).join('')}</svg>`; } });
  // LCD con mochila I2C: el mismo dibujo de Wokwi, con sus cuatro pines
  if (typeof customElements !== 'undefined' && !customElements.get('plato-lcd1602-i2c')) customElements.define('plato-lcd1602-i2c', class extends HTMLElement {
    connectedCallback() { if (this.firstChild) return; this.style.display = 'inline-block'; this.style.lineHeight = 0; this.lcd = document.createElement('wokwi-lcd1602'); this.lcd.setAttribute('pins', 'i2c'); this.append(this.lcd); }
    get pinInfo() { return this.lcd ? this.lcd.pinInfo : []; } set characters(v) { if (this.lcd) this.lcd.characters = v; } get characters() { return this.lcd && this.lcd.characters; }
    set backlight(v) { if (this.lcd) this.lcd.backlight = v; } get backlight() { return this.lcd && this.lcd.backlight; } get offsetWidth() { return this.lcd ? this.lcd.offsetWidth : 0; }
  });
}

// Catálogo (se añade al de siempre) con sus modelos eléctricos
const S = (label, key, min, max, def, unit, dec = 0) => ({ label, get: u => ((u[key] ?? def) - min) / (max - min), set: v => ({ [key]: +(min + v * (max - min)).toFixed(dec) }), fmt: v => (min + v * (max - min)).toFixed(dec).replace('.', ',') + ' ' + unit });
Object.assign(PARTS, {
  'wokwi-ssd1306': { name: 'Pantalla OLED', icon: '🖥', kind: 'i2c', group: 'pantallas', attrs: {}, pins: { DATA: 'SDA', CLK: 'SCL', '3V3': '3,3 V', VIN: 'VCC', GND: 'GND' }, real: 'Pantalla OLED 0,96" SSD1306 I2C (128×64)', addr: 0x3C },
  'plato-lcd1602-i2c': { name: 'LCD con I2C', icon: '📟', kind: 'i2c', group: 'pantallas', attrs: {}, pins: { GND: 'GND', VCC: 'VCC (5 V)', SDA: 'SDA', SCL: 'SCL' }, real: 'LCD 16×2 con módulo I2C PCF8574', addr: 0x27 },
  'wokwi-neopixel': { name: 'NeoPixel', icon: '🔴', kind: 'ws2812', group: 'luces', n: 1, attrs: {}, pins: { VDD: '+5 V', VSS: 'GND', DIN: 'datos (entrada)', DOUT: 'datos (salida)' }, real: 'LED WS2812B' },
  'wokwi-led-ring': { name: 'Anillo NeoPixel', icon: '⭕', kind: 'ws2812', group: 'luces', n: 16, attrs: { pixels: '16' }, pins: { GND: 'GND', VCC: '+5 V', DIN: 'datos (entrada)', DOUT: 'datos (salida)' }, real: 'Anillo de 16 LEDs WS2812B' },
  'wokwi-neopixel-matrix': { name: 'Matriz NeoPixel 8×8', icon: '🔳', kind: 'ws2812', group: 'luces', n: 64, attrs: { rows: '8', cols: '8' }, pins: { GND: 'GND', VCC: '+5 V', DIN: 'datos (entrada)', DOUT: 'datos (salida)' }, real: 'Matriz 8×8 WS2812B' },
  'wokwi-mpu6050': { name: 'Acelerómetro MPU6050', icon: '🧭', kind: 'i2c', group: 'sensores', attrs: {}, pins: { VCC: 'VCC', GND: 'GND', SCL: 'SCL', SDA: 'SDA', AD0: 'dirección (a GND: 0x68)', INT: 'interrupción' }, real: 'Módulo GY-521 (MPU6050)', addr: 0x68,
    sliders: [S('↔ Inclinación X', 'ax', -2, 2, 0, 'g', 2), S('↕ Inclinación Y', 'ay', -2, 2, 0, 'g', 2), S('⤒ Z', 'az', -2, 2, 1, 'g', 2), S('⟳ Giro Z', 'gz', -250, 250, 0, '°/s')] },
  'plato-bmp280': { name: 'Barómetro BMP280', icon: '🌡', kind: 'i2c', group: 'sensores', attrs: {}, pins: { VCC: 'VCC (3,3 V)', GND: 'GND', SCL: 'SCL', SDA: 'SDA' }, real: 'Módulo BMP280 (I2C, 0x76)', addr: 0x76,
    sliders: [S('🌡 Temperatura', 'temp', -20, 50, 22, '°C', 1), S('⛰ Presión', 'press', 900, 1100, 1013.25, 'hPa', 1)] },
  'wokwi-ds1307': { name: 'Reloj DS1307', icon: '⏰', kind: 'i2c', group: 'sensores', attrs: {}, pins: { GND: 'GND', '5V': '+5 V', SDA: 'SDA', SCL: 'SCL', SQW: 'onda cuadrada' }, real: 'Módulo RTC DS1307', addr: 0x68 },
  'plato-dht22': { name: 'Humedad DHT22', icon: '💧', kind: 'dht', group: 'sensores', attrs: {}, pins: { VCC: 'VCC', SDA: 'datos', NC: 'sin conectar', GND: 'GND' }, real: 'Sensor DHT22 (AM2302)',
    sliders: [S('🌡 Temperatura', 'temp', -20, 60, 24, '°C', 1), S('💧 Humedad', 'hum', 0, 100, 55, '%', 0)] },
  'plato-pir': { name: 'Sensor de movimiento', icon: '🚶', kind: 'pir', group: 'sensores', attrs: {}, pins: { VCC: 'VCC (5 V)', OUT: 'salida (3,3 V)', GND: 'GND' }, real: 'Sensor PIR HC-SR501' },
  'plato-joystick': { name: 'Joystick', icon: '🕹', kind: 'joy', group: 'entradas', attrs: {}, pins: { GND: 'GND', VCC: 'VCC', VRX: 'eje X (analógico)', VRY: 'eje Y (analógico)', SW: 'pulsador (a GND)' }, real: 'Joystick analógico KY-023',
    sliders: [S('↔ X', 'x', 0, 1, 0.5, '', 2), S('↕ Y', 'y', 0, 1, 0.5, '', 2)] },
  'wokwi-slide-potentiometer': { name: 'Potenciómetro deslizante', icon: '🎚', kind: 'pot', group: 'entradas', attrs: { travelLength: '30' }, pins: { GND: 'GND', SIG: 'señal', VCC: 'VCC' }, real: 'Potenciómetro deslizante 10 kΩ' },
  'plato-npn': { name: 'Transistor NPN', icon: '⑂', kind: 'bjt', group: 'potencia', attrs: {}, pins: { E: 'emisor', B: 'base', C: 'colector' }, real: 'Transistor BC547 (NPN)' },
  'plato-pnp': { name: 'Transistor PNP', icon: '⑂', kind: 'bjt', group: 'potencia', attrs: {}, pins: { E: 'emisor', B: 'base', C: 'colector' }, real: 'Transistor BC557 (PNP)' },
  'plato-nmos': { name: 'MOSFET N', icon: '▥', kind: 'mos', group: 'potencia', attrs: {}, pins: { G: 'puerta', D: 'drenador', S: 'fuente' }, real: 'MOSFET IRLZ44N (nivel lógico)' },
  'plato-diode': { name: 'Diodo', icon: '▷|', kind: 'diode', group: 'potencia', attrs: {}, pins: { A: 'ánodo', C: 'cátodo (banda)' }, real: 'Diodo 1N4007' },
  'plato-motor': { name: 'Motor DC', icon: '⚙️', kind: 'motor', group: 'potencia', attrs: {}, pins: { '+': '+', '-': '−' }, real: 'Motor DC 3-6 V (tipo 130)' },
  'plato-note': { name: 'Nota', icon: '📝', kind: 'note', group: 'basicas', attrs: { text: 'Nota' }, text: true, pins: {}, real: null },
  'plato-relay': { name: 'Módulo relé', icon: '🔀', kind: 'relay', group: 'potencia', attrs: {}, pins: { IN: 'control', VCC: '+5 V', GND: 'GND', NO: 'normalmente abierto', COM: 'común', NC: 'normalmente cerrado' }, real: 'Módulo relé de 1 canal 5 V' },
});
const motorSt = new Map();
// El BC547/BC557 aguanta 100 mA de colector: más, y se quema
function bjtShow(id, c, name) { const e = c.N.byId(id)[0]; const ic = e ? Math.abs(c.N.current(e)) : 0; if (ic > 0.1) c.warn.add(`🔥 El transistor ${id} (${name}) lleva ${fmtA(ic)} y aguanta 100 mA: se quemaría. Para motores usa un MOSFET (IRLZ44N) o un TIP120.`); return { state: { st: e && e.st } }; }
Object.assign(EXTRA_PARTS, {
  'wokwi-ssd1306': { net: (N, id, P) => { N.R(id, P('VIN'), P('GND'), 330); } },
  'plato-lcd1602-i2c': { net: (N, id, P) => { N.R(id, P('VCC'), P('GND'), 200); } },
  'wokwi-mpu6050': { net: (N, id, P) => N.R(id, P('VCC'), P('GND'), 1200) },
  'plato-bmp280': { net: (N, id, P) => N.R(id, P('VCC'), P('GND'), 3000) },
  'wokwi-ds1307': { net: (N, id, P) => N.R(id, P('5V'), P('GND'), 3000) },
  'plato-dht22': { net: (N, id, P) => N.R(id, P('VCC'), P('GND'), 3000) },
  'wokwi-neopixel': { net: (N, id, P) => N.R(id, P('VDD'), P('VSS'), 5000) },
  'wokwi-led-ring': { net: (N, id, P) => N.R(id, P('VCC'), P('GND'), 1000) },
  'wokwi-neopixel-matrix': { net: (N, id, P) => N.R(id, P('VCC'), P('GND'), 300) },
  'plato-pir': { net: (N, id, P, st) => { N.R(id, P('VCC'), P('GND'), 3000); N.V(id + ':out', P('OUT'), st.motion ? 3.3 : 0, 200); }, show: (id, c) => ({ state: { on: !!c.ui.motion } }) },
  'plato-joystick': { net: (N, id, P, st) => { for (const [k, ax] of [['VRX', 'x'], ['VRY', 'y']]) { const x = Math.max(0.001, Math.min(0.999, st[ax] ?? 0.5)); N.R(id + ':' + k + 'lo', P('GND'), P(k), 10000 * x); N.R(id + ':' + k + 'hi', P(k), P('VCC'), 10000 * (1 - x)); } if (st.sw) N.R(id + ':sw', P('SW'), P('GND'), 0.1); },
    show: (id, c) => ({ state: { x: c.ui.x ?? 0.5, y: c.ui.y ?? 0.5, sw: !!c.ui.sw } }) },
  'plato-npn': { net: (N, id, P) => N.Q(id, P('C'), P('B'), P('E'), 200, false), show: (id, c) => bjtShow(id, c, 'BC547') },
  'plato-pnp': { net: (N, id, P) => N.Q(id, P('C'), P('B'), P('E'), 200, true), show: (id, c) => bjtShow(id, c, 'BC557') },
  'plato-note': {},
  'plato-nmos': { net: (N, id, P) => N.M(id, P('D'), P('G'), P('S'), 1.8, 0.03), show: (id, c) => { const e = c.N.byId(id)[0]; return { state: { on: e && e.on } }; } },
  'plato-diode': { net: (N, id, P) => N.D(id, P('A'), P('C'), 0.7, 0.3), show: (id, c) => { const e = c.N.byId(id)[0]; return { state: { on: e && e.on } }; } },
  'plato-motor': { net: (N, id, P) => N.R(id, P('+'), P('-'), 12),
    show: (id, c) => { const i = c.I(id); const s = motorSt.get(id) || { a: 0, rpm: 0, t: performance.now() }; const now = performance.now(); const dt = Math.min(0.1, (now - s.t) / 1000); s.t = now;
      const target = Math.abs(i) > 0.03 ? Math.sign(i) * Math.min(12000, (Math.abs(i) - 0.03) * 30000) : 0; s.rpm += (target - s.rpm) * Math.min(1, dt * 4); s.a = (s.a + s.rpm / 60 * 360 * dt / 40) % 360; motorSt.set(id, s);
      if (Math.abs(i) > 0.05 && [...c.N.els].some(e => e.tag === 'pin' && Math.abs(c.N.current(e)) > 0.05)) c.warn.add(`⚙️ El motor ${id} chupa ${fmtA(Math.abs(i))} directamente de un pin: necesita un transistor o un driver (y un diodo de protección).`);
      return { state: { angle: s.a, rpm: Math.abs(s.rpm) } }; } },
  'plato-relay': { net: (N, id, P, st) => { N.R(id + ':coil', P('VCC'), P('GND'), 70); N.R(id + ':in', P('IN'), P('GND'), 4700); if (st.on) N.R(id + ':no', P('COM'), P('NO'), 0.05); else N.R(id + ':nc', P('COM'), P('NC'), 0.05); },
    show: (id, c) => { const vin = c.V(c.net('IN')) - c.V(c.net('GND')), vcc = c.V(c.net('VCC')) - c.V(c.net('GND')); const on = vcc > 3.5 && vin > 2; if (on !== !!c.ui.on) c.ui.on = on; return { state: { on } }; } },
});
