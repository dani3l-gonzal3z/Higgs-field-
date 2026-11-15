// Dibujante de placas del Taller. Cada placa se describe con datos (patas de cada lado, separación entre filas,
// qué lleva encima) y de ahí salen el dibujo y la posición de cada pata. Sin SVG ni tablas de terceros.
//   · Las patas van en la rejilla de 0,1" (9,6 px) a la separación real de la placa: se clavan en la protoboard.
//   · La serigrafía de cada pata va coloreada según lo que es (GND, 5 V, 3,3 V, analógica, solo entrada).
//   · Añadir una placa nueva son unas líneas: mira los ejemplos de boards.js.
import { PITCH as P } from './protoboard.js';

const EDGE = 5.4;                       // del centro de la pata al borde de la placa
const esc = s => String(s).replace(/[<&>]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));
const n = v => +(+v).toFixed(2);
const isLight = hex => { const v = parseInt(hex.slice(1), 16); return ((v >> 16) * 299 + ((v >> 8) & 255) * 587 + (v & 255) * 114) / 1000 > 150; };

// Colores de la serigrafía según la clase de la pata
export const PIN_COLORS = { gnd: '#aab4bd', '5v': '#ff6b6b', '3v3': '#ffa94d', adc: '#7ee08f', in: '#ffd43b', io: null, nc: null };
export const PIN_LEGEND = [['gnd', 'GND'], ['5v', '5 V'], ['3v3', '3,3 V'], ['adc', 'analógica'], ['in', 'solo entrada']];

// Placa de dos filas de patas (DIP). spec:
//   left / right  nombres de las patas de arriba abajo (null = hueco)
//   cols          separación entre las dos filas, en pasos de 0,1"
//   head / tail   espacio antes de la primera pata y después de la última (px)
//   color, items  color de la placa y lo que lleva encima (ver ITEM más abajo)
//   landscape     la placa se dibuja tumbada (la fila izquierda queda abajo)
//   short         nombres abreviados para la serigrafía: { ADC_VREF: 'VREF' }
export function dip(spec) {
  const { left, right, cols, head = 12, tail = 12, landscape = false } = spec;
  const rows = Math.max(left.length, right.length); const W = EDGE * 2 + cols * P, H = head + (rows - 1) * P + tail;
  const fin = (x, y) => landscape ? { x: n(y), y: n(W - x) } : { x: n(x), y: n(y) };
  const pins = [];
  left.forEach((name, i) => name && pins.push({ name, ...fin(EDGE, head + i * P), side: 'l', row: i }));
  right.forEach((name, i) => name && pins.push({ name, ...fin(W - EDGE, head + i * P), side: 'r', row: i }));
  const leds = {};
  for (const it of spec.items || []) if (it.t === 'led' && it.id) { const [x, y] = at(it, W, H); leds[it.id] = { ...fin(x, y), size: it.size || 5.5, color: it.color === undefined ? '#fff' : it.color }; }
  return { w: n(landscape ? H : W), h: n(landscape ? W : H), pins, leds, grid: true, draw: { kind: 'dip', ...spec, W, H } };
}
// Posición de un elemento: x desde el centro (dx) y desde arriba (y) o desde abajo (b)
function at(it, W, H) { return [W / 2 + (it.dx || 0), it.b != null ? H - it.b : (it.y || 0)]; }

/* ---------- Lo que puede llevar una placa encima ---------- */
const ITEM = {
  // Conector USB en un extremo. kind: 'c' | 'micro'. end: 'top' | 'bottom'
  usb(it, W, H) {
    const c = it.kind === 'c'; const w = c ? 21 : 18, h = c ? 15 : 12; const x = W / 2 + (it.dx || 0) - w / 2, y = it.end === 'bottom' ? H - h + 1.5 : -1.5;
    const my = it.end === 'bottom' ? y + h - 4.2 : y + 1.6;
    return `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="${c ? 3.2 : 1.6}" fill="url(#metal)" stroke="#7d848b" stroke-width=".7"/><rect x="${n(x + 3)}" y="${n(my)}" width="${w - 6}" height="2.6" rx="1.3" fill="#3a3f44"/>`;
  },
  // Módulo con blindaje metálico. antenna: 'top' | 'bottom' dibuja la antena de pista fuera del blindaje
  can(it, W, H) {
    const [cx, y] = at(it, W, H); const w = it.w, h = it.h, x = cx - w / 2; let s = '';
    if (it.antenna) { const ah = it.ah || 15, ay = it.antenna === 'top' ? y - ah : y + h; const up = it.antenna === 'top';
      s += `<rect x="${n(x)}" y="${n(ay)}" width="${w}" height="${ah}" fill="#0d0d0d"/>`;
      const y1 = up ? ay + ah - 2 : ay + 2, y2 = up ? ay + 3 : ay + ah - 3; const step = (w - 12) / 6; let d = `M${n(x + 4)} ${n(y1)}V${n(y2)}`;
      for (let i = 0; i < 6; i++) d += `h${n(step / 2)}V${n(i % 2 ? y2 : (y1 + y2) / 2 + (up ? 1 : -1))}h${n(step / 2)}V${n(y2)}`;
      s += `<path d="${d}h4" fill="none" stroke="#c9a93f" stroke-width="1.5" stroke-linejoin="round"/>`; }
    s += `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="1.8" fill="url(#metal)" stroke="#7d848b" stroke-width=".7"/><rect x="${n(x + 2.2)}" y="${n(y + 2.2)}" width="${w - 4.4}" height="${h - 4.4}" rx="1" fill="none" stroke="#ffffff66" stroke-width=".6"/>`;
    if (it.text) s += `<text x="${n(cx)}" y="${n(y + h / 2 + 1.8)}" class="c" fill="#4a5056">${esc(it.text)}</text>`;
    return s;
  },
  // Chip negro con sus patitas. turn: girado 45° (como el STM32 de la Blue Pill)
  chip(it, W, H) {
    const [cx, cy] = at(it, W, H); const z = it.size || 18, k = Math.max(4, Math.round(z / 3)); let legs = '';
    for (let i = 0; i < k; i++) { const o = -z / 2 + (i + 0.5) * z / k; legs += `M${n(o)} ${n(-z / 2 - 1.6)}v1.6M${n(o)} ${n(z / 2)}v1.6M${n(-z / 2 - 1.6)} ${n(o)}h1.6M${n(z / 2)} ${n(o)}h1.6`; }
    const body = `<path d="${legs}" stroke="#c8ccd0" stroke-width=".9"/><rect x="${n(-z / 2)}" y="${n(-z / 2)}" width="${z}" height="${z}" rx="1" fill="#1c1c1e" stroke="#4a4a4d" stroke-width=".6"/><circle cx="${n(-z / 2 + 2.4)}" cy="${n(-z / 2 + 2.4)}" r=".9" fill="#55585c"/>`;
    return `<g transform="translate(${n(cx)} ${n(cy)})${it.turn ? ' rotate(45)' : ''}">${body}</g>` + (it.text ? `<text x="${n(cx)}" y="${n(cy + 1.7)}" class="c" fill="#b9bdc2">${esc(it.text)}</text>` : '');
  },
  // Pulsador
  btn(it, W, H) {
    const [cx, cy] = at(it, W, H); const tx = it.text ? `<text x="${n(cx)}" y="${n(cy + (it.above ? -5.6 : 9))}" class="t">${esc(it.text)}</text>` : '';
    return `<rect x="${n(cx - 4.5)}" y="${n(cy - 3.6)}" width="9" height="7.2" rx="1" fill="url(#metal)" stroke="#7d848b" stroke-width=".6"/><circle cx="${n(cx)}" cy="${n(cy)}" r="2" fill="${it.color || '#26282b'}"/>${tx}`;
  },
  // LED de la placa: el cuerpo apagado; el brillo lo pone el elemento encima (id) según la simulación
  led(it, W, H) {
    const [cx, cy] = at(it, W, H); const z = it.size || 5.5; const tx = it.text ? `<text x="${n(cx)}" y="${n(cy + z / 2 + 5.4)}" class="t">${esc(it.text)}</text>` : '';
    return `<rect x="${n(cx - z / 2)}" y="${n(cy - z * 0.32)}" width="${n(z)}" height="${n(z * 0.64)}" rx=".8" fill="${it.off || '#e9e6dc'}" stroke="#8d8a80" stroke-width=".5"/>${tx}`;
  },
  // Componente de superficie cualquiera (regulador, condensador, cristal, puente…)
  smd(it, W, H) { const [cx, cy] = at(it, W, H); return `<rect x="${n(cx - it.w / 2)}" y="${n(cy - it.h / 2)}" width="${it.w}" height="${it.h}" rx="${it.r ?? 0.8}" fill="${it.c || '#2a2a2c'}" stroke="${it.s || '#0006'}" stroke-width=".5"/>`; },
  // Cámara (ESP32-CAM)
  lens(it, W, H) { const [cx, cy] = at(it, W, H); const r = it.r || 12; return `<rect x="${n(cx - r - 3)}" y="${n(cy - r - 3)}" width="${2 * r + 6}" height="${2 * r + 6}" rx="2" fill="#17181a" stroke="#3a3c40" stroke-width=".6"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${r}" fill="#0c0d0f" stroke="#55585c"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.55)}" fill="#1b2a44"/><circle cx="${n(cx - r * 0.2)}" cy="${n(cy - r * 0.2)}" r="${n(r * 0.16)}" fill="#9fc0ff" opacity=".8"/>`; },
  // Pads dorados sueltos (puntos de prueba, SWD…)
  pads(it, W, H) { const [cx, cy] = at(it, W, H); const k = it.n || 3; let s = ''; for (let i = 0; i < k; i++) s += `<circle cx="${n(cx + (i - (k - 1) / 2) * (it.gap || 7))}" cy="${n(cy)}" r="2.2" fill="#d9b44a" stroke="#a8842a" stroke-width=".5"/>`; return s; },
  text() { return ''; }, // el texto se pinta aparte, siempre derecho aunque la placa vaya tumbada
};

export function drawDip(a, cls = () => 'io') {
  const d = a.draw, W = d.W, H = d.H; const light = isLight(d.color); const ink = light ? '#22252a' : '#f4f5f6', dim = light ? '#22252a88' : '#ffffff80';
  const short = d.short || {}; const show = name => short[name] ?? name.replace(/\.\d+$/, '').replace(/^GPIO/, '');
  let g = `<rect x=".5" y=".5" width="${n(W - 1)}" height="${n(H - 1)}" rx="${d.r ?? 4}" fill="${d.color}" stroke="#0007"/><rect x="1.6" y="1.6" width="${n(W - 3.2)}" height="${n(H - 3.2)}" rx="${(d.r ?? 4) - 1}" fill="none" stroke="#ffffff14"/>`;
  for (const it of d.items || []) g += (ITEM[it.t] || (() => ''))(it, W, H);
  const fs = d.fs || 5.2;
  for (const side of ['l', 'r']) {
    const list = side === 'l' ? d.left : d.right; const x = side === 'l' ? EDGE : W - EDGE;
    list.forEach((name, i) => { if (!name) return; const y = d.head + i * P; const c = cls(name); const col = PIN_COLORS[c] || (c === 'nc' ? dim : ink);
      g += `<circle cx="${n(x)}" cy="${n(y)}" r="2.9" fill="#d9b44a" stroke="#a8842a" stroke-width=".5"/><circle cx="${n(x)}" cy="${n(y)}" r="1.25" fill="#17181a"/>`;
      g += `<text x="${n(side === 'l' ? x + 4.6 : x - 4.6)}" y="${n(y + fs * 0.36)}" font-size="${fs}" fill="${col}" text-anchor="${side === 'l' ? 'start' : 'end'}" class="p">${esc(show(name))}</text>`; });
  }
  // Textos (nombre de la placa…): fuera del grupo girado para que se lean derechos
  let texts = '';
  for (const it of d.items || []) if (it.t === 'text') { const [x, y] = at(it, W, H); const fx = d.landscape ? y : x, fy = d.landscape ? W - x : y;
    texts += `<text x="${n(fx)}" y="${n(fy)}" font-size="${it.size || 6.4}" fill="${it.fill || ink}" class="b"${it.turn && !d.landscape ? ` transform="rotate(-90 ${n(fx)} ${n(fy)})"` : ''}>${esc(it.text)}</text>`; }
  const css = `text{font-family:ui-monospace,Menlo,Consolas,monospace}text.p{font-weight:600}text.c{font-size:4.6px;text-anchor:middle}text.t{font-size:4px;text-anchor:middle;fill:${dim}}text.b{font-family:system-ui,sans-serif;font-weight:700;text-anchor:middle}`;
  const defs = `<defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3e6e9"/><stop offset=".5" stop-color="#c4c9ce"/><stop offset="1" stop-color="#aab0b6"/></linearGradient></defs>`;
  const body = d.landscape ? `<g transform="translate(0 ${n(W)}) rotate(-90)">${g}</g>` : g;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${a.w}" height="${a.h}" viewBox="0 0 ${a.w} ${a.h}"><style>${css}</style>${defs}${body}${texts}</svg>`;
}
