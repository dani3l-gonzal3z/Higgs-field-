// Hilo del emulador: un PicoRunner que manda a la página, cada ~15 ms, los flancos de sus pines, su hora y lo que imprime.
import { PicoRunner } from './sim.js';
let r = null, edges = [], ser = '', timer = 0; const lv = {};
const flush = () => { if (!r) return; const d = {}; let any = false;
  for (const p of r.pins) { const l = r.level(p); const k = (l.out === true ? 1 : l.out === false ? 0 : 2) | (l.pullup ? 4 : 0) | (l.pulldown ? 8 : 0); if (lv[p] !== k) { lv[p] = k; d[p] = k; any = true; } }
  postMessage({ t: 'tick', time: r.timeUs(), e: edges, s: ser, lv: any ? d : null, rgb: r.rgb }); edges = []; ser = ''; };
self.onmessage = async ({ data: m }) => {
  try {
    if (m.t === 'init') { r = await PicoRunner.create(m.code, m.opts); for (const p of r.pins) r.onEdge(p, (v, t) => { edges.push(p, v ? 1 : 0, t); });
      r.serial = s => { ser += s; }; r.onError = e => { flush(); postMessage({ t: 'error', msg: e.message }); }; r.onDone = () => { flush(); postMessage({ t: 'done' }); }; postMessage({ t: 'ready', pins: r.pins }); }
    else if (m.t === 'start') { r.start(); timer = setInterval(flush, 15); }
    else if (m.t === 'in') r.setInput(m.pin, m.v);
    else if (m.t === 'an') r.setAnalog(m.pin, m.v);
    else if (m.t === 'enc') r.encoder(m.pin, m.rate);
    else if (m.t === 'w') r.write(m.s);
    else if (m.t === 'pause') r.pause();
    else if (m.t === 'resume') r.resume();
    else if (m.t === 'stop') { r && r.stop(); clearInterval(timer); close(); }
  } catch (e) { postMessage({ t: 'error', msg: e.message }); }
};
