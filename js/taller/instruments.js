// Instrumentos del Taller: analizador lógico (con decodificadores UART e I2C y exportación VCD para PulseView/GTKWave)
// y trazador del puerto serie. Todo se alimenta de la simulación en tiempo real.
const COLORS = ['#ffb43c', '#57e389', '#7cc4ff', '#ff8fb1', '#c8a2ff', '#5fd7c8', '#ffd76b', '#ff6b5b'];

export class Recorder {
  constructor() { this.ch = new Map(); this.total = 0; this.max = 400000; this.t0 = 0; }
  reset(t0 = 0) { this.ch.clear(); this.total = 0; this.t0 = t0; }
  push(pin, t, v) { let c = this.ch.get(pin); if (!c) { c = { t: [], v: [], init: !v }; this.ch.set(pin, c); } const n = c.v.length; if (n && c.v[n - 1] === v) return; c.t.push(t); c.v.push(v ? 1 : 0); this.total++;
    if (this.total > this.max) for (const x of this.ch.values()) { const k = Math.floor(x.t.length / 4); x.init = k ? x.v[k - 1] === 0 : x.init; x.t.splice(0, k); x.v.splice(0, k); this.total -= k; } }
  // nivel de un canal en el instante t
  at(pin, t) { const c = this.ch.get(pin); if (!c || !c.t.length) return c && !c.init ? 1 : 0; let lo = 0, hi = c.t.length - 1; if (t < c.t[0]) return c.init ? 0 : 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.t[m] <= t) lo = m; else hi = m - 1; } return c.v[lo]; }
  pins() { return [...this.ch.keys()]; }
  // Frecuencia y ciclo de trabajo en una ventana
  stats(pin, a, b) { const c = this.ch.get(pin); if (!c) return null; let rises = 0, hiT = 0, last = a, lv = this.at(pin, a);
    for (let i = 0; i < c.t.length; i++) { const t = c.t[i]; if (t < a) continue; if (t > b) break; if (lv) hiT += t - last; if (!lv && c.v[i]) rises++; lv = c.v[i]; last = t; } if (lv) hiT += b - last;
    return { freq: rises / ((b - a) / 1e6), duty: hiT / (b - a) }; }
  vcd(names) { const pins = this.pins(); const ids = pins.map((_, i) => String.fromCharCode(33 + i)); let s = `$date ${new Date().toISOString()} $end\n$version Plató · Taller $end\n$timescale 1ns $end\n$scope module placa $end\n`;
    pins.forEach((p, i) => { s += `$var wire 1 ${ids[i]} ${(names && names[p] || p).replace(/\s+/g, '_')} $end\n`; }); s += '$upscope $end\n$enddefinitions $end\n#0\n$dumpvars\n';
    pins.forEach((p, i) => { const c = this.ch.get(p); s += (c.init ? '0' : '1') + ids[i] + '\n'; }); s += '$end\n';
    const ev = []; pins.forEach((p, i) => { const c = this.ch.get(p); for (let k = 0; k < c.t.length; k++) ev.push([Math.round(c.t[k] * 1000), c.v[k] + ids[i]]); }); ev.sort((a, b) => a[0] - b[0]);
    let lt = -1; for (const [t, x] of ev) { if (t !== lt) { s += '#' + t + '\n'; lt = t; } s += x + '\n'; } return s; }
}

// Decodificadores
export function decodeUART(rec, pin, a, b, baud = 115200) { const c = rec.ch.get(pin); if (!c) return []; const bt = 1e6 / baud; const out = [];
  for (let i = 0; i < c.t.length; i++) { const t = c.t[i]; if (t < a - 12 * bt || c.v[i]) continue; if (t > b) break; // flanco de bajada = bit de arranque
    if (rec.at(pin, t - bt * 0.5) !== 1) continue; let byte = 0; for (let k = 0; k < 8; k++) byte |= rec.at(pin, t + bt * (1.5 + k)) << k;
    const stop = rec.at(pin, t + bt * 9.5); out.push({ t, t2: t + bt * 10, text: byte >= 32 && byte < 127 ? JSON.stringify(String.fromCharCode(byte)).slice(1, -1) : '0x' + byte.toString(16).padStart(2, '0'), err: !stop });
    while (i + 1 < c.t.length && c.t[i + 1] < t + bt * 9.5) i++; }
  return out; }
export function decodeI2C(rec, sda, scl, a, b) { const A = rec.ch.get(sda), C = rec.ch.get(scl); if (!A || !C) return []; const ev = [];
  for (let i = 0; i < A.t.length; i++) if (A.t[i] >= a - 2000 && A.t[i] <= b) ev.push([A.t[i], 'd', A.v[i]]); for (let i = 0; i < C.t.length; i++) if (C.t[i] >= a - 2000 && C.t[i] <= b) ev.push([C.t[i], 'c', C.v[i]]); ev.sort((x, y) => x[0] - y[0] || (x[1] === 'c' ? -1 : 1));
  const out = []; let d = rec.at(sda, a - 2000), c = rec.at(scl, a - 2000), bits = [], t0 = 0, first = false;
  for (const [t, k, v] of ev) { if (k === 'd') { if (c && d && !v) { out.push({ t, t2: t + 3, text: 'S', kind: 'start' }); bits = []; first = true; } else if (c && !d && v) { out.push({ t, t2: t + 3, text: 'P', kind: 'stop' }); bits = []; } d = v; continue; }
    if (v && !c) { if (!bits.length) t0 = t; bits.push(d); if (bits.length === 9) { const byte = bits.slice(0, 8).reduce((s, x) => s * 2 + x, 0); const nak = bits[8];
      out.push({ t: t0, t2: t, text: first ? `0x${(byte >> 1).toString(16).padStart(2, '0')} ${byte & 1 ? 'L' : 'E'}` : '0x' + byte.toString(16).padStart(2, '0'), err: nak, kind: first ? 'addr' : 'data' }); first = false; bits = []; } }
    c = v; }
  return out; }

/* ---------- Panel ---------- */
export function instrumentsPanel({ el, btn, download, getRec, getNames, getSerial, isRunning }) {
  const root = el('div', { class: 'tl-ins' }); let tab = 'la', frozen = false, span = 20000, end = 0, chans = null, dec = { kind: 'none', a: '', b: '', baud: 115200 };
  const cv = el('canvas', { class: 'tl-ins-cv' }); const info = el('small', { class: 'tl-ins-info' });
  const chanSel = el('select', { class: 'txt mini', multiple: false, on: { change: e => { const v = e.target.value; if (!v) return; chans = chans || []; if (!chans.includes(v)) chans.push(v); e.target.value = ''; draw(); } } });
  const decSel = el('select', { class: 'txt mini', on: { change: e => { dec.kind = e.target.value; fillDec(); draw(); } } }, el('option', { value: 'none' }, 'Sin decodificar'), el('option', { value: 'uart' }, 'UART'), el('option', { value: 'i2c' }, 'I2C'));
  const decA = el('select', { class: 'txt mini', on: { change: e => { dec.a = e.target.value; draw(); } } }), decB = el('select', { class: 'txt mini', on: { change: e => { dec.b = e.target.value; draw(); } } });
  const baud = el('select', { class: 'txt mini', on: { change: e => { dec.baud = +e.target.value; draw(); } } }, ...[9600, 19200, 38400, 57600, 115200].map(b => el('option', { value: b, selected: b === 115200 }, b + ' bps')));
  const zoomSel = el('select', { class: 'txt mini', on: { change: e => { span = +e.target.value; draw(); } } }, ...[[200, '0,2 ms'], [1000, '1 ms'], [5000, '5 ms'], [20000, '20 ms'], [100000, '100 ms'], [500000, '0,5 s'], [2000000, '2 s'], [10000000, '10 s']].map(([v, l]) => el('option', { value: v, selected: v === span }, l)));
  const freeze = btn('⏸ Congelar', () => { frozen = !frozen; freeze.textContent = frozen ? '▶ Seguir' : '⏸ Congelar'; draw(); }, 'mini-b');
  const laBar = el('div', { class: 'tl-ins-bar' }, el('span', {}, 'Canales'), chanSel, btn('Todos', () => { chans = null; draw(); }, 'mini-b'), el('span', {}, 'Ventana'), zoomSel, freeze, decSel, decA, decB, baud,
    btn('💾 VCD', () => { const r = getRec(); if (!r || !r.total) return; download(new Blob([r.vcd(getNames())], { type: 'text/plain' }), 'captura.vcd'); }, 'mini-b'));
  const plBar = el('div', { class: 'tl-ins-bar' }, el('span', { class: 'note' }, 'Imprime números con print() / Serial.println() (varios separados por comas o espacios, o «nombre:valor») y aquí salen en gráfica.'));
  const tabs = el('div', { class: 'tl-ins-tabs' }, btn('📈 Analizador lógico', () => setTab('la'), 'mini-b on'), btn('📉 Trazador serie', () => setTab('pl'), 'mini-b'));
  root.append(tabs, laBar, plBar, cv, info); plBar.hidden = true;
  function setTab(t) { tab = t; tabs.children[0].classList.toggle('on', t === 'la'); tabs.children[1].classList.toggle('on', t === 'pl'); laBar.hidden = t !== 'la'; plBar.hidden = t !== 'pl'; draw(); }
  function fillDec() { const pins = (getRec() && getRec().pins()) || []; const opt = (sel, label) => { sel.innerHTML = ''; sel.append(el('option', { value: '' }, label), ...pins.map(p => el('option', { value: p }, (getNames()[p] || p)))); };
    decA.hidden = decB.hidden = baud.hidden = true; if (dec.kind === 'uart') { opt(decA, 'TX…'); decA.hidden = baud.hidden = false; } if (dec.kind === 'i2c') { opt(decA, 'SDA…'); opt(decB, 'SCL…'); decA.hidden = decB.hidden = false; } }
  fillDec();
  // Arrastrar con el ratón: mover en el tiempo (congela)
  let drag = null; cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, end }; frozen = true; freeze.textContent = '▶ Seguir'; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (drag) { end = drag.end - (e.clientX - drag.x) / cv.clientWidth * span; draw(); } else hover = e.offsetX; if (!isRunning() || frozen) draw(); });
  cv.addEventListener('pointerup', () => { drag = null; }); cv.addEventListener('pointerleave', () => { hover = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); span = Math.max(50, Math.min(2e7, span * (e.deltaY > 0 ? 1.25 : 0.8))); draw(); }, { passive: false });
  let hover = null, lastPins = '';
  function draw() {
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return; const dpr = devicePixelRatio || 1; if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0b0e13'; g.fillRect(0, 0, W, H); g.font = '11px ui-monospace,monospace';
    if (tab === 'pl') return drawPlot(g, W, H);
    const rec = getRec(); if (!rec) { g.fillStyle = '#777'; g.fillText('Pulsa ▶ para empezar a capturar', 12, 20); return; }
    const pinsNow = rec.pins().join(); if (pinsNow !== lastPins) { lastPins = pinsNow; const names = getNames(); chanSel.innerHTML = ''; chanSel.append(el('option', { value: '' }, '+ canal'), ...rec.pins().map(p => el('option', { value: p }, names[p] || p))); fillDec(); }
    const now = rec.now ? rec.now() : 0; if (!frozen) end = now; const a = end - span, b = end; const LW = 64; const pins = (chans || rec.pins().filter(p => rec.ch.get(p).t.length > 1)).filter(p => rec.ch.has(p)).slice(0, 12);
    const rows = pins.length + (dec.kind !== 'none' ? 1 : 0); const rh = Math.max(16, Math.min(34, (H - 18) / Math.max(1, rows))); const X = t => LW + (t - a) / span * (W - LW);
    // cuadrícula de tiempo
    g.strokeStyle = '#1c222c'; g.fillStyle = '#59606e'; const step = niceStep(span / 8); for (let t = Math.ceil(a / step) * step; t < b; t += step) { const x = X(t); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); if (x > LW + 30 && x < W - 40) g.fillText('+' + fmtT(t - a), x + 2, H - 4); }
    const names = getNames();
    pins.forEach((p, i) => { const y0 = 4 + i * rh, hi = y0 + 3, lo = y0 + rh - 5; const c = rec.ch.get(p); g.fillStyle = '#aab'; g.fillText((names[p] || p).slice(0, 9), 4, y0 + rh / 2 + 3);
      g.strokeStyle = COLORS[i % COLORS.length]; g.lineWidth = 1.5; g.beginPath(); let lv = rec.at(p, a); g.moveTo(LW, lv ? hi : lo);
      let k = lowerBound(c.t, a); let lastX = LW;
      for (; k < c.t.length && c.t[k] <= b; k++) { const x = X(c.t[k]); if (x - lastX < 0.5 && k + 1 < c.t.length && c.t[k + 1] <= b) { lv = c.v[k]; continue; } g.lineTo(x, lv ? hi : lo); g.lineTo(x, c.v[k] ? hi : lo); lv = c.v[k]; lastX = x; }
      g.lineTo(W, lv ? hi : lo); g.stroke(); });
    if (dec.kind !== 'none') { const y0 = 4 + pins.length * rh; let items = [];
      if (dec.kind === 'uart' && dec.a) items = decodeUART(rec, dec.a, a, b, dec.baud); if (dec.kind === 'i2c' && dec.a && dec.b) items = decodeI2C(rec, dec.a, dec.b, a, b);
      g.fillStyle = '#aab'; g.fillText(dec.kind.toUpperCase(), 4, y0 + rh / 2 + 3);
      for (const it of items) { const x1 = X(it.t), x2 = Math.max(x1 + 14, X(it.t2)); if (x2 < LW || x1 > W) continue; g.fillStyle = it.err ? '#5a1d16' : it.kind === 'addr' ? '#3a2a5a' : '#1d3a2a'; g.fillRect(x1, y0 + 2, x2 - x1, rh - 6); g.fillStyle = it.err ? '#ff9b8f' : '#e6e6e6'; if (x2 - x1 > 12) g.fillText(it.text, x1 + 2, y0 + rh / 2 + 3); } }
    // cursor y medidas
    let txt = `${rec.total} flancos · desde ${fmtT(a)} · ventana ${fmtT(span)}${frozen ? ' · congelado (arrastra para moverte, rueda para zoom)' : ''}`;
    if (hover != null && hover > LW) { const t = a + (hover - LW) / (W - LW) * span; g.strokeStyle = '#fff6'; g.beginPath(); g.moveTo(hover, 0); g.lineTo(hover, H); g.stroke(); txt = `t = ${fmtT(t)} · ` + pins.slice(0, 4).map(p => { const s = rec.stats(p, a, b); return `${names[p] || p}: ${rec.at(p, t)}${s && s.freq > 0 ? ` (${fmtHz(s.freq)}, ${(s.duty * 100).toFixed(0)} %)` : ''}`; }).join(' · '); }
    info.textContent = txt;
  }
  // Trazador serie
  let series = new Map(), lastLen = 0;
  function feed() { const s = getSerial(); if (s.length < lastLen) { series = new Map(); lastLen = 0; } const chunk = s.slice(lastLen); const nl = chunk.lastIndexOf('\n'); if (nl < 0) return; lastLen += nl + 1;
    for (const line of chunk.slice(0, nl).split('\n')) { const parts = line.trim().split(/[\s,;\t]+/).filter(Boolean); let k = 0;
      for (const p of parts) { const m = /^([A-Za-z_][\w ]*)[:=](-?[\d.]+(?:e-?\d+)?)$/.exec(p); const name = m ? m[1] : 'v' + (++k); const val = m ? +m[2] : +p; if (!isFinite(val) || (!m && !/^-?[\d.]+(e-?\d+)?$/.test(p))) continue;
        if (!series.has(name)) series.set(name, []); const arr = series.get(name); arr.push(val); if (arr.length > 600) arr.shift(); } } }
  function drawPlot(g, W, H) { feed(); if (!series.size) { g.fillStyle = '#777'; g.fillText('Sin números todavía', 12, 20); info.textContent = ''; return; }
    let mn = Infinity, mx = -Infinity; for (const a of series.values()) for (const v of a) { if (v < mn) mn = v; if (v > mx) mx = v; } if (mn === mx) { mn -= 1; mx += 1; } const pad = (mx - mn) * 0.08; mn -= pad; mx += pad;
    const Y = v => H - 16 - (v - mn) / (mx - mn) * (H - 24); g.strokeStyle = '#1c222c'; g.fillStyle = '#59606e'; for (let i = 0; i <= 4; i++) { const v = mn + (mx - mn) * i / 4, y = Y(v); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.fillText(+v.toPrecision(4) + '', 4, y - 2); }
    let i = 0; const leg = []; for (const [name, a] of series) { const col = COLORS[i++ % COLORS.length]; g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); a.forEach((v, k) => { const x = W - (a.length - 1 - k) * (W / 600); k ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)); }); g.stroke(); leg.push(`${name}: ${+a[a.length - 1].toPrecision(5)}`); }
    info.textContent = leg.join(' · '); }
  let raf = 0; const tick = () => { raf = 0; if (!root.isConnected) return; if (isRunning() && !frozen) draw(); else if (tab === 'pl') draw(); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick); new ResizeObserver(() => draw()).observe(cv);
  return { el: root, draw, reset() { series = new Map(); lastLen = 0; frozen = false; freeze.textContent = '⏸ Congelar'; } };
}
function lowerBound(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return Math.max(0, lo - 1); }
function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); const m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
const trim = x => x.includes('.') ? x.replace(/0+$/, '').replace(/\.$/, '') : x;
export const fmtT = us => (Math.abs(us) >= 1e6 ? trim((us / 1e6).toFixed(3)) + ' s' : Math.abs(us) >= 1e3 ? trim((us / 1e3).toFixed(2)) + ' ms' : trim(us.toFixed(us < 10 ? 2 : 0)) + ' µs').replace('.', ',');
const fmtHz = f => f >= 1e6 ? (f / 1e6).toFixed(2) + ' MHz' : f >= 1e3 ? (f / 1e3).toFixed(2) + ' kHz' : f.toFixed(1) + ' Hz';
