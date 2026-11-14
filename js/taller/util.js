// Enlace con el útil HIL (Pico con util/firmware/main.py) por Web Serial.
// La planta simulada «escribe» los sensores en las DO/AO/encoder del útil y «lee» los actuadores en sus DI/AI/PWM.
// Canales: DO0-7 (salidas digitales hacia la placa), AO0-3 (tensión, MCP4728), ENC (encoder A/B/Z),
//          DI0-7 (entradas digitales desde la placa), PW0-7 (PWM medido en esa DI), AI0-2 (tensión desde la placa).
export const UTIL_CH = {
  toDut: { d: ['DO0', 'DO1', 'DO2', 'DO3', 'DO4', 'DO5', 'DO6', 'DO7'], a: ['AO0', 'AO1', 'AO2', 'AO3'], enc: ['ENC'] },
  fromDut: { d: ['DI0', 'DI1', 'DI2', 'DI3', 'DI4', 'DI5', 'DI6', 'DI7'], pwm: ['PW0', 'PW1', 'PW2', 'PW3', 'PW4', 'PW5', 'PW6', 'PW7', 'AI0', 'AI1', 'AI2'] },
};
export const FIRMWARE_URL = new URL('../../util/firmware/main.py', import.meta.url).href;
// El firmware como texto (algunos alojamientos no sirven .py: entonces se busca main.py.txt)
export async function fetchFirmware() { for (const u of [FIRMWARE_URL, FIRMWARE_URL + '.txt']) { try { const r = await fetch(u); if (r.ok) { const t = await r.text(); if (/platohil/.test(t)) return t; } } catch (e) {} } throw new Error('No encuentro el firmware del útil (util/firmware/main.py)'); }

export class UtilLink {
  constructor() { this.port = null; this.di = Array(8).fill(0); this.pw = {}; this.ai = [0, 0, 0]; this.log = () => {}; this.last = {}; this.id = ''; this.hb = 0; this.vref = 3.3; this.onEdge = null; this.offset = null; }
  get connected() { return !!this.port; }
  async connect(port) {
    this.port = port || await navigator.serial.requestPort(); await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable.getWriter(); this.reading = this._read();
    await this.send('X'); await this.send('?'); await this.send('R 20'); await this.send('W 1500'); await this.send('K 00');
    this.hbTimer = setInterval(() => this.send('T').catch(() => {}), 500); // también alimenta la vigilancia del útil
  }
  async _read() {
    const dec = new TextDecoder(); let buf = '';
    try { while (this.port && this.port.readable) { this.reader = this.port.readable.getReader();
      try { for (;;) { const { value, done } = await this.reader.read(); if (done) break; buf += dec.decode(value); let k; while ((k = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, k).replace(/\r$/, ''); buf = buf.slice(k + 1); this._line(line); } } }
      finally { try { this.reader.releaseLock(); } catch (e) {} } if (!this.port) break; } } catch (e) { this.log('⚠ ' + e.message + '\n'); }
  }
  _line(s) { const p = s.trim().split(/\s+/); const c = p[0];
    if (c === 'I') { const ch = +p[1], v = +p[2]; this.di[ch] = v; if (this.onEdge) this.onEdge('DI' + ch, v, +p[3]); }
    else if (c === 'D') { const m = parseInt(p[1], 16); for (let k = 0; k < 8; k++) this.di[k] = (m >> k) & 1; }
    else if (c === 'V') { for (let k = 0; k < 3; k++) this.ai[k] = (+p[k + 1] || 0) / 65535 * 3.3; }
    else if (c === 'F') this.pw[+p[1]] = { hz: +p[2], duty: +p[3], t: performance.now() };
    else if (c === 'H' || c === 'T') this.hb = performance.now();
    else if (c === 'ID') { this.id = s; this.log(s + '\n'); }
    else if (c === '!') this.log('útil: ' + s.slice(2) + '\n');
    else if (c === 'U') { const hex = p[1] || ''; let t = ''; for (let i = 0; i < hex.length; i += 2) t += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16)); this.log(t); }
    else if (s.startsWith('Traceback') || s.includes('Error')) this.log(s + '\n'); }
  async send(cmd) { if (!this.writer) return; await this.writer.write(new TextEncoder().encode(cmd + '\n')); }
  // Escribe solo lo que cambia (el USB es rápido, pero la línea serie no tiene por qué llenarse de repeticiones)
  set(ch, v) {
    let m; if ((m = /^DO(\d)$/.exec(ch))) { const b = v ? 1 : 0; if (this.last[ch] !== b) { this.last[ch] = b; this.send(`O ${m[1]} ${b}`); } return; }
    if ((m = /^AO(\d)$/.exec(ch))) { const n = Math.max(0, Math.min(4095, Math.round(v / this.vref * 4095))); if (Math.abs((this.last[ch] ?? -99) - n) > 2) { this.last[ch] = n; this.send(`A ${m[1]} ${n}`); } return; }
    if (ch === 'ENC') { const hz = Math.round(v); if (this.last.ENC !== hz) { this.last.ENC = hz; this.send(`E ${hz}`); } } }
  get(ch) { let m;
    if ((m = /^DI(\d)$/.exec(ch))) return !!this.di[+m[1]];
    if ((m = /^PW(\d)$/.exec(ch))) { const k = +m[1]; if (!this.measOn) this.measOn = {}; if (!this.measOn[k]) { this.measOn[k] = 1; this.send(`P ${k} 1`); }
      const f = this.pw[k]; return f && performance.now() - f.t < 300 ? f.duty : (this.di[k] ? 1 : 0); }
    if ((m = /^AI(\d)$/.exec(ch))) return this.ai[+m[1]] / 3.3;
    return false; }
  async safe() { this.last = {}; await this.send('X'); }
  async close() { clearInterval(this.hbTimer); try { await this.send('X'); } catch (e) {} const p = this.port; this.port = null; try { await this.reader?.cancel(); } catch (e) {} try { this.writer?.releaseLock(); } catch (e) {} try { await p?.close(); } catch (e) {} this.writer = null; }
}
