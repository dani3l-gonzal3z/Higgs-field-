// 🚁 Dron del Taller: vuelo de un multirrotor, el mundo (un pájaro que vuela, una zona que mapear) y el piloto de Plató.
// Sin DOM: se puede simular en Node. La vista 3D y las cámaras están en drone3d.js; el enlace con la RDK X5, en rdklink.js.
//
// Ejes: los de three.js por dentro (x este, y arriba, z sur). Hacia fuera (telemetría y órdenes) se usa ENU, como ROS:
//   x = este, y = norte, z = arriba; guiñada (yaw) en radianes, 0 = mirando al este, positiva girando a la izquierda.
// Órdenes que entiende el dron (las mismas venga de la RDK o del piloto de Plató):
//   { t:'cmd', vx, vy, vz, yaw_rate, frame:'enu'|'body' }   velocidad (m/s, rad/s); en 'body': vx adelante, vy izquierda
//   { t:'cmd', mode:'pos', x, y, z, yaw }                    ir a un punto (ENU)
//   { t:'gimbal', pitch }                                    inclinación de la cámara en grados (0 al frente, -90 al suelo)
//   { t:'despega', alt } · { t:'aterriza' }

export const CAM = { w: 640, h: 360, hfov: 80, baseline: 0.06 }; // la cámara doble de la RDK X5 (dos MIPI, 6 cm entre ellas)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const enu = p => [p[0], -p[2], p[1]];              // three → ENU
export const fromEnu = e => [e[0], e[2], -e[1]];          // ENU → three

/* ---------- El dron ---------- */
export class Drone {
  constructor() { this.reset(); }
  reset() { this.p = [0, 0, 0]; this.v = [0, 0, 0]; this.yaw = Math.PI / 2; this.gimbal = -20; this.bat = 100; this.flying = false; this.cmd = null; this.cmdT = -1e9; this.t = 0; this.tilt = [0, 0]; this.home = [0, 0, 0]; this.crash = ''; this.alt = 12; }
  // Una orden (ENU). La guarda con su hora: sin órdenes nuevas en 1 s, el dron se queda quieto en el aire (vigilancia)
  command(c) {
    if (!c) return; if (c.t === 'gimbal') { this.gimbal = clamp(+c.pitch || 0, -90, 20); return; }
    if (c.t === 'despega') { if (!this.flying) { this.flying = true; this.home = [...this.p]; this.crash = ''; } this.alt = clamp(+c.alt || 12, 2, 120); this.cmd = { mode: 'alt' }; this.cmdT = this.t; return; }
    if (c.t === 'aterriza') { this.cmd = { mode: 'land' }; this.cmdT = this.t; return; }
    if (c.t === 'cmd') { if (!this.flying && (c.vz > 0 || (c.mode === 'pos' && c.z > 0.5))) { this.flying = true; this.home = [...this.p]; } this.cmd = c; this.cmdT = this.t; }
  }
  step(dt) {
    this.t += dt; if (!this.flying) { this.v = [0, 0, 0]; this.tilt = [0, 0]; return; }
    // velocidad deseada (en three) según la orden
    let want = [0, 0, 0], yr = 0; const c = this.cmd; const stale = this.t - this.cmdT > 1.0 && c && c.mode !== 'land' && c.mode !== 'alt' && c.mode !== 'pos';
    if (c && !stale) {
      if (c.mode === 'pos') { const tg = fromEnu([c.x, c.y, c.z]); const d = [tg[0] - this.p[0], tg[1] - this.p[1], tg[2] - this.p[2]]; const h = Math.hypot(d[0], d[2]);
        const sp = Math.min(c.vmax || 6, h * 0.8); want = [h > 0.01 ? d[0] / h * sp : 0, clamp(d[1] * 0.8, -3, 3), h > 0.01 ? d[2] / h * sp : 0]; if (c.yaw != null) yr = clamp(wrap(c.yaw - this.yaw) * 1.5, -1.5, 1.5); }
      else if (c.mode === 'alt') { want = [0, clamp((this.alt - this.p[1]) * 0.8, -3, 3), 0]; }
      else if (c.mode === 'land') { want = [0, this.p[1] > 3 ? -2 : -0.7, 0]; }
      else { let vx = +c.vx || 0, vy = +c.vy || 0; const vz = +c.vz || 0; yr = clamp(+c.yaw_rate || 0, -1.6, 1.6);
        if (c.frame === 'body') { const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw); [vx, vy] = [vx * cy - vy * sy, vx * sy + vy * cy]; }
        want = fromEnu([vx, vy, vz]); }
    }
    // límites del aparato
    const hs = Math.hypot(want[0], want[2]); if (hs > 12) { want[0] *= 12 / hs; want[2] *= 12 / hs; } want[1] = clamp(want[1], -3, 4);
    // respuesta: aceleración limitada (un multirrotor acelera inclinándose)
    const a = [0, 0, 0]; for (let i = 0; i < 3; i++) a[i] = clamp((want[i] - this.v[i]) / 0.6, -5, 5);
    for (let i = 0; i < 3; i++) { this.v[i] += a[i] * dt; this.p[i] += this.v[i] * dt; }
    this.tilt = [Math.atan2(a[2], 9.81), -Math.atan2(a[0], 9.81)]; this.yaw = wrap(this.yaw + yr * dt);
    // suelo, techo y valla
    if (this.p[1] <= 0) { this.p[1] = 0; if (this.v[1] < -3) this.crash = 'golpe contra el suelo'; this.v[1] = Math.max(0, this.v[1]); this.v[0] *= 0.5; this.v[2] *= 0.5;
      if (c && c.mode === 'land') { this.flying = false; this.cmd = null; this.v = [0, 0, 0]; } }
    if (this.p[1] > 120) { this.p[1] = 120; this.v[1] = Math.min(0, this.v[1]); }
    const r = Math.hypot(this.p[0], this.p[2]); if (r > 400) { this.p[0] *= 400 / r; this.p[2] *= 400 / r; }
    this.bat = Math.max(0, this.bat - dt * (0.05 + 0.004 * Math.hypot(...this.v)));
  }
  // Telemetría (ENU) tal como la recibe la RDK
  telem() { return { t: 'telem', time: +this.t.toFixed(3), pos: enu(this.p).map(x => +x.toFixed(3)), vel: enu(this.v).map(x => +x.toFixed(3)), yaw: +this.yaw.toFixed(4), gimbal: this.gimbal, bat: +this.bat.toFixed(1), volando: this.flying, casa: enu(this.home).map(x => +x.toFixed(2)) }; }
}

/* ---------- El mundo: el pájaro y la zona ---------- */
export class Bird {
  constructor(seed = 1) { this.s = seed; this.p = [30, 15, -40]; this.h = 0; this.vh = 0; this.sp = 6; this.flap = 0; }
  rnd() { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; }
  step(dt) { this.vh += (this.rnd() - 0.5) * 2.5 * dt; this.vh = clamp(this.vh * 0.98, -0.5, 0.5);
    const r = Math.hypot(this.p[0], this.p[2]); if (r > 110) { const toC = Math.atan2(-this.p[2], -this.p[0]); this.vh += clamp(wrap(toC - this.h), -1, 1) * dt * 1.5; }
    this.h += this.vh * dt; this.p[0] += Math.cos(this.h) * this.sp * dt; this.p[2] += Math.sin(this.h) * this.sp * dt;
    this.p[1] = clamp(this.p[1] + (this.rnd() - 0.5) * 2 * dt + (16 - this.p[1]) * 0.05 * dt, 6, 30); this.flap += dt * 9; }
}
// Zona rectangular (ENU, metros) y cuánto de ella han visto las cámaras mirando al suelo
export class Zone {
  constructor(a = [-30, 40], b = [30, 80]) { this.set(a, b); }
  set(a, b) { this.a = [Math.min(a[0], b[0]), Math.min(a[1], b[1])]; this.b = [Math.max(a[0], b[0]), Math.max(a[1], b[1])]; this.cell = 2; this.nx = Math.max(1, Math.ceil((this.b[0] - this.a[0]) / this.cell)); this.ny = Math.max(1, Math.ceil((this.b[1] - this.a[1]) / this.cell)); this.seen = new Uint8Array(this.nx * this.ny); }
  // Lo que ve una cámara casi vertical desde una altura: un rectángulo en el suelo
  mark(drone) { if (!drone.flying || drone.gimbal > -70) return; const e = enu(drone.p); const h = e[2]; if (h < 2) return;
    const hw = h * Math.tan(CAM.hfov / 2 * Math.PI / 180), hh = hw * CAM.h / CAM.w; const cy = Math.cos(drone.yaw), sy = Math.sin(drone.yaw);
    for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) { const x = this.a[0] + (i + 0.5) * this.cell - e[0], y = this.a[1] + (j + 0.5) * this.cell - e[1];
      const f = x * cy + y * sy, l = -x * sy + y * cy; if (Math.abs(f) < hh && Math.abs(l) < hw) this.seen[j * this.nx + i] = 1; } }
  get coverage() { let n = 0; for (const v of this.seen) n += v; return n / this.seen.length; }
}

/* ---------- Visión: buscar el pájaro en la imagen (manchas rojo-anaranjadas) ---------- */
// rgba: Uint8Array de w×h×4 (fila 0 arriba). Devuelve { box:[u0,v0,u1,v1] en píxeles de la imagen completa, cx, cy, area (0-1) } o null
export function findBird(rgba, w, h, full = CAM) {
  let n = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (r > 150 && r > g * 1.6 && r > b * 2.2 && g < 140) { n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (n < 2) return null; const kx = full.w / w, ky = full.h / h;
  return { box: [x0 * kx, y0 * ky, (x1 + 1) * kx, (y1 + 1) * ky], cx: (sx / n + 0.5) * kx, cy: (sy / n + 0.5) * ky, area: n / (w * h) };
}

/* ---------- Órdenes en castellano ---------- */
export function parseOrder(txt) {
  const s = String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); const num = (s.match(/(\d+(?:[.,]\d+)?)\s*(m\b|metros)/) || [])[1];
  if (/aterriz|tierra|baja del todo|posate/.test(s)) return { mision: 'aterrizar' };
  if (/casa|vuelve|regresa|rtl|vuelta a la base/.test(s)) return { mision: 'casa' };
  if (/sigue|persigue|seguir|acompana/.test(s)) return { mision: 'seguir', que: /pajaro|ave|gaviota|paloma/.test(s) ? 'pajaro' : 'pajaro' };
  if (/mapea|mapear|cartograf|barre|escanea|fotografia la zona|ortofoto/.test(s)) return { mision: 'mapear' };
  if (/rodeo|rodea|orbita|vuelta alrededor|circulo|gira alrededor|da una vuelta/.test(s)) return { mision: 'rodeo', radio: num ? parseFloat(num.replace(',', '.')) : null };
  if (/despeg|arriba|vuela|sube/.test(s)) return { mision: 'despegar', alt: num ? parseFloat(num.replace(',', '.')) : null };
  if (/para|quieto|espera|stop|alto/.test(s)) return { mision: 'esperar' };
  return null;
}

/* ---------- El piloto de Plató: las mismas misiones que mision.py en la RDK, para probar sin placa ---------- */
// on(msg) recibe telemetría ({t:'telem'}), órdenes ({t:'orden', texto, zona}) y detecciones de la cámara; tick() devuelve los mensajes a mandar al dron.
export class Pilot {
  constructor() { this.m = 'espera'; this.state = {}; this.telem = null; this.det = null; this.detT = -1e9; this.estado = 'En tierra, esperando órdenes'; this.zona = null; }
  on(msg) { if (msg.t === 'telem') this.telem = msg; else if (msg.t === 'det') { this.det = msg.bird; if (msg.bird) this.detT = this.telem ? this.telem.time : 0; } else if (msg.t === 'orden') this.order(msg.texto, msg.zona); }
  order(texto, zona) { const o = parseOrder(texto); if (zona) this.zona = zona; if (!o) { this.say(`No entiendo «${texto}». Prueba: despega, haz un rodeo, mapea la zona, sigue al pájaro, vuelve a casa, aterriza.`); return []; }
    this.m = o.mision === 'esperar' ? 'espera' : o.mision; this.state = { ...o, t0: this.telem ? this.telem.time : 0 }; this.out = [];
    if (o.mision === 'despegar') { this.out.push({ t: 'gimbal', pitch: -20 }, { t: 'despega', alt: o.alt || 12 }); this.say(`Despegando a ${o.alt || 12} m`); }
    if (o.mision === 'aterrizar') { this.out.push({ t: 'aterriza' }); this.say('Aterrizando'); }
    if (o.mision === 'esperar') this.say('Quieto en el aire');
    return this.out; }
  say(t) { this.estado = t; (this.log || (() => {}))(t); }
  tick() {
    const T = this.telem; const out = this.out || []; this.out = []; if (!T) return out; const [x, y, z] = T.pos; const yaw = T.yaw; const S = this.state;
    const vel = (vx, vy, vz, yr) => out.push({ t: 'cmd', frame: 'enu', vx: +vx.toFixed(3), vy: +vy.toFixed(3), vz: +vz.toFixed(3), yaw_rate: +yr.toFixed(3) });
    const goTo = (tx, ty, tz, vmax = 5, faceTravel = true) => { const dx = tx - x, dy = ty - y; const d = Math.hypot(dx, dy); const sp = Math.min(vmax, d * 0.7); const vz = clamp((tz - z) * 0.8, -2.5, 2.5);
      const yr = faceTravel && d > 2 ? clamp(wrap(Math.atan2(dy, dx) - yaw) * 1.2, -1, 1) : 0; vel(d > 0.05 ? dx / d * sp : 0, d > 0.05 ? dy / d * sp : 0, vz, yr); return d < 1.2 && Math.abs(tz - z) < 1; };
    switch (this.m) {
      case 'despegar': if (z > (S.alt || 12) - 0.6) { this.m = 'espera'; this.say(`En el aire a ${z.toFixed(0)} m. ¿Qué hago?`); } break;
      case 'espera': if (T.volando) vel(0, 0, 0, 0); break;
      case 'rodeo': {
        if (!S.c) { // centro: donde mira la cámara en el suelo (o 15 m delante)
          const pitch = T.gimbal * Math.PI / 180; const dist = pitch < -0.1 ? clamp(z / Math.tan(-pitch), 5, 30) : 15; S.c = [x + Math.cos(yaw) * dist, y + Math.sin(yaw) * dist]; S.r = clamp(S.radio || Math.hypot(S.c[0] - x, S.c[1] - y), 6, 30); S.ang = 0; S.last = Math.atan2(y - S.c[1], x - S.c[0]);
          out.push({ t: 'gimbal', pitch: -Math.round(Math.atan2(z, S.r) * 180 / Math.PI) }); this.say(`Rodeo de ${S.r.toFixed(0)} m de radio`); }
        const dx = x - S.c[0], dy = y - S.c[1], d = Math.hypot(dx, dy) || 1; const a = Math.atan2(dy, dx); S.ang += Math.abs(wrap(a - S.last)); S.last = a;
        const sp = 3.5, tx = -dy / d, ty = dx / d, kr = (S.r - d) * 0.8; const face = Math.atan2(-dy, -dx);
        vel(tx * sp + dx / d * kr, ty * sp + dy / d * kr, clamp(((S.z0 ??= z) - z) * 0.8, -1, 1), clamp(wrap(face - yaw) * 1.5, -1.2, 1.2));
        if (S.ang > Math.PI * 2) { this.m = 'espera'; this.say('Rodeo terminado'); } break; }
      case 'mapear': {
        if (!S.wp) { const zn = this.zona || [[x - 30, y + 20], [x + 30, y + 60]]; const [a, b] = [[Math.min(zn[0][0], zn[1][0]), Math.min(zn[0][1], zn[1][1])], [Math.max(zn[0][0], zn[1][0]), Math.max(zn[0][1], zn[1][1])]];
          // pasadas a lo largo de x; el ancho de la imagen queda de lado: cada pasada cubre 2·H·tan(campo/2), con un 25 % de solape
          const H = 25, sw = 2 * H * Math.tan(CAM.hfov / 2 * Math.PI / 180) * 0.75; const n = Math.max(1, Math.ceil((b[1] - a[1]) / sw)), step = (b[1] - a[1]) / n; S.wp = [];
          for (let k = 0; k < n; k++) { const yy = a[1] + step * (k + 0.5); S.wp.push(...(k % 2 ? [[b[0] + 4, yy], [a[0] - 4, yy]] : [[a[0] - 4, yy], [b[0] + 4, yy]])); }
          S.i = 0; S.H = H; out.push({ t: 'gimbal', pitch: -90 }); this.say(`Mapeando la zona: ${S.wp.length / 2} pasadas a ${H} m`); }
        const w = S.wp[S.i]; if (goTo(w[0], w[1], S.H, 5)) { S.i++; if (S.i >= S.wp.length) { this.m = 'espera'; out.push({ t: 'gimbal', pitch: -20 }); this.say('Zona mapeada'); } } break; }
      case 'seguir': {
        if (!S.g) { S.g = true; out.push({ t: 'gimbal', pitch: -8 }); this.say('Buscando al pájaro…'); }
        const age = T.time - this.detT;
        if (this.det && age < 0.4) { const b = this.det; const ex = (b.cx - CAM.w / 2) / (CAM.w / 2), ey = (b.cy - CAM.h / 2) / (CAM.h / 2);
          const fwd = clamp(3 + 2000 * (0.004 - b.area), -3, 11); const yr = clamp(-1.4 * ex, -1.4, 1.4); const vz = clamp(-3 * ey, -3, 3); // más pequeño = más lejos = más deprisa
          S.lastV = [Math.cos(yaw) * fwd, Math.sin(yaw) * fwd, vz, yr]; vel(...S.lastV); if (!S.lock) { S.lock = true; this.say('¡Lo tengo! Siguiéndolo'); } }
        else if (S.lastV && age < 1.5) vel(...S.lastV); // un parpadeo de la detección: sigue como iba
        else { vel(0, 0, 0, 0.6); if (S.lock) { S.lock = false; this.say('Lo he perdido; buscando…'); } } break; }
      case 'casa': { const h = T.casa || [0, 0, 0]; if (!S.up) { S.up = true; this.say('Volviendo a casa'); out.push({ t: 'gimbal', pitch: -20 }); }
        if (goTo(h[0], h[1], Math.max(z, 12), 7)) { this.m = 'aterrizar'; out.push({ t: 'aterriza' }); this.say('En casa: aterrizando'); } break; }
      case 'aterrizar': if (!T.volando) { this.m = 'espera'; this.say('En tierra'); } break;
    }
    return out;
  }
}

/* ---------- Dónde cae un punto en la imagen de la cámara izquierda ---------- */
// p: punto (three). Devuelve { u, v, dist } en píxeles o null si queda detrás o fuera
export function project(drone, p, cam = CAM, right = false) {
  const e = enu(p), c = enu(drone.p); const y = drone.yaw, pt = drone.gimbal * Math.PI / 180;
  const f = [Math.cos(y) * Math.cos(pt), Math.sin(y) * Math.cos(pt), Math.sin(pt)], l = [-Math.sin(y), Math.cos(y), 0];
  const up = [f[1] * l[2] - f[2] * l[1], f[2] * l[0] - f[0] * l[2], f[0] * l[1] - f[1] * l[0]];
  const o = right ? [c[0] - l[0] * cam.baseline, c[1] - l[1] * cam.baseline, c[2]] : c; const d = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
  const xf = d[0] * f[0] + d[1] * f[1] + d[2] * f[2]; if (xf < 0.3) return null; const xl = d[0] * l[0] + d[1] * l[1] + d[2] * l[2], xu = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
  const fx = cam.w / 2 / Math.tan(cam.hfov / 2 * Math.PI / 180); const u = cam.w / 2 - fx * xl / xf, v = cam.h / 2 - fx * xu / xf;
  if (u < 0 || u > cam.w || v < 0 || v > cam.h) return null; return { u, v, dist: xf, fx };
}
