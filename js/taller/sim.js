// Motores del Taller: Arduino Uno (avr8js, C++ compilado) y Raspberry Pi Pico (rp2040js + MicroPython, sin compilar).
// Interfaz común: pins, level(pin), setInput(pin, v), setAnalog(pin, volts), onEdge(pin, cb), duty(pin), write(str), start(), stop().
const NOW = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function loadHex(src, target) {
  for (const line of src.split('\n')) {
    if (line[0] !== ':' || line.substr(7, 2) !== '00') continue;
    const n = parseInt(line.substr(1, 2), 16), addr = parseInt(line.substr(3, 4), 16);
    for (let i = 0; i < n; i++) target[addr + i] = parseInt(line.substr(9 + i * 2, 2), 16);
  }
}

class Base {
  constructor() { this.edges = new Map(); this.hi = new Map(); this.lastT = new Map(); this.lastV = new Map(); this.win = new Map(); this.serial = () => {}; this.running = false; }
  onEdge(pin, cb) { if (!this.edges.has(pin)) this.edges.set(pin, []); this.edges.get(pin).push(cb); }
  // Lleva la cuenta del tiempo en alto de cada pin (para PWM: brillo del LED, servo, zumbador).
  _edge(pin, v, tUs) {
    const prevV = this.lastV.get(pin), prevT = this.lastT.get(pin) ?? tUs;
    if (prevV) this.hi.set(pin, (this.hi.get(pin) || 0) + (tUs - prevT));
    const w = this.win.get(pin) || { n: 0 }; w.n++; this.win.set(pin, w);
    this.lastV.set(pin, v); this.lastT.set(pin, tUs);
    const cbs = this.edges.get(pin); if (cbs) for (const cb of cbs) cb(v, tUs);
  }
  // Fracción del tiempo en alto desde la última llamada (0..1) y cambios por segundo.
  duty(pin) {
    const t = this.timeUs(), t0 = this._dutyT0 ?? t; const span = Math.max(1, t - (this._spanT0?.get(pin) ?? t0));
    const v = this.lastV.get(pin), lt = this.lastT.get(pin) ?? t; let hi = (this.hi.get(pin) || 0) + (v ? t - lt : 0);
    this.hi.set(pin, 0); this.lastT.set(pin, t); if (!this._spanT0) this._spanT0 = new Map(); this._spanT0.set(pin, t);
    const w = this.win.get(pin) || { n: 0 }; const rate = w.n / (span / 1e6); this.win.set(pin, { n: 0 });
    return { duty: Math.max(0, Math.min(1, hi / span)), rate };
  }
}

/* ---------- Arduino Uno ---------- */
export const UNO_PINS = [...Array(14).keys()].map(String).concat(['A0', 'A1', 'A2', 'A3', 'A4', 'A5']);
export class AvrRunner extends Base {
  static async create(hex) { const A = await import('../vendor/avr8js.js'); return new AvrRunner(A, hex); }
  constructor(A, hex) {
    super(); this.A = A; this.F = 16e6;
    const prog = new Uint16Array(0x8000 / 2); loadHex(hex, new Uint8Array(prog.buffer));
    const cpu = this.cpu = new A.CPU(prog);
    this.timers = [A.timer0Config, A.timer1Config, A.timer2Config].map(c => new A.AVRTimer(cpu, c));
    this.ports = { B: new A.AVRIOPort(cpu, A.portBConfig), C: new A.AVRIOPort(cpu, A.portCConfig), D: new A.AVRIOPort(cpu, A.portDConfig) };
    this.usart = new A.AVRUSART(cpu, A.usart0Config, this.F); this.usart.onByteTransmit = b => this.serial(String.fromCharCode(b));
    this.adc = new A.AVRADC(cpu, A.adcConfig);
    this.pins = UNO_PINS;
    const map = this.map = {}; for (let i = 0; i < 8; i++) map[String(i)] = ['D', i]; for (let i = 8; i < 14; i++) map[String(i)] = ['B', i - 8]; for (let i = 0; i < 6; i++) map['A' + i] = ['C', i];
    const byPort = { B: [], C: [], D: [] }; for (const [pin, [p, b]] of Object.entries(map)) byPort[p][b] = pin;
    for (const [p, port] of Object.entries(this.ports)) port.addListener((v, old) => { const ch = v ^ old; if (!ch) return; const t = this.timeUs(); for (let b = 0; b < 8; b++) if (ch & (1 << b) && byPort[p][b] != null) this._edge(byPort[p][b], !!(v & (1 << b)), t); });
  }
  timeUs() { return this.cpu.cycles / 16; }
  level(pin) { const m = this.map[pin]; if (!m) return { out: null }; const s = this.ports[m[0]].pinState(m[1]); const P = this.A.PinState;
    return s === P.High ? { out: true } : s === P.Low ? { out: false } : { out: null, pullup: s === P.InputPullUp }; }
  setInput(pin, v) { const m = this.map[pin]; if (m) this.ports[m[0]].setPin(m[1], !!v); }
  setAnalog(pin, volts) { const m = /^A(\d)$/.exec(pin); if (m) this.adc.channelValues[+m[1]] = volts; }
  after(us, fn) { this.cpu.addClockEvent(fn, Math.max(1, Math.round(us * 16))); }
  get vcc() { return 5; }
  write(str) { for (const ch of str) this.usart.writeByte(ch.charCodeAt(0)); }
  start() {
    this.running = true; let last = NOW();
    const step = () => { if (!this.running) return; const now = NOW(); const dt = Math.min(50, now - last); last = now;
      const target = this.cpu.cycles + Math.floor(this.F * dt / 1000); const { cpu } = this; const ins = this.A.avrInstruction;
      try { while (cpu.cycles < target) { ins(cpu); cpu.tick(); } } catch (e) { this.running = false; this.onError && this.onError(e); return; }
      this.raf = requestAnimationFrame(step); };
    this.raf = requestAnimationFrame(step);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
}

/* ---------- Raspberry Pi Pico con MicroPython (todo en el navegador) ---------- */
export const PICO_PINS = [...Array(23).keys()].map(i => 'GP' + i).concat(['GP25', 'GP26', 'GP27', 'GP28']);
let UF2 = null;
export const setFirmware = b => { UF2 = b; };
export class PicoRunner extends Base {
  static async create(code) {
    const R = await import('../vendor/rp2040js.js');
    if (!UF2) { // firmware de MicroPython: binario si el hosting lo sirve; si no (p. ej. dentro de Claude), una copia en base64
      const r = await fetch(new URL('../../taller/micropython-rp2040.bin', import.meta.url)).catch(() => null);
      if (r && r.ok && !/text\/html/.test(r.headers.get('content-type') || '')) UF2 = new Uint8Array(await r.arrayBuffer());
      else { const m = await import('../../taller/micropython-rp2040.b64.js').catch(() => null); if (!m) throw new Error('No encuentro el firmware de MicroPython'); const bin = atob(m.default); UF2 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) UF2[i] = bin.charCodeAt(i); } }
    return new PicoRunner(R, code);
  }
  constructor(R, code) {
    super(); this.R = R; this.code = code; this.pins = PICO_PINS;
    const sim = this.sim = new R.Simulator(); const mcu = this.mcu = sim.rp2040; mcu.loadBootrom(R.bootromB1);
    try { mcu.logger = new R.ConsoleLogger(R.LogLevel.Error); } catch (e) {}
    for (let o = 0; o + 512 <= UF2.length; o += 512) { const v = new DataView(UF2.buffer, UF2.byteOffset + o, 512); if (v.getUint32(0, true) !== 0x0a324655) continue;
      mcu.flash.set(UF2.subarray(o + 32, o + 32 + v.getUint32(16, true)), v.getUint32(12, true) - 0x10000000); }
    for (let i = 0; i < 30; i++) { const pin = 'GP' + i; mcu.gpio[i] && mcu.gpio[i].addListener(st => { const S = R.GPIOPinState; if (st === S.High || st === S.Low) this._edge(pin, st === S.High, this.timeUs()); }); }
    const cdc = this.cdc = new R.USBCDC(mcu.usbCtrl); this.buf = ''; this.booted = false;
    cdc.onDeviceConnected = () => { cdc.sendSerialByte(13); };
    // REPL «raw» de MicroPython: no repite el código; la salida llega tras «OK» y los errores tras el primer \x04.
    this.phase = 'boot';
    cdc.onSerialData = v => this._rx(new TextDecoder().decode(v));
  }
  _rx(s) {
    if (this.phase === 'boot') { this.buf += s; if (this.buf.includes('>>>')) { this.phase = 'raw'; this.buf = ''; this._send('\x01'); } return; }
    if (this.phase === 'raw') { this.buf += s; if (this.buf.includes('raw REPL') && this.buf.trimEnd().endsWith('>')) { this.phase = 'ok'; this.buf = ''; this._send(this.code.replace(/\r/g, '').replace(/\t/g, '    ') + '\n'); this._send('\x04'); } return; }
    if (this.phase === 'ok') { this.buf += s; const i = this.buf.indexOf('OK'); if (i < 0) return; const rest = this.buf.slice(i + 2); this.buf = ''; this.phase = 'out'; if (rest) this._rx(rest); return; }
    if (this.phase === 'out') { const k = s.indexOf('\x04'); if (k < 0) { this.serial(s.replace(/\r/g, '')); return; } if (k) this.serial(s.slice(0, k).replace(/\r/g, '')); this.phase = 'err'; this.err = ''; const rest = s.slice(k + 1); if (rest) this._rx(rest); return; }
    if (this.phase === 'err') { const k = s.indexOf('\x04'); this.err += k < 0 ? s : s.slice(0, k); if (k >= 0) { this.phase = 'done'; const e = this.err.replace(/\r/g, '').trim(); if (e && this.onError) this.onError(new Error(e)); else if (this.onDone) this.onDone(); } }
  }
  // El FIFO USB de la Pico tiene 512 bytes: mando el programa poco a poco para no perder nada.
  _send(s) { (this.txq = this.txq || []).push(...new TextEncoder().encode(s)); this._flush(); }
  _flush() { const q = this.txq; if (!q || !q.length) return; const f = this.cdc.txFIFO; let i = 0; while (i < q.length && !f.full) this.cdc.sendSerialByte(q[i++]); q.splice(0, i); }
  timeUs() { return this.mcu.clock.nanos / 1000; }
  level(pin) { const g = this.mcu.gpio[+pin.slice(2)]; if (!g) return { out: null }; const S = this.R.GPIOPinState; const v = g.value;
    return v === S.High ? { out: true } : v === S.Low ? { out: false } : { out: null, pullup: v === S.InputPullUp, pulldown: v === S.InputPullDown }; }
  setInput(pin, v) { const g = this.mcu.gpio[+pin.slice(2)]; if (g) g.setInputValue(!!v); }
  setAnalog(pin, volts) { const ch = { GP26: 0, GP27: 1, GP28: 2 }[pin]; if (ch != null) this.mcu.adc.channelValues[ch] = Math.max(0, Math.min(4095, Math.round(volts / 3.3 * 4095))); }
  write(str) { this._send(str); }
  after(us, fn) { const a = this.sim.clock.createAlarm(() => fn()); a.schedule(Math.max(1, us) * 1000); }
  get vcc() { return 3.3; }
  start() { // a tiempo real: el reloj simulado no adelanta al de verdad (si no, sleep() no duraría nada)
    this.running = true; this.mcu.core.PC = 0x10000000; const { sim, mcu } = this; const clock = sim.clock; const t0 = NOW(), n0 = clock.nanos; const cyc = 1e9 / 125e6;
    const step = () => { if (!this.running) return; this._flush(); const until = n0 + (NOW() - t0) * 1e6; let guard = 0;
      try { while (clock.nanos < until && guard++ < 2e6) { if (mcu.core.waiting) { const nx = Math.min(clock.nanosToNextAlarm, until - clock.nanos); if (nx <= 0) break; clock.tick(nx); } else clock.tick(mcu.core.executeInstruction() * cyc); } }
      catch (e) { this.running = false; this.onError && this.onError(e); return; }
      this.timer = setTimeout(step, 4); };
    step();
  }
  stop() { this.running = false; clearTimeout(this.timer); }
}
