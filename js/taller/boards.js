// Placas del Taller. Tres maneras de simular, y cada placa dice cuál usa (sin trampas):
//   avr   → chip ATmega328P emulado instrucción a instrucción (avr8js). Se programa en C++ como en el IDE de Arduino.
//   pico  → chip RP2040 emulado (rp2040js) con el MicroPython oficial dentro.
//   shim  → la placa se simula a nivel de MicroPython / Python: corre en el RP2040 emulado, pero con una capa
//           «de soporte» (editable en 🔩 Por dentro) que imita los pines, el ADC y las librerías de esa placa
//           (machine de ESP32, pyb de STM32, RPi.GPIO / Hobot.GPIO / Jetson.GPIO, gpiozero, wiringpi…).
import { ART } from './boards-art.js';

/* ---------- Tabla de 40 pines (Raspberry Pi y compatibles) ---------- */
export const BCM2PHYS = { 2: 3, 3: 5, 4: 7, 14: 8, 15: 10, 17: 11, 18: 12, 27: 13, 22: 15, 23: 16, 24: 18, 10: 19, 9: 21, 25: 22, 11: 23, 8: 24, 7: 26, 0: 27, 1: 28, 5: 29, 6: 31, 12: 32, 13: 33, 19: 35, 16: 36, 26: 37, 20: 38, 21: 40 };
export const PHYS2BCM = Object.fromEntries(Object.entries(BCM2PHYS).map(([b, p]) => [p, +b]));
const H40_POWER = { 1: 3.3, 17: 3.3, 2: 5, 4: 5, 6: 0, 9: 0, 14: 0, 20: 0, 25: 0, 30: 0, 34: 0, 39: 0 };
const H40_GPIO = [3, 5, 7, 8, 10, 11, 12, 13, 15, 16, 18, 19, 21, 22, 23, 24, 26, 29, 31, 32, 33, 35, 36, 37, 38, 40];
const WPI2PHYS = { 0: 11, 1: 12, 2: 13, 3: 15, 4: 16, 5: 18, 6: 22, 7: 7, 8: 3, 9: 5, 10: 24, 11: 26, 12: 19, 13: 21, 14: 23, 15: 8, 16: 10, 21: 29, 22: 31, 23: 33, 24: 35, 25: 37, 26: 32, 27: 36, 28: 38, 29: 40 };

/* ---------- Dibujo propio para placas sin arte (Nucleo, Pyboard, C6, Linux de 40 pines) ---------- */
const P = 9.6; // paso de 0,1"
// Placa de dos columnas de pines (microcontroladores)
function twoCols({ label, left, right, w = 120, color = '#1d4f91', chip = 'MCU', leds = {} }) {
  const rows = Math.max(left.length, right.length), top = 26, h = top + rows * P + 18; const pins = [];
  left.forEach((n, i) => n && pins.push({ name: n, x: 6, y: top + i * P + P / 2 }));
  right.forEach((n, i) => n && pins.push({ name: n, x: w - 6, y: top + i * P + P / 2 }));
  return { w, h, pins, leds, draw: { kind: 'cols', label, color, chip } };
}
// Ordenador de placa con cabecera de 40 pines arriba
function sbc({ label, w = 321, h = 212, x0 = 34, color = '#1f6b3a', chip = 'SoC', ports = 'pi', leds = {} }) {
  const pins = []; for (let c = 0; c < 20; c++) { pins.push({ name: String(c * 2 + 1), x: x0 + c * P, y: 9 }); pins.push({ name: String(c * 2 + 2), x: x0 + c * P, y: 9 + P }); }
  return { w, h, pins, leds, draw: { kind: 'sbc', label, color, chip, ports, x0 } };
}
function drawSvg(a) {
  const d = a.draw, W = a.w, H = a.h; const light = (h => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; })(d.color); const ink = light ? '#222' : '#fff'; const esc = s => String(s).replace(/[<&>]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="6" fill="${d.color}" stroke="#0006"/>`;
  const holes = [[4, 4], [W - 4, 4], [4, H - 4], [W - 4, H - 4]];
  if (d.kind === 'sbc') {
    for (const [x, y] of [[9, 9], [W - 9, 9], [9, H - 9], [W - 9, H - 9]]) s += `<circle cx="${x}" cy="${y}" r="4.5" fill="#d9c27a"/><circle cx="${x}" cy="${y}" r="2.6" fill="#0d1a12"/>`;
    s += `<rect x="${d.x0 - 6}" y="2" width="${19 * P + 12}" height="${P + 14}" rx="2" fill="#111"/>`;
    for (const p of a.pins) s += `<rect x="${p.x - 2.6}" y="${p.y - 2.6}" width="5.2" height="5.2" fill="${p.name === '1' ? '#e7c35a' : '#c9a93f'}"/>`;
    const cx = W * 0.42, cy = H * 0.55; s += `<rect x="${cx - 26}" y="${cy - 26}" width="52" height="52" rx="3" fill="#2b2b2b" stroke="#555"/><text x="${cx}" y="${cy + 3}" font-size="8" fill="#bbb" text-anchor="middle" font-family="monospace">${esc(d.chip)}</text>`;
    if (d.ports === 'pi') { s += `<rect x="${W - 46}" y="${H * 0.08 + 22}" width="44" height="38" fill="#bcc3c9" stroke="#777"/><rect x="${W - 46}" y="${H * 0.36 + 18}" width="44" height="34" fill="#bcc3c9" stroke="#777"/><rect x="${W - 46}" y="${H * 0.66 + 10}" width="44" height="34" fill="#bcc3c9" stroke="#777"/>`; }
    else { s += `<rect x="${W - 50}" y="${H * 0.18}" width="48" height="40" fill="#bcc3c9" stroke="#777"/><rect x="${W - 50}" y="${H * 0.52}" width="48" height="40" fill="#bcc3c9" stroke="#777"/>`; }
    s += `<rect x="${W * 0.08}" y="${H - 18}" width="26" height="16" fill="#bcc3c9" stroke="#777"/><rect x="${W * 0.08 + 40}" y="${H - 16}" width="22" height="14" fill="#333"/><text x="${W * 0.07}" y="${H * 0.36}" font-size="13" font-weight="700" fill="#fff" font-family="system-ui,sans-serif">${esc(d.label)}</text><text x="${d.x0 - 8}" y="${P * 2 + 20}" font-size="6.5" fill="#fff9" font-family="monospace">1</text><text x="${d.x0 + 19 * P - 2}" y="${P * 2 + 20}" font-size="6.5" fill="#fff9" font-family="monospace">40</text>`;
  } else {
    for (const [x, y] of holes.slice(0, 0)) s += `<circle cx="${x}" cy="${y}" r="2"/>`;
    s += `<rect x="${W / 2 - 18}" y="${H / 2 - 18}" width="36" height="36" rx="2" fill="#222" stroke="#555"/><text x="${W / 2}" y="${H / 2 + 3}" font-size="6.5" fill="#bbb" text-anchor="middle" font-family="monospace">${esc(d.chip)}</text>`;
    s += `<rect x="${W / 2 - 13}" y="-1" width="26" height="12" rx="2" fill="#c0c6cc" stroke="#777"/><text x="${W / 2}" y="20" font-size="7.5" font-weight="700" fill="${ink}" text-anchor="middle" font-family="system-ui,sans-serif">${esc(d.label)}</text>`;
    for (const p of a.pins) { const left = p.x < W / 2; s += `<rect x="${p.x - 3}" y="${p.y - 3}" width="6" height="6" fill="#111"/><circle cx="${p.x}" cy="${p.y}" r="1.8" fill="#d6b44a"/><text x="${left ? p.x + 6 : p.x - 6}" y="${p.y + 2.2}" font-size="5.6" fill="${ink}" text-anchor="${left ? 'start' : 'end'}" font-family="monospace">${esc(p.name.replace(/\.\d+$/, ''))}</text>`; }
  }
  return s + '</svg>';
}

/* ---------- Las placas ---------- */
// io: [claveEnElCódigo, patillaEnLaPlaca | null (interna, p. ej. un LED de la placa)]. adc: claves analógicas.
// roles: qué patas usan los ejemplos. power: patas de alimentación (voltios). led: LED de la placa.
const num = list => list.map(n => [String(n), String(n)]);
const GP = (...n) => n.map(i => ['GP' + i, 'GP' + i]);
const PICO_IO = [...GP(...[...Array(23).keys()], 26, 27, 28), ['GP25', null]];
const H40 = names => H40_GPIO.map(p => [String(p), String(p), names ? names[p] : null]);
const RPI_LABEL = Object.fromEntries(H40_GPIO.map(p => [p, PHYS2BCM[p] != null ? 'GPIO' + PHYS2BCM[p] : '']));
const h40pow = () => Object.fromEntries(Object.entries(H40_POWER).map(([k, v]) => [k, v]));
const ESP_PWR = { '3V3': 3.3, VIN: 5, '5V': 5, GND: 0 };

export const BOARDS = {
  /* ── Arduino (chip emulado, C++) ── */
  uno: { family: 'arduino', name: 'Arduino Uno', chip: 'ATmega328P', tag: 'wokwi-arduino-uno', engine: 'avr', flavor: 'cpp', lang: 'cpp', vcc: 5, tol5: true,
    power: { '5V': 5, '3.3V': 3.3, VIN: 5, 'GND.1': 0, 'GND.2': 0, 'GND.3': 0 }, led: { pin: '13', prop: 'led13', extra: { ledPower: true } },
    roles: { led: '13', sem: ['12', '11', '10'], btn: '2', adc: 'A0', pwm: '9', buzz: '8', trig: '3', echo: '2', lcd: ['12', '11', '5', '4', '3', '2'], gnd: 'GND.2', vcc: '5V', v5: '5V' }, place: [0, 40], px: 330,
    about: 'La placa con la que empieza casi todo el mundo. Chip emulado de verdad: el programa en C++ se compila y corre instrucción a instrucción.' },
  nano: { family: 'arduino', name: 'Arduino Nano', chip: 'ATmega328P', tag: 'wokwi-arduino-nano', engine: 'avr', flavor: 'cpp', lang: 'cpp', vcc: 5, tol5: true, extraPins: ['A6', 'A7'],
    power: { '5V': 5, '3.3V': 3.3, VIN: 5, 'GND.1': 0, 'GND.2': 0, 'GND.3': 0, '5V.2': 5 }, led: { pin: '13', prop: 'led13', extra: { ledPower: true } },
    roles: { led: '13', sem: ['12', '11', '10'], btn: '2', adc: 'A0', pwm: '9', buzz: '8', trig: '3', echo: '2', lcd: ['12', '11', '5', '4', '3', '2'], gnd: 'GND.1', vcc: '5V', v5: '5V' }, place: [0, 60], px: 230,
    about: 'El mismo chip que el Uno en pequeñito, para pinchar en la protoboard. Mismo código.' },

  /* ── Raspberry Pi Pico y RP2040 (chip emulado, MicroPython) ── */
  pico: { family: 'rp2040', name: 'Raspberry Pi Pico', chip: 'RP2040', tag: 'wokwi-pi-pico', engine: 'pico', flavor: 'mpy', lang: 'python', vcc: 3.3,
    io: PICO_IO, adc: ['GP26', 'GP27', 'GP28'], power: { '3V3': 3.3, VBUS: 5, VSYS: 5, ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(i => ['GND.' + i, 0])) },
    led: { key: 'GP25', prop: 'led25' }, num: s => s.replace('GP', ''),
    roles: { led: 'GP15', out2: 'GP14', out3: 'GP13', btn: 'GP14', adc: 'GP26', trig: 'GP3', echo: 'GP2', lcd: ['GP16', 'GP17', 'GP18', 'GP19', 'GP20', 'GP21'], gnd: 'GND.4', vcc: '3V3', v5: 'VBUS' }, place: [40, 20], px: 200,
    about: 'Chip RP2040 emulado de verdad, con el MicroPython oficial dentro. Todo funciona aquí mismo, sin instalar nada.' },
  picow: { family: 'rp2040', name: 'Raspberry Pi Pico W', chip: 'RP2040 + CYW43', tag: 'board-pi-pico-w', art: 'pico-w', engine: 'pico', flavor: 'mpy', lang: 'python', vcc: 3.3,
    io: [...PICO_IO.filter(x => x[0] !== 'GP25')], internal: [['LED', 'GP25']], adc: ['GP26', 'GP27', 'GP28'], power: { '3V3': 3.3, VBUS: 5, VSYS: 5, ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(i => ['GND.' + i, 0])) },
    led: { key: 'LED' }, num: s => s.replace('GP', ''),
    roles: { led: 'GP15', out2: 'GP14', out3: 'GP13', btn: 'GP14', adc: 'GP26', trig: 'GP3', echo: 'GP2', lcd: ['GP16', 'GP17', 'GP18', 'GP19', 'GP20', 'GP21'], gnd: 'GND.4', vcc: '3V3', v5: 'VBUS' }, place: [40, 20], px: 200,
    note: 'El RP2040 es el emulado de siempre. La WiFi (chip CYW43) no se simula: aquí el LED de la placa responde a Pin("LED"), como en la de verdad.',
    about: 'La Pico con WiFi. El LED de la placa se llama Pin("LED").' },
  nanorp: { family: 'rp2040', name: 'Arduino Nano RP2040 Connect', chip: 'RP2040', tag: 'wokwi-nano-rp2040-connect', engine: 'pico', flavor: 'mpy', lang: 'python', vcc: 3.3,
    io: [['1', 'RX'], ['0', 'TX'], ['25', 'D2'], ['15', 'D3'], ['16', 'D4'], ['17', 'D5'], ['18', 'D6'], ['19', 'D7'], ['20', 'D8'], ['21', 'D9'], ['5', 'D10'], ['7', 'D11'], ['4', 'D12'], ['6', 'D13'], ['26', 'A0'], ['27', 'A1'], ['28', 'A2'], ['29', 'A3'], ['12', 'A4'], ['13', 'A5']],
    gpKey: k => 'GP' + k, adc: ['26', '27', '28', '29'], power: { '3.3V': 3.3, '5V': 5, VIN: 5, 'GND.1': 0, 'GND.2': 0 }, led: { key: '6', prop: 'ledBuiltIn', extra: { ledPower: true } },
    roles: { led: 'D3', out2: 'D4', out3: 'D5', btn: 'D6', adc: 'A0', trig: 'D7', echo: 'D8', lcd: ['D12', 'D11', 'D5', 'D4', 'D3', 'D2'], gnd: 'GND.1', vcc: '3.3V', v5: 'VIN' }, place: [0, 60], px: 230,
    about: 'RP2040 en formato Nano. En MicroPython los pines se llaman por su GPIO (D13 = Pin(6)).' },

  /* ── ESP32 (simulado a nivel MicroPython) ── */
  esp32: { family: 'esp32', name: 'ESP32 DevKit V1', i2c: { 0: ['18', '19'], 1: ['25', '26'] }, chip: 'ESP32', tag: 'board-esp32-devkit-v1', art: 'esp32', engine: 'shim', flavor: 'esp32', lang: 'python', vcc: 3.3,
    io: [...num([34, 35, 32, 33, 25, 26, 27, 14, 12, 13, 15, 2, 4, 16, 17, 5, 18, 19, 21, 22, 23]), ['36', 'VP'], ['39', 'VN']], inputOnly: ['34', '35', '36', '39'],
    adc: ['32', '33', '34', '35', '36', '39', '0', '2', '4', '12', '13', '14', '15', '25', '26', '27'], power: { '3V3': 3.3, VIN: 5, GND: 0, GND2: 0 }, led: { key: '2' },
    roles: { led: '18', out2: '19', out3: '21', btn: '4', adc: '34', trig: '5', echo: '17', lcd: ['23', '22', '21', '19', '18', '5'], gnd: 'GND2', vcc: '3V3', v5: 'VIN' }, place: [30, 20], px: 230,
    about: 'El ESP32 clásico de 30 pines. LED azul en el GPIO2. Los pines 34, 35, 36 y 39 solo sirven de entrada.' },
  esp32c4: { i2c: { 0: ['18', '19'], 1: ['25', '26'] }, family: 'esp32', name: 'ESP32 DevKitC V4', chip: 'ESP32-WROOM-32', tag: 'board-esp32-devkit-c-v4', art: 'esp32-devkit-c-v4', engine: 'shim', flavor: 'esp32', lang: 'python', vcc: 3.3,
    io: [...num([34, 35, 32, 33, 25, 26, 27, 14, 12, 13, 23, 22, 21, 19, 18, 5, 17, 16, 4, 0, 2, 15]), ['36', 'VP'], ['39', 'VN']], inputOnly: ['34', '35', '36', '39'],
    adc: ['32', '33', '34', '35', '36', '39', '0', '2', '4', '12', '13', '14', '15', '25', '26', '27'], power: { '3V3': 3.3, '5V': 5, 'GND.1': 0, 'GND.2': 0, 'GND.3': 0 },
    roles: { led: '18', out2: '19', out3: '21', btn: '4', adc: '34', trig: '5', echo: '17', lcd: ['23', '22', '21', '19', '18', '5'], gnd: 'GND.2', vcc: '3V3', v5: '5V' }, place: [30, 20], px: 230,
    about: 'La placa de referencia de Espressif. No trae LED para programar: pon uno tú.' },
  esp32s3: { i2c: { 0: ['9', '8'] }, family: 'esp32', name: 'ESP32-S3 DevKitC-1', chip: 'ESP32-S3', tag: 'board-esp32-s3-devkitc-1', art: 'esp32-s3', engine: 'shim', flavor: 'esp32', lang: 'python', vcc: 3.3,
    io: num([4, 5, 6, 7, 15, 16, 17, 18, 8, 3, 46, 9, 10, 11, 12, 13, 14, 1, 2, 42, 41, 40, 39, 38, 0, 45, 48, 47, 21]), adc: num([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]).map(x => x[0]),
    power: { '3V3.1': 3.3, '3V3.2': 3.3, '5V': 5, 'GND.1': 0, 'GND.2': 0, 'GND.3': 0, 'GND.4': 0 }, rgb: '48',
    roles: { led: '41', out2: '40', out3: '39', btn: '42', adc: '1', trig: '38', echo: '47', lcd: ['21', '47', '45', '0', '38', '39'], gnd: 'GND.3', vcc: '3V3.1', v5: '5V' }, place: [30, 20], px: 220,
    note: 'Los GPIO 35-37 (memoria PSRAM en muchos módulos) y 19-20 (USB) no se ofrecen. El LED RGB de la placa es un NeoPixel en el GPIO48: neopixel.NeoPixel(Pin(48), 1).',
    about: 'ESP32-S3 con USB nativo y LED RGB (NeoPixel en el GPIO48). Pensado para IA en el borde.' },
  esp32c3: { i2c: { 0: ['9', '8'] }, family: 'esp32', name: 'ESP32-C3 DevKitM-1', chip: 'ESP32-C3 (RISC-V)', tag: 'board-esp32-c3-devkitm-1', art: 'esp32-c3', engine: 'shim', flavor: 'esp32', lang: 'python', vcc: 3.3,
    io: [...num([2, 3, 0, 1, 10, 19, 18, 4, 5, 6, 7, 8, 9]), ['20', 'RX'], ['21', 'TX']], adc: ['0', '1', '2', '3', '4'], rgb: '8',
    power: { '3V3.1': 3.3, '3V3.2': 3.3, '5V.1': 5, '5V.2': 5, ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => ['GND.' + i, 0])) },
    roles: { led: '7', out2: '6', out3: '5', btn: '9', adc: '4', trig: '18', echo: '19', lcd: ['19', '18', '7', '6', '5', '4'], gnd: 'GND.6', vcc: '3V3.1', v5: '5V.1' }, place: [30, 30], px: 220,
    about: 'ESP32 pequeño con núcleo RISC-V. LED RGB NeoPixel en el GPIO8.' },
  c3mini: { i2c: { 0: ['9', '8'] }, family: 'esp32', name: 'ESP32-C3 SuperMini', chip: 'ESP32-C3 (RISC-V)', tag: 'board-esp32-c3-supermini', art: 'aitewinrobot-esp32c3-supermini', engine: 'shim', flavor: 'esp32', lang: 'python', vcc: 3.3,
    io: [...num([5, 6, 7, 8, 9, 10, 4, 3, 2, 1, 0]), ['20', 'RX'], ['21', 'TX']], adc: ['0', '1', '2', '3', '4'], power: { '5V': 5, GND: 0, '3V3': 3.3 }, led: { key: '8', low: true },
    roles: { led: '4', out2: '3', out3: '2', btn: '1', adc: '0', trig: '3', echo: '2', lcd: ['4', '3', '2', '1', '0', '10'], gnd: 'GND', vcc: '3V3', v5: '5V' }, place: [40, 40], px: 170,
    about: 'Diminuta y baratísima. LED azul en el GPIO8 (se enciende con 0).' },
  xiaoc3: { i2c: { 0: ['7', '6'] }, family: 'esp32', name: 'Seeed XIAO ESP32-C3', chip: 'ESP32-C3 (RISC-V)', tag: 'board-xiao-esp32-c3', art: 'xiao-esp32-c3', engine: 'shim', flavor: 'esp32', lang: 'python', vcc: 3.3,
    io: [['2', 'D0'], ['3', 'D1'], ['4', 'D2'], ['5', 'D3'], ['6', 'D4'], ['7', 'D5'], ['21', 'D6'], ['20', 'D7'], ['8', 'D8'], ['9', 'D9'], ['10', 'D10']], adc: ['2', '3', '4'], power: { '3V3': 3.3, '5V': 5, GND: 0 },
    roles: { led: 'D10', out2: 'D9', out3: 'D8', btn: 'D7', adc: 'D0', trig: 'D9', echo: 'D8', lcd: ['D10', 'D9', 'D8', 'D7', 'D6', 'D5'], gnd: 'GND', vcc: '3V3', v5: '5V' }, place: [40, 40], px: 170,
    note: 'En MicroPython los pines van por GPIO: D0 es Pin(2), D10 es Pin(10). Sin LED para el usuario.',
    about: 'Del tamaño de un sello. En el código, los pines por su número de GPIO (D10 = Pin(10)).' },
  xiaos3: { i2c: { 0: ['6', '5'] }, family: 'esp32', name: 'Seeed XIAO ESP32-S3', chip: 'ESP32-S3', tag: 'board-xiao-esp32-s3', art: 'xiao-esp32-s3', engine: 'shim', flavor: 'esp32', lang: 'python', vcc: 3.3,
    io: [['1', 'D0'], ['2', 'D1'], ['3', 'D2'], ['4', 'D3'], ['5', 'D4'], ['6', 'D5'], ['43', 'D6'], ['44', 'D7'], ['7', 'D8'], ['8', 'D9'], ['9', 'D10'], ['21', null]], adc: num([1, 2, 3, 4, 5, 6, 7, 8, 9]).map(x => x[0]),
    power: { '3V3': 3.3, '5V': 5, GND: 0 }, led: { key: '21', low: true },
    roles: { led: 'D10', out2: 'D9', out3: 'D8', btn: 'D7', adc: 'D0', trig: 'D9', echo: 'D8', lcd: ['D10', 'D9', 'D8', 'D7', 'D6', 'D5'], gnd: 'GND', vcc: '3V3', v5: '5V' }, place: [40, 40], px: 170,
    about: 'XIAO con S3 y LED naranja en el GPIO21 (se enciende con 0).' },
  lolin32: { i2c: { 0: ['18', '19'], 1: ['25', '26'] }, family: 'esp32', name: 'Wemos Lolin32 Lite', chip: 'ESP32', tag: 'board-lolin32-lite', art: 'wemos-lolin32-lite', engine: 'shim', flavor: 'esp32', lang: 'python', vcc: 3.3,
    io: [...[34, 35, 32, 33, 25, 26, 27, 14, 12, 13, 15, 2, 0, 4, 16, 17, 5, 18, 23, 19, 22].map(n => [String(n), 'GPIO' + n]), ['36', 'VP'], ['39', 'VN']], inputOnly: ['34', '35', '36', '39'],
    adc: ['32', '33', '34', '35', '36', '39', '0', '2', '4', '12', '13', '14', '15', '25', '26', '27'], power: { '3V': 3.3, GND: 0 }, led: { key: '22', low: true },
    roles: { led: 'GPIO18', out2: 'GPIO23', out3: 'GPIO19', btn: 'GPIO4', adc: 'GPIO34', trig: 'GPIO5', echo: 'GPIO17', lcd: ['GPIO23', 'GPIO19', 'GPIO18', 'GPIO5', 'GPIO17', 'GPIO16'], gnd: 'GND', vcc: '3V', v5: '3V' }, place: [30, 20], px: 210,
    about: 'ESP32 con cargador de batería LiPo. LED en el GPIO22 (se enciende con 0).' },
  nanoesp32: { i2c: { 0: ['12', '11'] }, family: 'esp32', name: 'Arduino Nano ESP32', chip: 'ESP32-S3', tag: 'board-nano-esp32', art: 'arduino-nano-esp32', engine: 'shim', flavor: 'esp32', lang: 'python', vcc: 3.3,
    io: [['47', 'D12'], ['38', 'D11'], ['21', 'D10'], ['18', 'D9'], ['17', 'D8'], ['10', 'D7'], ['9', 'D6'], ['8', 'D5'], ['7', 'D4'], ['6', 'D3'], ['5', 'D2'], ['44', 'RX0'], ['43', 'TX1'], ['48', 'D13'], ['46', 'B0'], ['1', 'A0'], ['2', 'A1'], ['3', 'A2'], ['4', 'A3'], ['11', 'A4'], ['12', 'A5'], ['13', 'A6'], ['14', 'A7'], ['0', 'B1'], ['45', null]],
    adc: ['1', '2', '3', '4', '11', '12', '13', '14'], power: { '3V3': 3.3, VBUS: 5, VIN: 5, 'GND.1': 0, 'GND.2': 0 }, led: { key: '48' }, rgbPins: { r: '46', g: '0', b: '45', low: true },
    roles: { led: 'D9', out2: 'D8', out3: 'D7', btn: 'D6', adc: 'A0', trig: 'D5', echo: 'D4', lcd: ['D12', 'D11', 'D5', 'D4', 'D3', 'D2'], gnd: 'GND.2', vcc: '3V3', v5: 'VBUS' }, place: [0, 70], px: 240,
    note: 'Con el MicroPython de Arduino los pines van por GPIO: D13 (LED) es Pin(48). El LED RGB va en los GPIO 46, 0 y 45 y se enciende con 0.',
    about: 'Formato Nano con ESP32-S3. LED en D13 (GPIO48) y LED RGB.' },
  esp32cam: { i2c: { 0: ['14', '15'] }, family: 'esp32', name: 'ESP32-CAM', chip: 'ESP32', tag: 'board-esp32-cam', art: 'esp32-cam', engine: 'shim', flavor: 'esp32', lang: 'python', vcc: 3.3,
    io: [...num([12, 13, 15, 14, 2, 4, 16, 0]), ['33', null]], adc: ['2', '4', '12', '13', '14', '15'], power: { '5V.1': 5, '3V3': 3.3, VCC: 3.3, 'GND.1': 0, 'GND.2': 0, 'GND.3': 0 },
    led: { key: '33', low: true, id: 'led' }, flash: '4',
    roles: { led: '13', out2: '12', out3: '15', btn: '14', adc: '2', trig: '15', echo: '14', lcd: ['12', '13', '15', '14', '2', '16'], gnd: 'GND.1', vcc: '3V3', v5: '5V.1' }, place: [30, 30], px: 200,
    note: 'La cámara no se simula. El flash es el GPIO4 y el LED rojo de atrás el GPIO33 (se enciende con 0).',
    about: 'ESP32 con cámara. Aquí: el flash (GPIO4) y el LED rojo (GPIO33).' },
  esp32c6: { i2c: { 0: ['7', '6'] }, family: 'esp32', name: 'ESP32-C6 DevKitC-1', chip: 'ESP32-C6 (RISC-V)', tag: 'board-esp32-c6-devkitc-1', engine: 'shim', flavor: 'esp32', lang: 'python', vcc: 3.3,
    drawn: twoCols({ label: 'ESP32-C6', chip: 'C6', color: '#1b1b1b', w: 112, left: ['3V3', 'RST', '4', '5', '6', '7', '0', '1', '8', '10', '11', '2', '3', '5V', 'GND.1'], right: ['GND.2', 'TX', 'RX', '15', '23', '22', '21', '20', '19', '18', '9', 'GND.3', '13', '12', 'GND.4'], leds: { rgb: { x: 56, y: 140, size: 7 } } }),
    io: [...num([4, 5, 6, 7, 0, 1, 8, 10, 11, 2, 3, 15, 23, 22, 21, 20, 19, 18, 9, 13, 12]), ['16', 'TX'], ['17', 'RX']], adc: ['0', '1', '2', '3', '4', '5', '6'], rgb: '8',
    power: { '3V3': 3.3, '5V': 5, 'GND.1': 0, 'GND.2': 0, 'GND.3': 0, 'GND.4': 0 },
    roles: { led: '23', out2: '22', out3: '21', btn: '20', adc: '6', trig: '19', echo: '18', lcd: ['23', '22', '21', '20', '19', '18'], gnd: 'GND.2', vcc: '3V3', v5: '5V' }, place: [30, 20], px: 210,
    about: 'El ESP32 con WiFi 6, Thread y Zigbee. LED RGB NeoPixel en el GPIO8.' },

  /* ── STM32 (simulado a nivel MicroPython: machine + pyb) ── */
  bluepill: { i2c: { 1: ['PB6', 'PB7'] }, family: 'stm32', name: 'STM32 Blue Pill', chip: 'STM32F103C8', tag: 'board-stm32-bluepill', art: 'stm32-bluepill', engine: 'shim', flavor: 'stm32', lang: 'python', vcc: 3.3, tol5: true,
    io: num(['PB12', 'PB13', 'PB14', 'PB15', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA15', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'PB8', 'PB9', 'PB11', 'PB10', 'PB1', 'PB0', 'PA7', 'PA6', 'PA5', 'PA4', 'PA3', 'PA2', 'PA1', 'PA0', 'PC13']),
    adc: ['PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB0', 'PB1'], power: { '5V': 5, '3V3.1': 3.3, '3V3.2': 3.3, 'GND.1': 0, 'GND.2': 0, 'GND.3': 0 }, led: { key: 'PC13', low: true },
    tim: { PA6: [3, 1], PA7: [3, 2], PB6: [4, 1], PB7: [4, 2], PB8: [4, 3], PB9: [4, 4], PA8: [1, 1], PA0: [2, 1], PA1: [2, 2], PB0: [3, 3], PB1: [3, 4] },
    roles: { led: 'PA6', out2: 'PA5', out3: 'PA4', btn: 'PB1', adc: 'PA0', trig: 'PB11', echo: 'PB10', lcd: ['PB11', 'PB10', 'PB1', 'PB0', 'PA7', 'PA5'], gnd: 'GND.2', vcc: '3V3.2', v5: '5V' }, place: [30, 20], px: 200,
    note: 'Ojo: el F103C8 se queda corto de memoria para el MicroPython oficial; en la vida real se programa en C (STM32CubeIDE) o con el núcleo Arduino STM32. Aquí lo pruebas en MicroPython. PC14 y PC15 (cristal de 32 kHz) no se ofrecen.',
    about: 'El STM32 baratísimo de toda la vida (F103). LED en PC13, se enciende con 0. Muchas patas aguantan 5 V.' },
  blackpill: { i2c: { 1: ['PB6', 'PB7'] }, family: 'stm32', name: 'STM32 Black Pill', chip: 'STM32F411CE', tag: 'board-stm32-blackpill', art: 'stm32-blackpill', engine: 'shim', flavor: 'stm32', lang: 'python', vcc: 3.3, tol5: true,
    io: num(['PC13', 'PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB0', 'PB1', 'PB2', 'PB10', 'PB9', 'PB8', 'PB7', 'PB6', 'PB5', 'PB4', 'PB3', 'PA15', 'PA12', 'PA11', 'PA10', 'PA9', 'PA8', 'PB15', 'PB14', 'PB13', 'PB12']),
    adc: ['PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB0', 'PB1'], power: { '3V3.1': 3.3, '3V3.2': 3.3, '5V.1': 5, '5V.2': 5, 'GND.1': 0, 'GND.2': 0 }, led: { key: 'PC13', low: true },
    tim: { PB6: [4, 1], PB7: [4, 2], PB8: [4, 3], PB9: [4, 4], PA8: [1, 1], PA0: [2, 1], PA1: [2, 2], PA6: [3, 1], PA7: [3, 2] },
    roles: { led: 'PB6', out2: 'PB7', out3: 'PB8', btn: 'PB9', adc: 'PA1', trig: 'PB5', echo: 'PB4', lcd: ['PB15', 'PB14', 'PB13', 'PB12', 'PA8', 'PA9'], gnd: 'GND.1', vcc: '3V3.1', v5: '5V.1' }, place: [30, 20], px: 200,
    note: 'Tiene MicroPython oficial (placa WEACT_F411_BLACKPILL). PC14 y PC15 no se ofrecen.',
    about: 'STM32F411 de WeAct: más potente que la Blue Pill y con MicroPython oficial. LED en PC13 (con 0).' },
  nucleo: { i2c: { 1: ['PB8', 'PB9'] }, family: 'stm32', name: 'ST Nucleo-64 F411RE', chip: 'STM32F411RE', tag: 'board-st-nucleo-f411re', engine: 'shim', flavor: 'stm32', lang: 'python', vcc: 3.3, tol5: true,
    drawn: twoCols({ label: 'NUCLEO-F411RE', chip: 'STM32F411', color: '#f4f4f0', w: 132, left: ['IOREF', 'RESET', '3V3', '5V', 'GND.1', 'GND.2', 'VIN', null, 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'], right: ['D15', 'D14', 'AREF', 'GND.3', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'], leds: { led: { x: 100, y: 22, size: 6, color: '#3cf05a' } } }),
    io: [['PA3', 'D0'], ['PA2', 'D1'], ['PA10', 'D2'], ['PB3', 'D3'], ['PB5', 'D4'], ['PB4', 'D5'], ['PB10', 'D6'], ['PA8', 'D7'], ['PA9', 'D8'], ['PC7', 'D9'], ['PB6', 'D10'], ['PA7', 'D11'], ['PA6', 'D12'], ['PA5', 'D13'], ['PB9', 'D14'], ['PB8', 'D15'], ['PA0', 'A0'], ['PA1', 'A1'], ['PA4', 'A2'], ['PB0', 'A3'], ['PC1', 'A4'], ['PC0', 'A5'], ['PC13', null]],
    alias: { D0: 'PA3', D1: 'PA2', D2: 'PA10', D3: 'PB3', D4: 'PB5', D5: 'PB4', D6: 'PB10', D7: 'PA8', D8: 'PA9', D9: 'PC7', D10: 'PB6', D11: 'PA7', D12: 'PA6', D13: 'PA5', D14: 'PB9', D15: 'PB8', A0: 'PA0', A1: 'PA1', A2: 'PA4', A3: 'PB0', A4: 'PC1', A5: 'PC0', LED: 'PA5', SW: 'PC13' },
    adc: ['PA0', 'PA1', 'PA4', 'PB0', 'PC1', 'PC0', 'PA5', 'PA6', 'PA7'], power: { '3V3': 3.3, '5V': 5, VIN: 5, IOREF: 3.3, 'GND.1': 0, 'GND.2': 0, 'GND.3': 0 }, led: { key: 'PA5' }, sw: 'PC13',
    tim: { PC7: [3, 2], PB6: [4, 1], PB4: [3, 1], PB3: [2, 2], PB10: [2, 3], PA8: [1, 1], PA7: [3, 2] }, codeName: true,
    roles: { led: 'D9', out2: 'D8', out3: 'D7', btn: 'D2', adc: 'A0', trig: 'D4', echo: 'D5', lcd: ['D12', 'D11', 'D5', 'D4', 'D3', 'D2'], gnd: 'GND.3', vcc: '3V3', v5: '5V' }, place: [30, 20], px: 230,
    note: 'Conectores tipo Arduino (D0-D15, A0-A5); en MicroPython valen los dos nombres: Pin("D13") o Pin("PA5"). El LED LD2 está en D13/PA5.',
    about: 'La placa de desarrollo de ST para la industria, con conectores tipo Arduino. MicroPython oficial.' },
  pyboard: { i2c: { 1: ['PB6', 'PB7'], 2: ['PB10', 'PB11'] }, family: 'stm32', name: 'Pyboard v1.1', chip: 'STM32F405RG', tag: 'board-pyboard-v11', engine: 'shim', flavor: 'stm32', lang: 'python', vcc: 3.3, tol5: true,
    drawn: twoCols({ label: 'PYBv1.1', chip: 'STM32F405', color: '#2a2a2a', w: 112, left: ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8', 'X9', 'X10', 'X11', 'X12', '3V3', 'GND.1'], right: ['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'VIN', 'GND.2'],
      leds: { led1: { x: 40, y: 150, size: 5, color: '#ff3030' }, led2: { x: 50, y: 150, size: 5, color: '#30ff50' }, led3: { x: 60, y: 150, size: 5, color: '#ffd030' }, led4: { x: 70, y: 150, size: 5, color: '#3080ff' } } }),
    io: [['PA0', 'X1'], ['PA1', 'X2'], ['PA2', 'X3'], ['PA3', 'X4'], ['PA4', 'X5'], ['PA5', 'X6'], ['PA6', 'X7'], ['PA7', 'X8'], ['PB6', 'X9'], ['PB7', 'X10'], ['PC4', 'X11'], ['PC5', 'X12'], ['PC6', 'Y1'], ['PC7', 'Y2'], ['PB8', 'Y3'], ['PB9', 'Y4'], ['PB12', 'Y5'], ['PB13', 'Y6'], ['PB14', 'Y7'], ['PB15', 'Y8'], ['PB10', 'Y9'], ['PB11', 'Y10'], ['PB0', 'Y11'], ['PB1', 'Y12'], ['PA13', null], ['PA14', null], ['PA15', null], ['PB4', null], ['PB3', null]],
    alias: Object.fromEntries([['X1', 'PA0'], ['X2', 'PA1'], ['X3', 'PA2'], ['X4', 'PA3'], ['X5', 'PA4'], ['X6', 'PA5'], ['X7', 'PA6'], ['X8', 'PA7'], ['X9', 'PB6'], ['X10', 'PB7'], ['X11', 'PC4'], ['X12', 'PC5'], ['Y1', 'PC6'], ['Y2', 'PC7'], ['Y3', 'PB8'], ['Y4', 'PB9'], ['Y5', 'PB12'], ['Y6', 'PB13'], ['Y7', 'PB14'], ['Y8', 'PB15'], ['Y9', 'PB10'], ['Y10', 'PB11'], ['Y11', 'PB0'], ['Y12', 'PB1'], ['LED_RED', 'PA13'], ['LED_GREEN', 'PA14'], ['LED_YELLOW', 'PA15'], ['LED_BLUE', 'PB4'], ['SW', 'PB3']]),
    adc: ['PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PC4', 'PC5', 'PB0', 'PB1'], power: { '3V3': 3.3, VIN: 5, 'GND.1': 0, 'GND.2': 0 },
    leds: [['led1', 'PA13'], ['led2', 'PA14'], ['led3', 'PA15'], ['led4', 'PB4']], sw: 'PB3', pybLeds: ['PA13', 'PA14', 'PA15', 'PB4'], servos: ['PA0', 'PA1', 'PA2', 'PA3'],
    tim: { PB9: [4, 4], PB8: [4, 3], PB6: [4, 1], PB7: [4, 2], PC6: [8, 1], PC7: [8, 2], PA0: [2, 1], PA1: [2, 2], PA2: [2, 3], PA3: [2, 4] }, codeName: true,
    roles: { led: 'Y4', out2: 'Y5', out3: 'Y6', btn: 'Y7', adc: 'X1', trig: 'Y9', echo: 'Y10', lcd: ['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6'], gnd: 'GND.2', vcc: '3V3', v5: 'VIN' }, place: [30, 20], px: 210,
    note: 'La placa original de MicroPython. Cuatro LEDs (pyb.LED(1) a pyb.LED(4)) y el botón USR (pyb.Switch()).',
    about: 'La placa con la que nació MicroPython (módulo pyb): 4 LEDs, botón USR y pines X/Y.' },

  /* ── Robótica y Linux (simulado a nivel Python: librerías GPIO) ── */
  rpi4: { i2c: { 1: ['5', '3'] }, family: 'linux', name: 'Raspberry Pi 4', chip: 'BCM2711', tag: 'board-rpi4', engine: 'shim', flavor: 'linux', lib: 'RPi.GPIO', lang: 'python', vcc: 3.3, labels: RPI_LABEL,
    drawn: sbc({ label: 'Raspberry Pi 4', chip: 'BCM2711', color: '#1d7a3f' }), io: H40(), power: h40pow(), model: 'Raspberry Pi 4 Model B',
    roles: { led: '12', out2: '16', out3: '18', btn: '22', trig: '16', echo: '18', lcd: ['26', '24', '22', '18', '16', '12'], gnd: '14', vcc: '1', v5: '2' }, place: [0, 0], px: 0, py: 240,
    note: 'Sin entradas analógicas (como la de verdad: para eso hace falta un ADC externo). RPi.GPIO admite la numeración física (BOARD) y la BCM.',
    about: 'El ordenador de placa más conocido. Python con RPi.GPIO; los ejemplos usan la numeración física (BOARD).' },
  rpi5: { i2c: { 1: ['5', '3'] }, family: 'linux', name: 'Raspberry Pi 5', chip: 'BCM2712 + RP1', tag: 'board-rpi5', engine: 'shim', flavor: 'linux', lib: 'gpiozero', lang: 'python', vcc: 3.3, labels: RPI_LABEL,
    drawn: sbc({ label: 'Raspberry Pi 5', chip: 'BCM2712', color: '#1a6e38' }), io: H40(), power: h40pow(), model: 'Raspberry Pi 5 Model B',
    roles: { led: '12', out2: '16', out3: '18', btn: '22', trig: '16', echo: '18', lcd: ['26', '24', '22', '18', '16', '12'], gnd: '14', vcc: '1', v5: '2' }, place: [0, 0], px: 0, py: 240,
    note: 'En la Pi 5 el RPi.GPIO clásico ya no va (los pines cuelgan del chip RP1): se usa gpiozero, que numera por BCM (GPIO18 = pin físico 12). También vale «import RPi.GPIO» como si tuvieras rpi-lgpio.',
    about: 'La Pi más rápida. Se programa con gpiozero, que llama a los pines por su número BCM.' },
  rdkx3: { i2c: { 1: ['5', '3'] }, family: 'linux', name: 'RDK X3', chip: 'Sunrise X3 (BPU 5 TOPS)', tag: 'board-rdk-x3', engine: 'shim', flavor: 'linux', lib: 'Hobot.GPIO', lang: 'python', vcc: 3.3, labels: RPI_LABEL, pwmPins: ['32', '33'],
    drawn: sbc({ label: 'RDK X3', chip: 'X3 · BPU', color: '#202a36' }), io: H40(), power: h40pow(), model: 'RDK_X3',
    roles: { led: '32', out2: '16', out3: '18', btn: '22', trig: '16', echo: '18', lcd: ['26', '24', '22', '18', '16', '12'], gnd: '14', vcc: '1', v5: '2' }, place: [0, 0], px: 0, py: 240,
    note: 'Hobot.GPIO es como RPi.GPIO, con una diferencia que el simulador respeta: el PWM solo existe en los pines 32 y 33 (no hay PWM por software). La tensión máxima de los pines es 3,3 V.',
    about: 'Placa de robótica de D-Robotics con acelerador de IA. Python con Hobot.GPIO; PWM solo en los pines 32 y 33.' },
  rdkx5: { i2c: { 1: ['5', '3'] }, family: 'linux', name: 'RDK X5', chip: 'Sunrise X5 (BPU 10 TOPS)', tag: 'board-rdk-x5', engine: 'shim', flavor: 'linux', lib: 'Hobot.GPIO', lang: 'python', vcc: 3.3, labels: RPI_LABEL, pwmPins: ['32', '33'],
    drawn: sbc({ label: 'RDK X5', chip: 'X5 · BPU', color: '#22262e', w: 378, h: 280, ports: 'x5' }), io: H40(), power: h40pow(), model: 'RDK_X5',
    roles: { led: '32', out2: '16', out3: '18', btn: '22', trig: '16', echo: '18', lcd: ['26', '24', '22', '18', '16', '12'], gnd: '14', vcc: '1', v5: '2' }, place: [0, 0], px: 0, py: 300,
    note: 'Como en la X3, el PWM de Hobot.GPIO va por hardware; aquí se ofrece en los pines 32 y 33 (en la placa real se pueden activar más grupos con srpi-config).',
    about: 'La sucesora de la X3: más IA (10 TOPS), mismo Hobot.GPIO y cabecera de 40 pines.' },
  jetson: { i2c: { 1: ['5', '3'] }, family: 'linux', name: 'Jetson Orin Nano', chip: 'NVIDIA Orin', tag: 'board-jetson-orin-nano', engine: 'shim', flavor: 'linux', lib: 'Jetson.GPIO', lang: 'python', vcc: 3.3, labels: RPI_LABEL, pwmPins: ['15', '32', '33'],
    drawn: sbc({ label: 'Jetson Orin Nano', chip: 'ORIN', color: '#1e2a1c', w: 378, h: 299, ports: 'x5' }), io: H40(), power: h40pow(), model: 'JETSON_ORIN_NANO',
    roles: { led: '32', out2: '16', out3: '18', btn: '22', trig: '16', echo: '18', lcd: ['26', '24', '22', '18', '16', '12'], gnd: '14', vcc: '1', v5: '2' }, place: [0, 0], px: 0, py: 320,
    note: 'Jetson.GPIO copia la API de RPi.GPIO. PWM por hardware en los pines 15, 32 y 33 (en la real hay que activarlos con jetson-io).',
    about: 'La placa de NVIDIA para robots con visión. Python con Jetson.GPIO (igual que RPi.GPIO).' },
  kickpi: { i2c: { 1: ['5', '3'] }, family: 'linux', name: 'KickPi K1', chip: 'Rockchip RK3568', tag: 'board-kickpi-k1', engine: 'shim', flavor: 'linux', lib: 'wiringpi', lang: 'python', vcc: 3.3,
    drawn: sbc({ label: 'KickPi K1', chip: 'RK3568', color: '#173a5e', w: 360, h: 240, ports: 'x5' }), io: H40(), power: h40pow(), model: 'KICKPI_K1',
    roles: { led: '12', out2: '16', out3: '18', btn: '22', trig: '16', echo: '18', lcd: ['26', '24', '22', '18', '16', '12'], gnd: '14', vcc: '1', v5: '2' }, place: [0, 0], px: 0, py: 260,
    note: 'KickPi trae su propio wiringPi (wiringKP, la orden gpio). Aquí los ejemplos usan la numeración física (wiringPiSetupPhys) para no depender de la tabla wPi de cada modelo: compruébala con «gpio readall». La disposición de alimentación (3V3, 5V, GND) es la habitual de 40 pines; mira la hoja de tu KickPi, porque algunos pines pueden ir a 1,8 V.',
    about: 'Placa china con Rockchip RK3568 y cabecera de 40 pines. Python con wiringpi (numeración física en los ejemplos).' },
};
// Arte de cada placa (patillaje y LEDs)
const PICO_ART_PINS = [['GP0', 8, 17], ['GP1', 8, 30], ['GND.1', 8, 42], ['GP2', 8, 55], ['GP3', 8, 68], ['GP4', 8, 81], ['GP5', 8, 93], ['GND.2', 8, 106], ['GP6', 8, 119], ['GP7', 8, 131], ['GP8', 8, 144], ['GP9', 8, 157], ['GND.3', 8, 169], ['GP10', 8, 182], ['GP11', 8, 195], ['GP12', 8, 207], ['GP13', 8, 220], ['GND.4', 8, 233], ['GP14', 8, 246], ['GP15', 8, 258],
  ['GP16', 97, 258], ['GP17', 97, 246], ['GND.5', 97, 233], ['GP18', 97, 220], ['GP19', 97, 207], ['GP20', 97, 195], ['GP21', 97, 182], ['GND.6', 97, 169], ['GP22', 97, 157], ['RUN', 97, 144], ['GP26', 97, 131], ['GP27', 97, 119], ['GND.7', 97, 106], ['GP28', 97, 93], ['ADC_VREF', 97, 81], ['3V3', 97, 68], ['3V3_EN', 97, 55], ['GND.8', 97, 42], ['VSYS', 97, 30], ['VBUS', 97, 17]]
  .map(([name, x, y]) => ({ name, x: +(x * 79 / 105).toFixed(2), y: +(y * 79 / 105).toFixed(2) }));
export const PICO_PINS_ART = PICO_ART_PINS;
export function artOf(b) {
  if (b.drawn) return b.drawn;
  if (b.art === 'pico-w') return { svg: 'taller/art/boards/pi-pico-w.svg', w: 79.37, h: 200.32, pins: PICO_ART_PINS, leds: { led: { x: 25, y: 9, size: 5, color: '#3f3' } } };
  return b.art ? ART[b.art] : null;
}
for (const [k, b] of Object.entries(BOARDS)) { b.key = k; b.id = k; }
export const FAMILIES = [['arduino', '♾ Arduino', 'Chip emulado · C++'], ['rp2040', '🍓 Raspberry Pi Pico', 'Chip emulado · MicroPython'], ['esp32', '📶 ESP32', 'MicroPython'], ['stm32', '🏭 STM32 (industrial)', 'MicroPython'], ['linux', '🤖 Robótica y Linux', 'Python (RPi.GPIO, Hobot.GPIO…)']];
export const boardByType = t => Object.values(BOARDS).find(b => b.tag === t);
// Importar proyectos de Wokwi/Velxio: nombres de placa equivalentes
export const BOARD_ALIAS = { 'wokwi-esp32-devkit-v1': 'board-esp32-devkit-v1', 'velxio-esp32': 'board-esp32-devkit-v1', 'wokwi-pi-pico-w': 'board-pi-pico-w', 'velxio-stm32-bluepill': 'board-stm32-bluepill', 'velxio-stm32-blackpill': 'board-stm32-blackpill', 'board-st-nucleo-f401re': 'board-st-nucleo-f411re' };
export const fileName = b => b.lang === 'cpp' ? 'sketch.ino' : 'main.py';

/* ---------- Pines: qué hay en cada pata ---------- */
// Clase eléctrica de una pata de placa: 'gnd', '3v3', '5v' o null (señal)
export function powerOf(b, pin) { const v = (b.power || {})[pin]; return v == null ? null : v === 0 ? 'gnd' : v > 4 ? '5v' : '3v3'; }
export function pinLabel(b, pin) {
  const pw = (b.power || {})[pin]; if (pw != null) return pw === 0 ? 'GND (−)' : pw > 4 ? `${pin} (+5 V)` : `${pin} (+3,3 V)`;
  if (b.engine === 'avr') return /^A/.test(pin) ? `${pin} (analógica)` : `pin ${pin}`;
  const e = (b.io || []).find(x => x[1] === pin); if (!e) return pin;
  const key = e[0]; const bits = [];
  if (b.flavor === 'linux') { bits.push('pin físico ' + pin); if (b.labels && b.labels[pin]) bits.push(b.labels[pin]); }
  else if (key !== pin) bits.push((b.engine === 'pico' || b.flavor === 'esp32') && /^\d+$/.test(key) ? 'GPIO' + key : key);
  if ((b.adc || []).includes(key)) bits.push('analógica'); if ((b.inputOnly || []).includes(key)) bits.push('solo entrada');
  return `${pin}${bits.length ? ' · ' + bits.join(' · ') : ''}`;
}
// Mapa pata → GPIO del RP2040 emulado (y nombres internos «#clave» para LEDs que no salen a la cabecera)
export function gpMap(b) {
  if (b.engine === 'avr') return null; const map = {}, keys = {}; let n = 0; const used = new Set();
  if (b.engine === 'pico') {
    for (const [key, pin] of b.io || []) { const gp = +(b.gpKey ? b.gpKey(key) : key).replace('GP', ''); keys[key] = gp; if (pin) map[pin] = gp; map['#' + key] = gp; }
    for (const [key, ref] of b.internal || []) { keys[key] = +ref.replace('GP', ''); map['#' + key] = keys[key]; }
    return { map, keys }; }
  for (const [key] of b.io) { if (keys[key] != null) continue; while (used.has(n)) n++; keys[key] = n; used.add(n); n++; }
  for (const [key, pin] of b.io) { if (pin) map[pin] = keys[key]; else map['#' + key] = keys[key]; }
  for (const [key] of b.io) map['#' + key] = keys[key];
  return { map, keys };
}
// Patas de la placa que son entradas/salidas (para la simulación)
export function mcuPins(b) { if (b.engine === 'avr') return null; return (b.io || []).filter(x => x[1]).map(x => x[1]); }
export function analogPins(b) { if (b.engine === 'avr') return ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', ...(b.extraPins || [])]; const s = new Set(b.adc || []); return (b.io || []).filter(x => x[1] && s.has(x[0])).map(x => x[1]); }
export function keyOf(b, pin) { const e = (b.io || []).find(x => x[1] === pin); return e ? e[0] : pin; }

/* ---------- Dibujo: un elemento por placa ---------- */
export function defineBoards() {
  if (typeof customElements === 'undefined') return;
  for (const b of Object.values(BOARDS)) {
    if (b.engine === 'avr' || b.key === 'pico' || b.key === 'nanorp' || customElements.get(b.tag)) continue; const a = artOf(b); if (!a) continue;
    customElements.define(b.tag, class extends HTMLElement {
      constructor() { super(); this.attachShadow({ mode: 'open' }); this._l = {}; }
      connectedCallback() {
        const img = a.svg ? `<img src="${new URL('../../' + a.svg, import.meta.url)}" width="${a.w}" height="${a.h}" draggable="false" alt="${b.name}">` : drawSvg(a);
        const leds = Object.entries(a.leds || {}).map(([id, l]) => `<i data-l="${id}" style="left:${l.x - l.size / 2}px;top:${l.y - l.size / 2}px;width:${l.size}px;height:${l.size}px;--c:${l.color || '#fff'}"></i>`).join('');
        this.shadowRoot.innerHTML = `<style>:host{display:inline-block;line-height:0;position:relative}img,svg{display:block;width:${a.w}px;height:${a.h}px}i{position:absolute;border-radius:50%;background:var(--c);box-shadow:0 0 6px 3px var(--c);opacity:0;transition:opacity .05s;pointer-events:none}</style>${img}${leds}`; this._paint();
        // Si el dibujo no está (hay alojamientos que no sirven los SVG de terceros), lo dibujo yo con las mismas patas
        const im = this.shadowRoot.querySelector('img'); if (im) im.onerror = () => { const t = document.createElement('template'); t.innerHTML = drawSvg({ ...a, draw: { kind: 'cols', label: b.name.replace(/^(Seeed|Wemos|Arduino|STM32|Raspberry Pi) /, ''), color: { esp32: '#1b1b1b', stm32: '#1d3f7a', rp2040: '#1f6b3a' }[b.family] || '#1b1b1b', chip: b.chip.split(' ')[0] } }); im.replaceWith(t.content.firstChild); };
      }
      get pinInfo() { return a.pins; }
      set leds(v) { this._l = v || {}; this._paint(); } get leds() { return this._l; }
      _paint() { if (!this.shadowRoot) return; for (const i of this.shadowRoot.querySelectorAll('i')) { const v = this._l[i.dataset.l]; if (v && typeof v === 'object') { const m = Math.max(v.r, v.g, v.b); i.style.opacity = m > 4 ? 1 : 0; if (m > 4) { const k = 255 / m; i.style.setProperty('--c', `rgb(${v.r * k | 0},${v.g * k | 0},${v.b * k | 0})`); } } else i.style.opacity = v ? 1 : 0; } }
    });
  }
}

/* ---------- La capa de soporte (MicroPython) para las placas «shim» ---------- */
// Se manda delante del programa de la persona. Se puede leer y cambiar en 🔩 Por dentro.
const pyStr = s => JSON.stringify(s);
const pyDict = o => '{' + Object.entries(o).map(([k, v]) => `${pyStr(k)}: ${typeof v === 'string' ? pyStr(v) : v}`).join(', ') + '}';
export function supportCode(b) {
  if (b.engine !== 'shim') return '';
  const { keys } = gpMap(b); const adc = Object.fromEntries((b.adc || []).filter(k => keys[k] != null).map((k, i) => [k, i]));
  const alias = { ...(b.alias || {}) };
  let s = `# ── Soporte de la placa «${b.name}» para el simulador de Plató ──
# Tu programa corre en un RP2040 emulado; esto imita los pines y librerías de la ${b.name}.
# Puedes cambiarlo: lo que escribas aquí se ejecuta antes de tu código.
def _plato():
    import sys, uctypes, machine as _m, time as _t
    from array import array
    NAME = ${pyStr(b.name)}
    M = ${pyDict(keys)}   # pin del código → GPIO del chip simulado
    A = ${pyDict(adc)}   # pines analógicos → canal
    AL = ${pyDict(alias)}
    NO_OUT = ${pyStr(b.inputOnly || [])}
    AV = array('H', [0] * 40)   # valores analógicos y LED RGB, los escribe el simulador
    print('\\x1b]PLATO %d\\x07' % uctypes.addressof(AV))
    class Mod:
        pass
    def key(p):
        if isinstance(p, Pin): return p._k
        k = p.upper() if isinstance(p, str) else str(p)
        return AL.get(k, k)
    def gp(p):
        k = key(p)
        if k not in M: raise ValueError('La %s no tiene el pin %s. Pines: %s' % (NAME, k, ' '.join(sorted(M))))
        return M[k]
    class Pin:
        IN = _m.Pin.IN; OUT = _m.Pin.OUT; OPEN_DRAIN = _m.Pin.OPEN_DRAIN; PULL_UP = _m.Pin.PULL_UP; PULL_DOWN = _m.Pin.PULL_DOWN
        IRQ_RISING = _m.Pin.IRQ_RISING; IRQ_FALLING = _m.Pin.IRQ_FALLING
        OUT_PP = OUT; OUT_OD = OPEN_DRAIN; AF_PP = OUT; ANALOG = IN; PULL_NONE = None
        def __init__(s, id, mode=-1, pull=-1, value=None, **kw):
            s._k = key(id); s._n = gp(id); s._p = _m.Pin(s._n); s.init(mode, pull, value)
        def init(s, mode=-1, pull=-1, value=None, **kw):
            if mode in (s.OUT, s.OPEN_DRAIN) and s._k in NO_OUT: raise ValueError('En la %s el pin %s solo puede ser entrada' % (NAME, s._k))
            a = {}
            if mode != -1: a['mode'] = mode
            if pull != -1: a['pull'] = pull
            if value is not None: a['value'] = value
            if a: s._p.init(**a)
        def value(s, *a): return s._p.value(*a)
        def __call__(s, *a): return s._p.value(*a)
        def on(s): s._p.value(1)
        def off(s): s._p.value(0)
        def high(s): s._p.value(1)
        def low(s): s._p.value(0)
        def toggle(s): s._p.toggle()
        def irq(s, handler=None, trigger=None, **kw):
            h = (lambda p: handler(s)) if handler else None
            return s._p.irq(h) if trigger is None else s._p.irq(h, trigger)
        def name(s): return s._k
        def __repr__(s): return 'Pin(%s)' % s._k
    class ADC:
        ATTN_0DB = 0; ATTN_2_5DB = 1; ATTN_6DB = 2; ATTN_11DB = 3; WIDTH_9BIT = 9; WIDTH_10BIT = 10; WIDTH_11BIT = 11; WIDTH_12BIT = 12
        def __init__(s, p, *a, **kw):
            k = key(p)
            if k not in A: raise ValueError('En la %s el pin %s no es analógico. Analógicos: %s' % (NAME, k, ' '.join(sorted(A))))
            s._i = A[k]; s._b = 12
        def read_u16(s): return AV[s._i]
        def read(s): return AV[s._i] >> (16 - s._b)
        def read_uv(s): return AV[s._i] * 3300000 // 65535
        def atten(s, a): pass
        def width(s, w): s._b = w if w > 8 else 9 + w
    def hz(f): return max(8, int(f))
    class PWM:
        def __init__(s, p, freq=0, duty=None, duty_u16=None, duty_ns=None, **kw):
            s._w = _m.PWM(_m.Pin(p._n if isinstance(p, Pin) else gp(p))); s._w.freq(hz(freq or ${b.flavor === 'esp32' ? 5000 : 1000}))
            if duty is not None: s.duty(duty)
            if duty_u16 is not None: s._w.duty_u16(duty_u16)
            if duty_ns is not None: s._w.duty_ns(duty_ns)
        def freq(s, *a): return s._w.freq(hz(a[0])) if a else s._w.freq()
        def duty(s, *a):
            if not a: return s._w.duty_u16() * 1023 // 65535
            s._w.duty_u16(min(1023, max(0, a[0])) * 65535 // 1023)
        def duty_u16(s, *a): return s._w.duty_u16(*a)
        def duty_ns(s, *a): return s._w.duty_ns(*a)
        def init(s, freq=None, duty=None, **kw):
            if freq: s.freq(freq)
            if duty is not None: s.duty(duty)
        def deinit(s): s._w.deinit()
    class Timer:
        PERIODIC = _m.Timer.PERIODIC; ONE_SHOT = _m.Timer.ONE_SHOT
        def __init__(s, id=-1, **kw):
            s._t = _m.Timer()
            if kw: s.init(**kw)
        def init(s, **kw): s._t.init(**kw)
        def deinit(s): s._t.deinit()
    mm = Mod()
    for k in dir(_m):
        if not k.startswith('__'): setattr(mm, k, getattr(_m, k))
    mm.Pin = Pin; mm.ADC = ADC; mm.PWM = PWM; mm.Timer = Timer
    mm.time_pulse_us = lambda p, *a: _m.time_pulse_us(p._p if isinstance(p, Pin) else _m.Pin(gp(p)), *a)
    # I2C: en el chip simulado va por software (SoftI2C) en las patas que digas; así se ve entero en el analizador
    I2CDEF = ${pyDict(Object.fromEntries(Object.entries(b.i2c || {}).map(([k, v]) => [k, v.join(',')])))}
    def raw(p): return p._p if isinstance(p, Pin) else _m.Pin(gp(p))
    def SoftI2C(scl, sda, freq=400000, **kw): return _m.SoftI2C(scl=raw(scl), sda=raw(sda), freq=freq)
    def I2C(id=0, scl=None, sda=None, freq=400000, **kw):
        if scl is None or sda is None:
            d = I2CDEF.get(str(id))
            if not d: raise ValueError('La %s no tiene I2C(%s) por defecto: dile las patas, I2C(%s, scl=Pin(...), sda=Pin(...))' % (NAME, id, id))
            scl, sda = d.split(',')
        return SoftI2C(scl, sda, freq)
    mm.I2C = I2C; mm.SoftI2C = SoftI2C
    sys.modules['machine'] = mm
`;
  if (b.flavor === 'esp32') s += `    # ── Módulos propios del ESP32 ──
    class Lazy:  # módulo que solo se compila si tu programa lo usa (así arranca antes)
        def __init__(s, src, env): s._src = src; s._env = env; s._m = None
        def __getattr__(s, k):
            if s._m is None:
                d = dict(s._env); exec(s._src, d); s._m = d
            try: return s._m[k]
            except KeyError: raise AttributeError(k)
    RGB = ${pyStr(b.rgb || '')}
    try:
        import neopixel as RN   # el de verdad (machine.bitstream): genera el tren de pulsos en la pata
    except ImportError:
        RN = None
    sys.modules['neopixel'] = Lazy('''
class NeoPixel:
    def __init__(s, pin, n, **kw):
        s.n = n; s.b = [(0, 0, 0)] * n; s._k = key(pin)
        s.real = RN.NeoPixel(_m.Pin(gp(pin)), n) if RN and s._k != RGB else None
    def __setitem__(s, i, v): s.b[i] = tuple(v[:3])
    def __getitem__(s, i): return s.b[i]
    def __len__(s): return s.n
    def fill(s, v):
        for i in range(s.n): s.b[i] = tuple(v[:3])
    def write(s):
        if s._k == RGB: AV[36], AV[37], AV[38] = s.b[0]; AV[39] = AV[39] + 1
        elif s.real:
            for i in range(s.n): s.real[i] = s.b[i]
            s.real.write()
''', {'key': key, 'RGB': RGB, 'AV': AV, 'RN': RN, '_m': _m, 'gp': gp})
    sys.modules['network'] = Lazy('''
STA_IF = 0
AP_IF = 1
class WLAN:
    def __init__(s, i=0): s._on = False
    def active(s, *a):
        if a: s._on = a[0]
        return s._on
    def connect(s, *a, **kw): print('(WiFi simulada: aquí no hay red de verdad)')
    def isconnected(s): return False
    def scan(s): return []
    def ifconfig(s, *a): return ('0.0.0.0',) * 4
    def config(s, *a, **kw): return ''
    def status(s, *a): return 0
''', {})
    e32 = Mod(); e32.raw_temperature = lambda: 120; e32.mcu_temperature = lambda: 42; e32.hall_sensor = lambda: 0
    sys.modules['esp32'] = e32
    esp = Mod(); esp.osdebug = lambda *a: None; esp.flash_size = lambda: 4194304
    sys.modules['esp'] = esp
`;
  if (b.flavor === 'stm32') s += `    # ── Módulo pyb (MicroPython en STM32) ──
    class Lazy:  # módulo que solo se compila si tu programa lo usa (así arranca antes)
        def __init__(s, src, env): s._src = src; s._env = env; s._m = None
        def __getattr__(s, k):
            if s._m is None:
                d = dict(s._env); exec(s._src, d); s._m = d
            try: return s._m[k]
            except KeyError: raise AttributeError(k)
    LEDS = ${pyStr(b.pybLeds || (b.led ? [b.led.key] : []))}
    LOW = ${b.led && b.led.low ? 'True' : 'False'}
    SW = ${pyStr(b.sw || '')}
    SERVOS = ${pyStr(b.servos || [])}
    sys.modules['pyb'] = Lazy('''
class LED:
    def __init__(s, n):
        if not 1 <= n <= len(LEDS): raise ValueError('La %s tiene %d LED(s)' % (NAME, len(LEDS)))
        s._p = Pin(LEDS[n - 1], Pin.OUT); s.off()
    def on(s): s._p.value(0 if LOW else 1)
    def off(s): s._p.value(1 if LOW else 0)
    def toggle(s): s._p.toggle()
    def intensity(s, v=None):
        if v is not None: s.on() if v else s.off()
class Switch:
    def __init__(s):
        if not SW: raise ValueError('La %s no tiene botón de usuario' % NAME)
        s._p = Pin(SW, Pin.IN, Pin.PULL_UP)
    def value(s): return s._p.value() == 0
    def __call__(s): return s._p.value() == 0
    def callback(s, f): s._p.irq((lambda p: f()) if f else None, Pin.IRQ_FALLING)
class Channel:
    def __init__(s, t, pin):
        s._w = _m.PWM(_m.Pin(pin._n if isinstance(pin, Pin) else gp(pin))); s._w.freq(hz(t._f)); s._w.duty_u16(0)
    def pulse_width_percent(s, p=None):
        if p is None: return s._w.duty_u16() * 100 / 65535
        s._w.duty_u16(int(max(0, min(100, p)) * 655.35))
class Tim:
    PWM = 0; PWM_INVERTED = 1; OC_TOGGLE = 2; UP = 0
    def __init__(s, n, freq=None, callback=None, **kw):
        s._f = freq or 1000; s._ch = []; s._t = None
        if callback: s.callback(callback)
    def init(s, freq=None, callback=None, **kw):
        if freq: s.freq(freq)
        if callback: s.callback(callback)
    def freq(s, f=None):
        if f is None: return s._f
        s._f = f
        for c in s._ch: c._w.freq(hz(f))
    def channel(s, n, mode=0, pin=None, pulse_width_percent=None, **kw):
        c = Channel(s, pin); s._ch.append(c)
        if pulse_width_percent is not None: c.pulse_width_percent(pulse_width_percent)
        return c
    def callback(s, f):
        if s._t: s._t.deinit()
        s._t = _m.Timer(period=max(1, int(1000 / s._f)), callback=lambda t: f(s)) if f else None
    def deinit(s):
        if s._t: s._t.deinit()
        for c in s._ch: c._w.deinit()
    def counter(s): return 0
class Servo:
    def __init__(s, n):
        if not 1 <= n <= len(SERVOS): raise ValueError('La %s no tiene pyb.Servo(%d)' % (NAME, n))
        s._w = _m.PWM(_m.Pin(gp(SERVOS[n - 1]))); s._w.freq(50); s._a = 0
    def angle(s, a=None, t=0):
        if a is None: return s._a
        s._a = a; s._w.duty_ns(int((1500 + a * 10) * 1000))
Timer = Tim
delay = _t.sleep_ms
udelay = _t.sleep_us
millis = _t.ticks_ms
micros = _t.ticks_us
def elapsed_millis(t): return _t.ticks_diff(_t.ticks_ms(), t)
def elapsed_micros(t): return _t.ticks_diff(_t.ticks_us(), t)
def freq(*a): return 168000000
def wfi(): _t.sleep_ms(1)
''', {'Pin': Pin, 'ADC': ADC, '_m': _m, '_t': _t, 'gp': gp, 'hz': hz, 'NAME': NAME, 'LEDS': LEDS, 'LOW': LOW, 'SW': SW, 'SERVOS': SERVOS})
`;
  if (b.flavor === 'linux') s += `    # ── Python «de Linux»: RPi.GPIO / Hobot.GPIO / Jetson.GPIO, gpiozero, wiringpi ──
    class Lazy:  # módulo que solo se compila si tu programa lo usa (así arranca antes)
        def __init__(s, src, env): s._src = src; s._env = env; s._m = None
        def __getattr__(s, k):
            if s._m is None:
                d = dict(s._env); exec(s._src, d); s._m = d
            try: return s._m[k]
            except KeyError: raise AttributeError(k)
    BCMP = ${pyDict(Object.fromEntries(Object.entries(BCM2PHYS).map(([k, v]) => [k, String(v)])))}
    WPI = ${pyDict(Object.fromEntries(Object.entries(WPI2PHYS).map(([k, v]) => [k, String(v)])))}
    HWPWM = ${pyStr(b.pwmPins || [])}
    LIB = ${pyStr(b.lib)}
    T = Mod()
    for k in dir(_t):
        if not k.startswith('__'): setattr(T, k, getattr(_t, k))
    t0 = _t.ticks_us()
    T.perf_counter = lambda: _t.ticks_diff(_t.ticks_us(), t0) / 1000000
    T.monotonic = T.perf_counter
    T.time = T.perf_counter   # segundos desde que arrancó (los float de MicroPython no dan para la fecha con decimales)
    sys.modules['time'] = T
    sg = Mod(); sg.SIGINT = 2; sg.SIGTERM = 15; sg.signal = lambda *a: None
    def pause():
        while True: _t.sleep_ms(100)
    sg.pause = pause
    sys.modules['signal'] = sg
    class SoftPWM:  # para frecuencias muy bajas (un LED que parpadea con PWM)
        def __init__(s, pin, f): s.p = pin; s.f = f; s.d = 0; s.t = _m.Timer(); s.k = 0
        def go(s):
            s.t.deinit()
            if s.d <= 0: s.p.value(0); return
            if s.d >= 100: s.p.value(1); return
            per = 1000 / s.f
            def tick(t):
                s.k = 1 - s.k; s.p.value(s.k)
                s.t.init(mode=_m.Timer.ONE_SHOT, period=max(1, int(per * (s.d if s.k else 100 - s.d) / 100)), callback=tick)
            tick(None)
        def duty(s, d): s.d = d; s.go()
        def freq(s, f): s.f = f; s.go()
        def stop(s): s.t.deinit(); s.p.value(0)
    class HwPWM:
        def __init__(s, pin, f): s.w = _m.PWM(_m.Pin(pin._n)); s.w.freq(hz(f)); s.w.duty_u16(0)
        def duty(s, d): s.w.duty_u16(int(max(0, min(100, d)) * 655.35))
        def freq(s, f): s.w.freq(hz(f))
        def stop(s): s.w.deinit()
    def mkpwm(pin, f):
        if HWPWM and pin._k not in HWPWM: raise ValueError('%s: el pin %s no tiene PWM. En esta placa el PWM solo está en los pines %s' % (LIB, pin._k, ', '.join(HWPWM)))
        return HwPWM(pin, f) if f >= 8 else SoftPWM(pin, f)
    G = Lazy('''
# RPi.GPIO y compañía
BOARD = 10; BCM = 11; CVM = 12; SOC = 13; TEGRA_SOC = 1000
OUT = 0; IN = 1; HIGH = 1; LOW = 0; PUD_OFF = 20; PUD_DOWN = 21; PUD_UP = 22; RISING = 31; FALLING = 32; BOTH = 33
VERSION = '0.7.1'; model = ${pyStr(b.model || '')}; RPI_INFO = {'TYPE': ${pyStr(b.name)}, 'P1_REVISION': 3}
st = {'mode': None, 'pins': {}, 'dir': {}, 'ev': {}, 'warn': True}
def phys(c):
    if st['mode'] is None: raise RuntimeError('Antes de usar los pines llama a GPIO.setmode(GPIO.BOARD) o GPIO.setmode(GPIO.BCM)')
    c = int(c)
    if st['mode'] == BCM:
        if str(c) not in BCMP: raise ValueError('GPIO%d (BCM) no existe en la cabecera de 40 pines' % c)
        return BCMP[str(c)]
    return str(c)
def gpin(c):
    k = phys(c)
    if k not in st['pins']: st['pins'][k] = Pin(k)
    return st['pins'][k]
def each(c, f):
    for x in (c if isinstance(c, (list, tuple)) else [c]): f(x)
def setmode(m): st['mode'] = m
def setup(c, d, pull_up_down=20, initial=None):
    def one(x):
        p = gpin(x); st['dir'][phys(x)] = d
        if d == OUT: p.init(Pin.OUT, value=initial if initial is not None else 0)
        else: p.init(Pin.IN, {22: Pin.PULL_UP, 21: Pin.PULL_DOWN}.get(pull_up_down, None))
    each(c, one)
def output(c, v):
    cs = c if isinstance(c, (list, tuple)) else [c]; vs = v if isinstance(v, (list, tuple)) else [v] * len(cs)
    for x, y in zip(cs, vs):
        if st['dir'].get(phys(x)) != OUT: raise RuntimeError('El pin %s no está configurado como salida (GPIO.setup(%s, GPIO.OUT))' % (x, x))
        gpin(x).value(1 if y else 0)
def inp(c):
    if phys(c) not in st['dir']: raise RuntimeError('Configura antes el pin %s con GPIO.setup' % c)
    return gpin(c).value()
def cleanup(c=None):
    ks = list(st['pins']) if c is None else [phys(x) for x in (c if isinstance(c, (list, tuple)) else [c])]
    for k in ks:
        if k in st['pins']: st['pins'][k].irq(None); st['pins'][k].init(Pin.IN, None)
        st['dir'].pop(k, None)
def add_event_detect(c, edge, callback=None, bouncetime=None):
    p = gpin(c); k = phys(c); st['ev'][k] = [False, [callback] if callback else []]
    def h(_):
        e = st['ev'].get(k)
        if not e: return
        e[0] = True
        for f in e[1]: f(c)
    p.irq(h, {31: Pin.IRQ_RISING, 32: Pin.IRQ_FALLING}.get(edge, Pin.IRQ_RISING | Pin.IRQ_FALLING))
def add_event_callback(c, f): st['ev'][phys(c)][1].append(f)
def event_detected(c):
    e = st['ev'].get(phys(c))
    if not e or not e[0]: return False
    e[0] = False; return True
def remove_event_detect(c): gpin(c).irq(None); st['ev'].pop(phys(c), None)
def wait_for_edge(c, edge, bouncetime=None, timeout=None):
    p = gpin(c); last = p.value(); t = _t.ticks_ms()
    while True:
        v = p.value()
        if v != last and (edge == BOTH or (edge == RISING and v) or (edge == FALLING and not v)): return c
        last = v
        if timeout is not None and _t.ticks_diff(_t.ticks_ms(), t) > timeout: return None
        _t.sleep_ms(1)
class GPWM:
    def __init__(s, c, f): s.p = gpin(c); s.f = f; s.w = mkpwm(s.p, f)
    def start(s, dc): s.w.duty(dc)
    def ChangeDutyCycle(s, dc): s.w.duty(dc)
    def ChangeFrequency(s, f):
        if (f >= 8) != (s.f >= 8): s.w.stop(); s.w = mkpwm(s.p, f)
        s.f = f; s.w.freq(f)
    def stop(s): s.w.stop()
getmode = lambda: st['mode']
def setwarnings(f): pass
input = inp
def gpio_function(c): return st['dir'].get(phys(c), IN)
PWM = GPWM
''', {'Pin': Pin, '_m': _m, '_t': _t, 'hz': hz, 'BCMP': BCMP, 'WPI': WPI, 'HwPWM': HwPWM, 'SoftPWM': SoftPWM, 'mkpwm': mkpwm, 'LIB': LIB})
    pkg = Mod(); pkg.GPIO = G
    for n in ('RPi', 'Hobot', 'Jetson', 'OPi'):
        sys.modules[n] = pkg; sys.modules[n + '.GPIO'] = G
    sys.modules['gpiozero'] = Lazy('''
# gpiozero (numeración BCM: 17, "GPIO17", "BOARD11")
def zpin(p):
    s = str(p).upper()
    if s.startswith('BOARD'): return Pin(s[5:])
    if s.startswith('J8:'): return Pin(s[3:])
    s = s.replace('GPIO', '').replace('BCM', '')
    if s not in BCMP: raise ValueError('gpiozero usa números BCM: GPIO%s no está en la cabecera' % s)
    return Pin(BCMP[s])
class LED:
    def __init__(s, pin, active_high=True, initial_value=False, **kw): s.p = zpin(pin); s.p.init(Pin.OUT); s.ah = active_high; s.t = None; s.value = 1 if initial_value else 0
    @property
    def value(s): return s.p.value() if s.ah else 1 - s.p.value()
    @value.setter
    def value(s, v): s.p.value((1 if v else 0) if s.ah else (0 if v else 1))
    @property
    def is_lit(s): return bool(s.value)
    def on(s): s._stop(); s.value = 1
    def off(s): s._stop(); s.value = 0
    def toggle(s): s.value = 1 - s.value
    def _stop(s):
        if s.t: s.t.deinit(); s.t = None
    def blink(s, on_time=1, off_time=1, n=None, background=True):
        s._stop(); s.t = _m.Timer(); st2 = [1, 0]
        def tick(t):
            st2[0] = 1 - st2[0]; s.value = st2[0]
            if not st2[0]:
                st2[1] += 1
                if n and st2[1] >= n: return
            s.t.init(mode=_m.Timer.ONE_SHOT, period=int(1000 * (on_time if st2[0] else off_time)), callback=tick)
        st2[0] = 0; tick(None)
        if not background:
            while s.t and (not n or st2[1] < n): _t.sleep_ms(10)
    def close(s): s.off()
class PWMLED(LED):
    def __init__(s, pin, active_high=True, initial_value=0, frequency=100, **kw): s.p = zpin(pin); s.w = HwPWM(s.p, frequency); s.v = 0; s.ah = active_high; s.t = None; s.value = initial_value
    @property
    def value(s): return s.v
    @value.setter
    def value(s, v): s.v = max(0, min(1, v)); s.w.duty((s.v if s.ah else 1 - s.v) * 100)
    def toggle(s): s.value = 1 - s.v
class Button:
    def __init__(s, pin, pull_up=True, bounce_time=None, **kw):
        s.p = zpin(pin); s.pu = pull_up; s.p.init(Pin.IN, Pin.PULL_UP if pull_up else Pin.PULL_DOWN); s._wp = None; s._wr = None
        s.p.irq(s._h, Pin.IRQ_RISING | Pin.IRQ_FALLING)
    def _h(s, _):
        f = s._wp if s.is_pressed else s._wr
        if f: f()
    @property
    def is_pressed(s): return s.p.value() == (0 if s.pu else 1)
    @property
    def value(s): return 1 if s.is_pressed else 0
    @property
    def when_pressed(s): return s._wp
    @when_pressed.setter
    def when_pressed(s, f): s._wp = f
    @property
    def when_released(s): return s._wr
    @when_released.setter
    def when_released(s, f): s._wr = f
    def wait_for_press(s, timeout=None):
        while not s.is_pressed: _t.sleep_ms(5)
    def wait_for_release(s, timeout=None):
        while s.is_pressed: _t.sleep_ms(5)
class Servo:
    def __init__(s, pin, initial_value=0, min_pulse_width=1/1000, max_pulse_width=2/1000, frame_width=20/1000, **kw):
        s.p = zpin(pin); s.w = _m.PWM(_m.Pin(s.p._n)); s.w.freq(int(1 / frame_width)); s.lo = min_pulse_width; s.hi = max_pulse_width; s.v = None; s.value = initial_value
    @property
    def value(s): return s.v
    @value.setter
    def value(s, v):
        s.v = v
        if v is None: s.w.duty_u16(0); return
        s.w.duty_ns(int((s.lo + (s.hi - s.lo) * (v + 1) / 2) * 1e9))
    def min(s): s.value = -1
    def mid(s): s.value = 0
    def max(s): s.value = 1
    def detach(s): s.value = None
class AngularServo(Servo):
    def __init__(s, pin, initial_angle=0, min_angle=-90, max_angle=90, **kw): s.a0 = min_angle; s.a1 = max_angle; Servo.__init__(s, pin, **kw); s.angle = initial_angle
    @property
    def angle(s): return None if s.v is None else s.a0 + (s.v + 1) / 2 * (s.a1 - s.a0)
    @angle.setter
    def angle(s, a): s.value = None if a is None else (a - s.a0) / (s.a1 - s.a0) * 2 - 1
class DistanceSensor:
    def __init__(s, echo=None, trigger=None, max_distance=1, **kw): s.e = zpin(echo); s.e.init(Pin.IN); s.tr = zpin(trigger); s.tr.init(Pin.OUT, value=0); s.mx = max_distance
    @property
    def distance(s):
        s.tr.value(1); _t.sleep_us(10); s.tr.value(0)
        us = _m.time_pulse_us(s.e._p, 1, 30000)
        return s.mx if us < 0 else min(s.mx, us / 5800)
class TonalBuzzer:
    def __init__(s, pin, **kw): s.p = zpin(pin); s.w = None
    def play(s, f):
        if s.w is None: s.w = HwPWM(s.p, 440)
        s.w.freq(f); s.w.duty(50)
    def stop(s):
        if s.w: s.w.duty(0)
Buzzer = LED
MotionSensor = Button
''', {'Pin': Pin, '_m': _m, '_t': _t, 'hz': hz, 'BCMP': BCMP, 'WPI': WPI, 'HwPWM': HwPWM, 'SoftPWM': SoftPWM, 'mkpwm': mkpwm, 'LIB': LIB})
    sys.modules['smbus2'] = sys.modules['smbus'] = Lazy('''
class SMBus:
    def __init__(s, bus=1, **kw): s.i2c = _m.SoftI2C(scl=_m.Pin(gp('5')), sda=_m.Pin(gp('3')), freq=100000)
    def read_byte_data(s, a, r): return s.i2c.readfrom_mem(a, r, 1)[0]
    def write_byte_data(s, a, r, v): s.i2c.writeto_mem(a, r, bytes([v & 255]))
    def read_word_data(s, a, r): d = s.i2c.readfrom_mem(a, r, 2); return d[0] | d[1] << 8
    def write_word_data(s, a, r, v): s.i2c.writeto_mem(a, r, bytes([v & 255, (v >> 8) & 255]))
    def read_i2c_block_data(s, a, r, n): return list(s.i2c.readfrom_mem(a, r, n))
    def write_i2c_block_data(s, a, r, d): s.i2c.writeto_mem(a, r, bytes(d))
    def read_byte(s, a): return s.i2c.readfrom(a, 1)[0]
    def write_byte(s, a, v): s.i2c.writeto(a, bytes([v & 255]))
    def close(s): pass
    def __enter__(s): return s
    def __exit__(s, *a): pass
''', {'_m': _m, 'gp': gp})
    sys.modules['wiringpi'] = Lazy('''
# wiringpi (wiringOP / wiringKP)
INPUT = 0; OUTPUT = 1; PWM_OUTPUT = 2; LOW = 0; HIGH = 1; PUD_OFF = 0; PUD_DOWN = 1; PUD_UP = 2
ws = {'n': None, 'soft': {}}
def wpin(n):
    if ws['n'] is None: raise RuntimeError('Llama antes a wiringpi.wiringPiSetup() o wiringpi.wiringPiSetupPhys()')
    k = str(n) if ws['n'] == 'phys' else WPI.get(str(n))
    if not k: raise ValueError('wPi %s no existe' % n)
    return Pin(k)
def setup_(m):
    def f(): ws['n'] = m; return 0
    return f
wiringPiSetup = setup_('wpi'); wiringPiSetupPhys = setup_('phys'); wiringPiSetupGpio = setup_('wpi')
pinMode = lambda n, m: wpin(n).init(Pin.OUT if m else Pin.IN)
digitalWrite = lambda n, v: wpin(n).value(1 if v else 0)
digitalRead = lambda n: wpin(n).value()
pullUpDnControl = lambda n, p: wpin(n).init(Pin.IN, {2: Pin.PULL_UP, 1: Pin.PULL_DOWN}.get(p, None))
delay = _t.sleep_ms; delayMicroseconds = _t.sleep_us; millis = _t.ticks_ms; micros = _t.ticks_us
def softPwmCreate(n, v, r): ws['soft'][n] = [mkpwm(wpin(n), 100), r]; softPwmWrite(n, v); return 0
def softPwmWrite(n, v): w, r = ws['soft'][n]; w.duty(100 * v / r)
def softToneCreate(n): ws['soft'][n] = [HwPWM(wpin(n), 440), 100]; return 0
def softToneWrite(n, f):
    w = ws['soft'][n][0]
    if f <= 0: w.duty(0)
    else: w.freq(f); w.duty(50)
def softPwmStop(n): ws['soft'][n][0].stop()
''', {'Pin': Pin, '_m': _m, '_t': _t, 'hz': hz, 'BCMP': BCMP, 'WPI': WPI, 'HwPWM': HwPWM, 'SoftPWM': SoftPWM, 'mkpwm': mkpwm, 'LIB': LIB})
`;
  return s + LIBS + `_plato()
del _plato
`;
}
// Librerías incluidas (se compilan solo si tu programa las importa): ssd1306, mpu6050, bmp280, lcd_i2c
// Librerías incluidas (se compilan solo si tu programa las importa). LIB_SRC sirve también para copiarlas a la placa real.
export const LIB_SRC = {
  ssd1306: `import framebuf
class SSD1306(framebuf.FrameBuffer):
    def __init__(s, width, height, external_vcc=False):
        s.width = width; s.height = height; s.pages = height // 8; s.buffer = bytearray(s.pages * width)
        super().__init__(s.buffer, width, height, framebuf.MONO_VLSB)
        for c in (0xAE, 0x20, 0x00, 0x40, 0xA1, 0xA8, height - 1, 0xC8, 0xD3, 0, 0xDA, 0x12 if height == 64 else 0x02, 0xD5, 0x80, 0xD9, 0xF1, 0xDB, 0x30, 0x81, 0xFF, 0xA4, 0xA6, 0x8D, 0x14, 0xAF):
            s.write_cmd(c)
        s.fill(0); s.show()
    def poweroff(s): s.write_cmd(0xAE)
    def poweron(s): s.write_cmd(0xAF)
    def contrast(s, c): s.write_cmd(0x81); s.write_cmd(c)
    def invert(s, i): s.write_cmd(0xA7 if i else 0xA6)
    def rotate(s, r): s.write_cmd(0xC8 if r else 0xC0); s.write_cmd(0xA1 if r else 0xA0)
    def show(s):
        for c in (0x21, 0, s.width - 1, 0x22, 0, s.pages - 1): s.write_cmd(c)
        s.write_data(s.buffer)
class SSD1306_I2C(SSD1306):
    def __init__(s, width, height, i2c, addr=0x3C, external_vcc=False):
        s.i2c = i2c; s.addr = addr; s.cmdbuf = bytearray(2)
        super().__init__(width, height, external_vcc)
    def write_cmd(s, c): s.cmdbuf[0] = 0x80; s.cmdbuf[1] = c; s.i2c.writeto(s.addr, s.cmdbuf)
    def write_data(s, buf): s.i2c.writevto(s.addr, (b'\\x40', buf))
`,
  mpu6050: `class MPU6050:
    def __init__(s, i2c, addr=0x68): s.i2c = i2c; s.addr = addr; i2c.writeto_mem(addr, 0x6B, bytes([0]))
    def _w(s, r):
        d = s.i2c.readfrom_mem(s.addr, r, 2); v = d[0] << 8 | d[1]
        return v - 65536 if v > 32767 else v
    def acceleration(s): return tuple(s._w(0x3B + 2 * i) / 16384 for i in range(3))
    def gyro(s): return tuple(s._w(0x43 + 2 * i) / 131 for i in range(3))
    def temperature(s): return s._w(0x41) / 340 + 36.53
    def get_values(s):
        a = s.acceleration(); g = s.gyro()
        return {'AcX': a[0], 'AcY': a[1], 'AcZ': a[2], 'GyX': g[0], 'GyY': g[1], 'GyZ': g[2], 'Tmp': s.temperature()}
`,
  bmp280: `import struct
class BMP280:
    def __init__(s, i2c, addr=0x76):
        s.i2c = i2c; s.addr = addr
        if i2c.readfrom_mem(addr, 0xD0, 1)[0] != 0x58: raise OSError('No encuentro un BMP280 en 0x%02x' % addr)
        s.c = struct.unpack('<HhhHhhhhhhhh', i2c.readfrom_mem(addr, 0x88, 24)); i2c.writeto_mem(addr, 0xF4, bytes([0x27]))
    def _raw(s):
        d = s.i2c.readfrom_mem(s.addr, 0xF7, 6)
        return (d[0] << 12) | (d[1] << 4) | (d[2] >> 4), (d[3] << 12) | (d[4] << 4) | (d[5] >> 4)
    def _tf(s, t):
        T1, T2, T3 = s.c[0], s.c[1], s.c[2]
        return (t / 16384 - T1 / 1024) * T2 + ((t / 131072 - T1 / 8192) ** 2) * T3
    @property
    def temperature(s): return s._tf(s._raw()[1]) / 5120
    @property
    def pressure(s):
        p, t = s._raw(); tf = s._tf(t); P1, P2, P3, P4, P5, P6, P7, P8, P9 = s.c[3:]
        v1 = tf / 2 - 64000; v2 = v1 * v1 * P6 / 32768 + v1 * P5 * 2; v2 = v2 / 4 + P4 * 65536
        v1 = (P3 * v1 * v1 / 524288 + P2 * v1) / 524288; v1 = (1 + v1 / 32768) * P1
        if not v1: return 0
        q = (1048576 - p - v2 / 4096) * 6250 / v1; return q + (P9 * q * q / 2147483648 + q * P8 / 32768 + P7) / 16
`,
  lcd_i2c: `import time
class I2cLcd:
    def __init__(s, i2c, addr=0x27, rows=2, cols=16):
        s.i2c = i2c; s.addr = addr; s.rows = rows; s.cols = cols; s.bl = 8; s.x = s.y = 0
        time.sleep_ms(20)
        for n in (3, 3, 3, 2): s._nib(n << 4, 0); time.sleep_ms(5)
        for c in (0x28, 0x0C, 0x06, 0x01): s.cmd(c)
        time.sleep_ms(2)
    def _out(s, b): s.i2c.writeto(s.addr, bytes([b | s.bl]))
    def _nib(s, n, rs): s._out(n | rs | 4); s._out(n | rs)
    def _send(s, v, rs): s._nib(v & 0xF0, rs); s._nib((v << 4) & 0xF0, rs)
    def cmd(s, c): s._send(c, 0)
    def clear(s): s.cmd(0x01); s.x = s.y = 0; time.sleep_ms(2)
    def move_to(s, x, y): s.x = x; s.y = y; s.cmd(0x80 | (x + (0x40 if y & 1 else 0) + (s.cols if y > 1 else 0)))
    def putchar(s, ch):
        if ch == chr(10): s.move_to(0, (s.y + 1) % s.rows); return
        s._send(ord(ch), 1); s.x += 1
    def putstr(s, t):
        for ch in t: s.putchar(ch)
    def backlight_on(s): s.bl = 8; s._out(0)
    def backlight_off(s): s.bl = 0; s._out(0)
    def hide_cursor(s): s.cmd(0x0C)
    def show_cursor(s): s.cmd(0x0E)
`,
};
const LIBS = `    # ── Librerías de piezas incluidas: ${Object.keys(LIB_SRC).join(', ')} ──
    try:
        Lazy
    except NameError:
        class Lazy:
            def __init__(s, src, env): s._src = src; s._env = env; s._m = None
            def __getattr__(s, k):
                if s._m is None:
                    d = dict(s._env); exec(s._src, d); s._m = d
                try: return s._m[k]
                except KeyError: raise AttributeError(k)
` + Object.entries(LIB_SRC).map(([k, src]) => `    sys.modules['${k}'] = Lazy('''\n${src}''', {})\n`).join('');
// Para las placas de chip emulado (Pico…): solo las librerías, sin capa de pines
export function libsCode() { return `def _plato():
    import sys
${LIBS}_plato()
del _plato
`; }
