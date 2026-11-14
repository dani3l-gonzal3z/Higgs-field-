// Bus I2C del Taller. Un mismo juego de dispositivos (pantallas, sensores…) se conecta a tres «controladores»:
//   · el I2C por hardware del RP2040 (rp2040js) · el TWI del ATmega (avr8js) · y un esclavo a nivel de pin que
//   escucha SDA/SCL bit a bit (sirve para SoftI2C en cualquier placa y se ve tal cual en el analizador lógico).
export class I2CBus {
  constructor() { this.devs = new Map(); this.cur = null; this.log = []; }
  add(addr, dev) { this.devs.set(addr, dev); return this; }
  start() { if (this.cur && this.cur.stop) this.cur.stop(true); this.cur = null; }
  connect(addr, read) { const d = this.devs.get(addr); this.cur = d || null; if (d && d.start) d.start(read); return !!d; }
  write(b) { return this.cur ? this.cur.write(b) !== false : false; }
  read(ack) { return this.cur && this.cur.read ? this.cur.read(ack) & 255 : 0xff; }
  stop() { if (this.cur && this.cur.stop) this.cur.stop(false); this.cur = null; }
}

// RP2040: el periférico avisa de cada fase y espera a que se le conteste
export function attachRP2040(mcu, bus) {
  for (const i2c of mcu.i2c || []) {
    i2c.onStart = () => { bus.start(); i2c.completeStart(); };
    i2c.onConnect = (addr, mode) => i2c.completeConnect(bus.connect(addr, mode === 1 || mode === 'read'));
    i2c.onWriteByte = v => i2c.completeWrite(bus.write(v));
    i2c.onReadByte = ack => i2c.completeRead(bus.read(ack));
    i2c.onStop = () => { bus.stop(); i2c.completeStop(); };
  }
}
// ATmega: el TWI llama a un manejador con los mismos pasos
export function attachAVR(twi, bus) {
  twi.eventHandler = {
    start: () => { bus.start(); twi.completeStart(); }, stop: () => { bus.stop(); twi.completeStop(); },
    connectToSlave: (addr, write) => twi.completeConnect(bus.connect(addr, !write)),
    writeByte: v => twi.completeWrite(bus.write(v)), readByte: ack => twi.completeRead(bus.read(ack)),
  };
}

// Esclavo a nivel de pin (drenador abierto): el maestro baja la línea o la suelta; si la suelta, manda el esclavo o la
// resistencia de pull-up. onLine(sda, scl, t) avisa de cada cambio de la línea real (para el analizador).
export class PinSlave {
  constructor(bus, runner, sda, scl, onLine) {
    Object.assign(this, { bus, runner, sda, scl, onLine }); this.mSda = false; this.mScl = false; this.sLow = false; this.line = [1, 1];
    this.st = 'idle'; this.bits = 0; this.byte = 0; this.ack = false; this.tx = 0; this.txBits = 0; this.mAck = false;
    runner.onRaw(sda, low => { this.mSda = low; this.update(); }); runner.onRaw(scl, low => { this.mScl = low; this.update(); });
  }
  update() {
    const sda = !(this.mSda || this.sLow) ? 1 : 0, scl = this.mScl ? 0 : 1; const [ps, pc] = this.line; if (sda === ps && scl === pc) return;
    this.line = [sda, scl]; this.runner.setInput(this.sda, !!sda); this.runner.setInput(this.scl, !!scl); if (this.onLine) this.onLine(sda, scl);
    if (scl && pc && sda !== ps) { if (!sda) { this.bus.start(); this.st = 'addr'; this.bits = 0; this.byte = 0; this.ack = false; } else { this.bus.stop(); this.st = 'idle'; this.setLow(false); } return; }
    if (scl && !pc) { // flanco de subida: se lee el bit
      if ((this.st === 'addr' || this.st === 'write') && !this.ack) { this.byte = (this.byte << 1) | sda; this.bits++; }
      else if (this.st === 'read' && this.ack) this.mAck = !sda;
      return; }
    if (!scl && pc) { // flanco de bajada: se prepara lo siguiente
      if (this.st === 'addr' || this.st === 'write') {
        if (this.ack) { this.ack = false; this.setLow(false); if (this.st === 'read') this.loadByte(); return; }
        if (this.bits === 8) { let ok; if (this.st === 'addr') { const rd = this.byte & 1; ok = this.bus.connect(this.byte >> 1, !!rd); this.st = ok ? (rd ? 'read' : 'write') : 'nack'; } else ok = this.bus.write(this.byte);
          this.bits = 0; this.byte = 0; this.ack = true; this.setLow(ok); if (this.st === 'nack') this.ackNack = true; }
        return; }
      if (this.st === 'read') {
        if (this.ack) { if (this.waitAck) { this.waitAck = false; this.ack = false; if (this.mAck) this.loadByte(); else { this.st = 'idle'; this.setLow(false); } } else { this.ack = false; this.setLow(false); this.loadByte(); } return; }
        this.txBits++; if (this.txBits < 8) this.setLow(!((this.tx << this.txBits) & 0x80)); else { this.setLow(false); this.ack = true; this.waitAck = true; }
        return; }
      if (this.st === 'nack' && this.ackNack) { this.ackNack = false; this.setLow(false); this.st = 'idle'; }
    }
  }
  loadByte() { this.tx = this.bus.read(true); this.txBits = 0; this.setLow(!(this.tx & 0x80)); }
  setLow(v) { if (this.sLow === v) return; this.sLow = v; this.update(); }
}
