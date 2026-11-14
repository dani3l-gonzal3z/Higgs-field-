// Dispositivos I2C simulados a nivel de registro, como los de verdad: el programa usa sus librerías normales.
import { HD44780 } from './circuit.js';

// Registro con puntero autoincremental (patrón de casi todos los sensores)
class RegDev {
  constructor() { this.reg = new Uint8Array(256); this.ptr = 0; this.first = false; }
  start(read) { this.first = !read; }
  write(b) { if (this.first) { this.ptr = b; this.first = false; } else { this.onWrite(this.ptr, b); this.ptr = (this.ptr + 1) & 255; } return true; }
  read() { this.refresh && this.refresh(this.ptr); const v = this.reg[this.ptr]; this.ptr = (this.ptr + 1) & 255; return v; }
  onWrite(r, v) { this.reg[r] = v; }
}

/* ---------- Pantalla OLED SSD1306 128×64 ---------- */
export class SSD1306 {
  constructor(w = 128, h = 64) { this.w = w; this.h = h; this.ram = new Uint8Array(w * h / 8); this.col = 0; this.page = 0; this.c0 = 0; this.c1 = w - 1; this.p0 = 0; this.p1 = h / 8 - 1; this.mode = 2; this.on = false; this.inv = false; this.contrast = 0x7f; this.args = []; this.need = 0; this.dirty = true; this.segRemap = false; this.comRemap = false; }
  start() { this.ctl = null; }
  write(b) {
    if (this.ctl === null) { this.ctl = b; return true; }
    if (this.ctl & 0x40) this.data(b); else this.cmd(b);
    if (this.ctl & 0x80) this.ctl = null; // Co = 1: viene otro byte de control
    return true;
  }
  stop() {}
  cmd(b) {
    if (this.need) { this.args.push(b); if (--this.need === 0) this.apply(this.op, this.args); return; }
    const n = { 0x20: 1, 0x21: 2, 0x22: 2, 0x81: 1, 0xA8: 1, 0xD3: 1, 0x8D: 1, 0xD5: 1, 0xD9: 1, 0xDB: 1, 0xDA: 1, 0x26: 6, 0x27: 6, 0x29: 5, 0x2A: 5, 0xA3: 2 }[b];
    if (n) { this.op = b; this.args = []; this.need = n; return; }
    if (b === 0xAE) this.on = false; else if (b === 0xAF) this.on = true; else if (b === 0xA6) this.inv = false; else if (b === 0xA7) this.inv = true;
    else if (b === 0xA0) this.segRemap = false; else if (b === 0xA1) this.segRemap = true; else if (b === 0xC0) this.comRemap = false; else if (b === 0xC8) this.comRemap = true;
    else if (b >= 0xB0 && b <= 0xB7) this.page = b & 7; else if (b <= 0x0F) this.col = (this.col & 0xF0) | b; else if (b >= 0x10 && b <= 0x1F) this.col = (this.col & 0x0F) | ((b & 0x0F) << 4);
    this.dirty = true;
  }
  apply(op, a) { if (op === 0x20) this.mode = a[0] & 3; else if (op === 0x21) { this.c0 = a[0] & 127; this.c1 = a[1] & 127; this.col = this.c0; } else if (op === 0x22) { this.p0 = a[0] & 7; this.p1 = a[1] & 7; this.page = this.p0; } else if (op === 0x81) this.contrast = a[0]; this.dirty = true; }
  data(b) {
    if (this.page < this.h / 8 && this.col < this.w) this.ram[this.page * this.w + this.col] = b; this.dirty = true;
    if (this.mode === 2) { this.col = (this.col + 1) & 127; return; } // modo página
    if (this.mode === 0) { if (++this.col > this.c1) { this.col = this.c0; if (++this.page > this.p1) this.page = this.p0; } }
    else if (this.mode === 1) { if (++this.page > this.p1) { this.page = this.p0; if (++this.col > this.c1) this.col = this.c0; } }
  }
  paint(img) { // ImageData del elemento
    const d = img.data, W = this.w; const k = 0.45 + 0.55 * this.contrast / 255;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < W; x++) { // los módulos van montados del revés: con A1 y C8 (lo que mandan las librerías) se ve derecho
      const sx = this.segRemap ? x : W - 1 - x, sy = this.comRemap ? y : this.h - 1 - y;
      let on = (this.ram[(y >> 3) * W + x] >> (y & 7)) & 1; if (this.inv) on ^= 1; if (!this.on) on = 0; const i = (sy * W + sx) * 4; void sx;
      d[i] = on ? 230 * k : 0; d[i + 1] = on ? 240 * k : 0; d[i + 2] = on ? 255 * k : 0; d[i + 3] = 255; }
    this.dirty = false;
  }
}

/* ---------- Acelerómetro y giróscopo MPU6050 ---------- */
export class MPU6050 extends RegDev {
  constructor() { super(); this.reg[0x75] = 0x68; this.reg[0x6B] = 0x40; this.state = { ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, temp: 24 }; }
  refresh(r) { if (r < 0x3B || r > 0x48) return; const s = this.state; const aRange = [2, 4, 8, 16][(this.reg[0x1C] >> 3) & 3], gRange = [250, 500, 1000, 2000][(this.reg[0x1B] >> 3) & 3];
    const put = (at, v) => { v = Math.max(-32768, Math.min(32767, Math.round(v))); this.reg[at] = (v >> 8) & 255; this.reg[at + 1] = v & 255; };
    put(0x3B, s.ax / aRange * 32768); put(0x3D, s.ay / aRange * 32768); put(0x3F, s.az / aRange * 32768); put(0x41, (s.temp - 36.53) * 340);
    put(0x43, s.gx / gRange * 32768); put(0x45, s.gy / gRange * 32768); put(0x47, s.gz / gRange * 32768); }
}

/* ---------- Barómetro y termómetro BMP280 (con la calibración y las fórmulas de la hoja de datos) ---------- */
export class BMP280 extends RegDev {
  constructor() { super(); const r = this.reg; r[0xD0] = 0x58; this.state = { temp: 22, press: 1013.25 };
    // calibración de ejemplo de la hoja de datos de Bosch
    this.cal = { T1: 27504, T2: 26435, T3: -1000, P1: 36477, P2: -10685, P3: 3024, P4: 2855, P5: 140, P6: -7, P7: 15500, P8: -14600, P9: 6000 };
    const c = this.cal; const w16 = (at, v) => { v &= 0xffff; r[at] = v & 255; r[at + 1] = v >> 8; };
    w16(0x88, c.T1); w16(0x8A, c.T2); w16(0x8C, c.T3); w16(0x8E, c.P1); ['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'].forEach((k, i) => w16(0x90 + i * 2, c[k])); }
  onWrite(r, v) { if (r === 0xE0 && v === 0xB6) { this.reg[0xF4] = 0; return; } this.reg[r] = v; }
  tfine(adcT) { const c = this.cal; const v1 = (adcT / 16384 - c.T1 / 1024) * c.T2; const v2 = ((adcT / 131072 - c.T1 / 8192) ** 2) * c.T3; return v1 + v2; }
  pressure(adcP, tf) { const c = this.cal; let v1 = tf / 2 - 64000; let v2 = v1 * v1 * c.P6 / 32768; v2 += v1 * c.P5 * 2; v2 = v2 / 4 + c.P4 * 65536; v1 = (c.P3 * v1 * v1 / 524288 + c.P2 * v1) / 524288; v1 = (1 + v1 / 32768) * c.P1; if (!v1) return 0;
    let p = 1048576 - adcP; p = (p - v2 / 4096) * 6250 / v1; v1 = c.P9 * p * p / 2147483648; v2 = p * c.P8 / 32768; return p + (v1 + v2 + c.P7) / 16; }
  refresh(r) { if (r < 0xF7 || r > 0xFC) return; const s = this.state;
    // busca los valores en bruto que dan la temperatura y presión deseadas (las fórmulas son monótonas)
    let lo = 0, hi = 1 << 20; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (this.tfine(m) / 5120 < s.temp) lo = m; else hi = m; } const adcT = Math.round(lo); const tf = this.tfine(adcT);
    lo = 0; hi = 1 << 20; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (this.pressure(m, tf) > s.press * 100) lo = m; else hi = m; } const adcP = Math.round(lo);
    const put20 = (at, v) => { this.reg[at] = (v >> 12) & 255; this.reg[at + 1] = (v >> 4) & 255; this.reg[at + 2] = (v & 15) << 4; }; put20(0xF7, adcP); put20(0xFA, adcT); this.reg[0xF3] = 0; }
}

/* ---------- Reloj DS1307 ---------- */
export class DS1307 extends RegDev {
  constructor(clock) { super(); this.clock = clock; this.offset = 0; this.halt = false; }
  now() { return new Date(Date.now() + this.offset); }
  refresh(r) { if (r > 6) return; const d = this.now(); const bcd = n => ((n / 10) | 0) << 4 | (n % 10); const R = this.reg;
    R[0] = bcd(d.getSeconds()) | (this.halt ? 0x80 : 0); R[1] = bcd(d.getMinutes()); R[2] = bcd(d.getHours()); R[3] = d.getDay() || 7; R[4] = bcd(d.getDate()); R[5] = bcd(d.getMonth() + 1); R[6] = bcd(d.getFullYear() % 100); }
  onWrite(r, v) { this.reg[r] = v; if (r <= 6) { this.pending = true; clearTimeout(this.tm); this.tm = setTimeout(() => this.commit(), 0); } }
  commit() { const R = this.reg; const dec = b => (b >> 4) * 10 + (b & 15); const d = new Date(2000 + dec(R[6]), dec(R[5] & 0x1f) - 1, dec(R[4] & 0x3f), dec(R[2] & 0x3f), dec(R[1] & 0x7f), dec(R[0] & 0x7f)); this.halt = !!(R[0] & 0x80); if (!isNaN(d)) this.offset = d - Date.now(); }
}

/* ---------- LCD con mochila I2C (PCF8574): P0=RS P1=RW P2=E P3=luz P4..P7=D4..D7 ---------- */
export class LcdI2C {
  constructor() { this.lcd = new HD44780(); this.last = 0; this.backlight = true; }
  start() {} stop() {} read() { return this.last; }
  write(b) { const e = !!(b & 4), pe = !!(this.last & 4); if (pe && !e) this.lcd.latch(b & 1, (b >> 4) & 15); this.backlight = !!(b & 8); this.last = b; return true; }
}

/* ---------- Tiras NeoPixel (WS2812): se descodifica el tren de pulsos del pin ---------- */
export class WS2812 {
  constructor(n) { this.n = n; this.px = new Array(n).fill(null).map(() => ({ r: 0, g: 0, b: 0 })); this.bits = []; this.rise = 0; this.lastFall = 0; this.dirty = false; this.idx = 0; }
  edge(v, t) { // t en µs
    if (v) { if (t - this.lastFall > 50) { this.idx = 0; this.bits = []; } this.rise = t; return; }
    const w = t - this.rise; this.lastFall = t; this.bits.push(w > 0.55 ? 1 : 0);
    if (this.bits.length === 24) { const x = this.bits.reduce((s, b) => s * 2 + b, 0); this.bits = []; if (this.idx < this.n) { this.px[this.idx] = { g: (x >> 16) & 255, r: (x >> 8) & 255, b: x & 255 }; this.dirty = true; } this.idx++; }
  }
}
