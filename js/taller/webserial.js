// Placa de verdad por USB desde el navegador (Web Serial, Chrome/Edge): ejecutar o grabar MicroPython y ver su monitor.
// Usa el mismo REPL «raw» que el simulador, así que lo que funciona aquí funciona allí.
const enc = new TextEncoder(), dec = new TextDecoder();
const wait = ms => new Promise(r => setTimeout(r, ms));
export const webSerialOk = () => typeof navigator !== 'undefined' && 'serial' in navigator;

export class RealBoard {
  constructor(onText) { this.onText = onText || (() => {}); this.buf = ''; this.port = null; }
  get connected() { return !!this.port; }
  async connect() {
    this.port = await navigator.serial.requestPort({});
    await this.port.open({ baudRate: 115200 }); this.writer = this.port.writable.getWriter(); this.reading = this.readLoop();
    await this.interrupt(); return this.port.getInfo ? this.port.getInfo() : {};
  }
  async readLoop() {
    while (this.port && this.port.readable) { const r = this.port.readable.getReader(); this.reader = r;
      try { for (;;) { const { value, done } = await r.read(); if (done) break; const s = dec.decode(value, { stream: true }); this.buf += s; if (!this.quiet) this.onText(s); } } catch (e) { /* desconectada */ } finally { r.releaseLock(); } if (!this.port) break; await wait(50); }
  }
  async send(s) { const b = typeof s === 'string' ? enc.encode(s) : s; for (let i = 0; i < b.length; i += 128) { await this.writer.write(b.slice(i, i + 128)); await wait(8); } }
  async until(pat, ms = 4000) { const t = Date.now(); for (;;) { const i = this.buf.indexOf(pat); if (i >= 0) { const out = this.buf.slice(0, i); this.buf = this.buf.slice(i + pat.length); return out; } if (Date.now() - t > ms) throw new Error('La placa no contesta (¿tiene MicroPython? ¿está Thonny abierto?)'); await wait(20); } }
  async interrupt() { const q = this.quiet; this.quiet = true; await this.send('\r\x03\x03'); await wait(150); this.buf = ''; this.quiet = q; }
  // Ejecuta un programa en el REPL «raw» y devuelve lo que imprime (o lanza el error de Python)
  async exec(code, { stream = true, ms = 10000 } = {}) {
    await this.interrupt(); this.quiet = true; await this.send('\x01'); await this.until('raw REPL; CTRL-B to exit\r\n>');
    await this.send(code.replace(/\r/g, '')); await this.send('\x04'); await this.until('OK', 3000); this.quiet = !stream;
    const out = await this.until('\x04', ms).catch(e => { this.quiet = false; throw e; }); const err = await this.until('\x04', 2000).catch(() => '');
    await this.until('>', 1000).catch(() => {}); this.quiet = false;
    if (err.trim()) throw new Error(err.trim()); return out;
  }
  // Ejecuta sin esperar a que acabe (programas con bucle infinito): la salida va al monitor
  async run(code) { await this.interrupt(); this.quiet = true; await this.send('\x01'); await this.until('raw REPL; CTRL-B to exit\r\n>'); await this.send(code.replace(/\r/g, '')); await this.send('\x04'); await this.until('OK', 3000); this.quiet = false; }
  // Guarda el programa como main.py (arranca solo cada vez que la placa se enciende) y la reinicia
  async save(code, name = 'main.py') {
    const chunks = []; for (let i = 0; i < code.length; i += 200) chunks.push(code.slice(i, i + 200));
    await this.exec(`f = open(${JSON.stringify(name)}, 'w')\n` + chunks.map(c => `f.write(${JSON.stringify(c)})`).join('\n') + '\nf.close()\nprint(len(open(' + JSON.stringify(name) + ').read()))\n', { stream: false });
    this.quiet = true; await this.send('\x02'); await wait(100); await this.send('\x04'); await wait(200); this.quiet = false; // sale del modo raw y reinicia en blando: arranca main.py
  }
  async info() { try { return (await this.exec('import sys, os\nprint(sys.implementation._machine if hasattr(sys.implementation, "_machine") else sys.platform, "·", sys.version.split(";")[-1].strip())', { stream: false })).trim(); } catch (e) { return ''; } }
  async stop() { await this.interrupt(); }
  async close() { const p = this.port; this.port = null; try { this.reader && await this.reader.cancel(); } catch (e) {} try { this.writer && this.writer.releaseLock(); } catch (e) {} try { await p.close(); } catch (e) {} }
}
