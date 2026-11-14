// Planta industrial del Taller: módulos (cintas, sensores, cilindros, básculas…), piezas que circulan y su física.
// Sin DOM: se puede simular en Node. El 3D y el editor están en plant3d.js.
import { Body, collider, step as rigidStep, quatY } from './rigid.js';
// Coordenadas en metros: X y Z en el suelo, Y hacia arriba. Cada módulo tiene posición (x, z), giro (grados) y parámetros.
// E/S vistas desde el controlador: 'in' = el controlador LEE (sensor), 'out' = el controlador ESCRIBE (actuador).

const D2R = Math.PI / 180;
export const COLORS = { rojo: '#d33a2c', azul: '#2f6fd6', verde: '#2fa84f', amarillo: '#f2c230', blanco: '#e8e8e8', negro: '#2a2a2a', metal: '#9aa3ab' };

// ── Catálogo de módulos ──
// io: [clave, sentido, tipo, etiqueta]. tipo: 'd' digital · 'a' analógica · 'enc' encoder · 'pwm' velocidad por PWM o analógica
export const MODULES = {
  cinta: { name: 'Cinta transportadora', icon: '➡️', group: 'transporte', params: { largo: 2, ancho: 0.4, alto: 0.8, vmax: 0.4, ppm: 500, barandillas: true, siempre: false },
    io: [['motor', 'out', 'd', 'Motor en marcha'], ['inversa', 'out', 'd', 'Sentido inverso'], ['vel', 'out', 'pwm', 'Velocidad (PWM o analógica)'], ['enc', 'in', 'enc', 'Encoder del rodillo']],
    help: 'Lleva las piezas a lo largo de su eje. Con el motor parado, frena. «Siempre en marcha» la convierte en una rampa o cinta sin control.' },
  emisor: { name: 'Emisor de piezas', icon: '📦', group: 'transporte', params: { cada: 3, mezcla: 'rojo:1,azul:1', forma: 'caja', tam: 0.18, peso: 1, metal: 0, aleatorio: 0.3, modo: 'auto' },
    io: [['emitir', 'out', 'd', 'Soltar una pieza (flanco)']], help: 'Suelta piezas sobre lo que tenga debajo. «mezcla» = color:peso,…; «forma» = caja, cilindro, bola o mezcla; «metal» = proporción metálica (0-1).' },
  sumidero: { name: 'Contenedor', icon: '🗑', group: 'transporte', params: { largo: 0.6, ancho: 0.6, capacidad: 50 },
    io: [['lleno', 'in', 'd', 'Lleno']], help: 'Recoge lo que cae dentro y lo cuenta por tipo.' },
  fotocelula: { name: 'Fotocélula de barrera', icon: '🔦', group: 'sensores', params: { largo: 0.6, altura: 0.85, nc: false, fallo: 'ninguno' },
    io: [['det', 'in', 'd', 'Detecta']], help: 'Un haz entre dos postes: se corta cuando pasa una pieza. «nc» invierte la salida (normalmente cerrada).' },
  inductivo: { name: 'Sensor inductivo', icon: '🧲', group: 'sensores', params: { alcance: 0.06, altura: 0.85, fallo: 'ninguno' },
    io: [['det', 'in', 'd', 'Metal delante']], help: 'Solo ve piezas metálicas a menos de su alcance, por delante de su cara.' },
  color: { name: 'Sensor de color', icon: '🎨', group: 'sensores', params: { busca: 'rojo', alcance: 0.15, altura: 0.85, fallo: 'ninguno' },
    io: [['det', 'in', 'd', 'Ve el color buscado'], ['hay', 'in', 'd', 'Hay pieza delante']], help: 'Mira por delante y dice si la pieza es del color buscado.' },
  bascula: { name: 'Báscula', icon: '⚖️', group: 'sensores', params: { largo: 0.4, ancho: 0.4, altura: 0.8, vkg: 1, vmax: 3.3 },
    io: [['peso', 'in', 'a', 'Peso (V = kg × V/kg)']], help: 'Pesa lo que tenga encima (va bajo un tramo de cinta).' },
  empujador: { name: 'Cilindro empujador', icon: '🔩', group: 'actuadores', params: { carrera: 0.45, tiempo: 0.35, doble: false, fallo: 'ninguno' },
    io: [['ext', 'out', 'd', 'Sacar vástago'], ['ret', 'out', 'd', 'Meter vástago (doble efecto)'], ['in', 'in', 'd', 'Recogido (reed)'], ['out', 'in', 'd', 'Extendido (reed)']],
    help: 'Empuja hacia su frente. De simple efecto, vuelve solo al quitar la señal; de doble efecto necesita la orden de recoger.' },
  tope: { name: 'Tope', icon: '⛔', group: 'actuadores', params: { ancho: 0.45 },
    io: [['sube', 'out', 'd', 'Subir tope'], ['arriba', 'in', 'd', 'Tope arriba']], help: 'Una barra que sale y para las piezas.' },
  torre: { name: 'Baliza de máquina', icon: '🚦', group: 'mando', params: {},
    io: [['rojo', 'out', 'd', 'Rojo'], ['ambar', 'out', 'd', 'Ámbar'], ['verde', 'out', 'd', 'Verde'], ['sirena', 'out', 'd', 'Sirena']], help: 'Torre de luces de la máquina.' },
  panel: { name: 'Botonera', icon: '🎛', group: 'mando', params: {},
    io: [['marcha', 'in', 'd', 'Marcha (NA)'], ['paro', 'in', 'd', 'Paro (NC)'], ['seta', 'in', 'd', 'Seta de emergencia (NC)'], ['auto', 'in', 'd', 'Selector en automático'], ['luz', 'out', 'd', 'Piloto de marcha']],
    help: 'Pulsa los botones en 3D o en el panel. Paro y seta son normalmente cerrados: dan 1 en reposo, como en un armario de verdad.' },
};
export const GROUPS = [['transporte', 'Transporte'], ['sensores', 'Sensores'], ['actuadores', 'Actuadores'], ['mando', 'Mando']];
export const ioKey = (m, k) => `${m.id}.${k}`;

/* ---------- La planta ---------- */
export class Plant {
  constructor(data) { this.load(data || { modules: [], map: {} }); }
  // Dos asignaciones de E/S: a la placa simulada del Taller ('sim') o a los canales del útil HIL ('util')
  load(d) { this.modules = (d.modules || []).filter(m => MODULES[m.type]).map(m => ({ ...m, p: { ...MODULES[m.type].params, ...(m.p || {}) } })); this.maps = { sim: { ...((d.maps && d.maps.sim) || d.map || {}) }, util: { ...((d.maps && d.maps.util) || {}) } }; this.ctl = d.ctl === 'util' ? 'util' : 'sim'; this.force = {}; this.title = d.title || ''; this.exId = d.exId || ''; this.fisica = d.fisica === 'sencilla' ? 'sencilla' : 'rigida';
    // Placas: PLC1 es la del Taller (la del circuito); las demás (PLC2…) tienen su placa y su programa aquí. Cables entre placas: [['PLC1:GP14', 'PLC2:GP3']]
    this.ctls = (d.ctls || []).map(c => ({ id: c.id, board: c.board || 'pico', code: c.code || '' })); this.links = (d.links || []).map(l => [l[0], l[1]]); this.reset(); }
  addCtl(board = 'pico') { let n = 2; while (this.ctls.some(c => c.id === 'PLC' + n)) n++; const c = { id: 'PLC' + n, board, code: '' }; this.ctls.push(c); return c; }
  removeCtl(id) { this.ctls = this.ctls.filter(c => c.id !== id); for (const k of Object.keys(this.maps.sim)) if (String(this.maps.sim[k]).startsWith(id + ':')) delete this.maps.sim[k]; this.links = this.links.filter(l => !l.some(x => x.startsWith(id + ':'))); }
  get map() { return this.maps[this.ctl]; }
  toJSON() { return { title: this.title, exId: this.exId, fisica: this.fisica, ctl: this.ctl, ctls: this.ctls, links: this.links, modules: this.modules.map(({ id, type, x, z, rot, p }) => ({ id, type, x, z, rot, p })), maps: this.maps }; }
  reset() { this.sens = {}; this.outs = {}; this.items = []; this.t = 0; this.nextId = 1; this.state = {}; this.stats = { emitidas: 0, suelo: 0, por: {} }; for (const m of this.modules) this.state[m.id] = this.initState(m); this.ui = this.ui || {}; }
  initState(m) { switch (m.type) { case 'cinta': return { v: 0, pos: 0 }; case 'emisor': return { tLast: -99, prev: 0 }; case 'sumidero': return { n: 0, por: {} }; case 'empujador': return { x: 0 }; case 'tope': return { up: 0 }; case 'panel': return { seta: false }; default: return {}; } }
  add(type, x = 0, z = 0, rot = 0, p = {}) { const base = { cinta: 'C', emisor: 'E', sumidero: 'K', fotocelula: 'FC', inductivo: 'IN', color: 'CS', bascula: 'B', empujador: 'P', tope: 'T', torre: 'L', panel: 'PB' }[type] || 'M';
    let n = 1; while (this.modules.some(m => m.id === base + n)) n++; const m = { id: base + n, type, x, z, rot, p: { ...MODULES[type].params, ...p } }; this.modules.push(m); this.state[m.id] = this.initState(m); return m; }
  remove(id) { this.modules = this.modules.filter(m => m.id !== id); for (const map of Object.values(this.maps)) for (const k of Object.keys(map)) if (k.startsWith(id + '.')) delete map[k]; delete this.state[id]; this.items = this.items.filter(it => it.on !== id); }
  // Todas las señales de la planta: [clave, sentido, tipo, etiqueta, módulo]
  signals() { const out = []; for (const m of this.modules) for (const [k, dir, type, label] of MODULES[m.type].io) out.push([ioKey(m, k), dir, type, label, m]); return out; }
  // ── geometría ──
  frame(m) { const a = (m.rot || 0) * D2R; return { ux: Math.cos(a), uz: -Math.sin(a), vx: Math.sin(a), vz: Math.cos(a) }; } // u = eje largo (frente de la cinta), v = lateral
  local(m, x, z) { const f = this.frame(m); const dx = x - m.x, dz = z - m.z; return [dx * f.ux + dz * f.uz, dx * f.vx + dz * f.vz]; }
  world(m, lx, lz) { const f = this.frame(m); return [m.x + lx * f.ux + lz * f.vx, m.z + lx * f.uz + lz * f.vz]; }
  // Superficie bajo un punto (la cinta más alta que no esté por encima del objeto)
  support(x, z, y) { let best = null; for (const m of this.modules) { if (m.type !== 'cinta') continue; const [lx, lz] = this.local(m, x, z); if (Math.abs(lx) <= m.p.largo / 2 && Math.abs(lz) <= m.p.ancho / 2 && m.p.alto <= y + 0.02 && (!best || m.p.alto > best.p.alto)) best = m; } return best; }
  // Paleta del cilindro (rectángulo en el mundo) y su avance
  paddle(m) { const s = this.state[m.id]; const ext = s.x * m.p.carrera; const [cx, cz] = this.world(m, 0, 0.08 + ext); return { m, cx, cz, hu: 0.18, hv: 0.02, f: this.frame(m), ext }; }
  stopBar(m) { const s = this.state[m.id]; return s.up > 0.5 ? { m, cx: m.x, cz: m.z, hu: 0.02, hv: m.p.ancho / 2, f: this.frame(m) } : null; }

  // ── un paso de simulación ──
  // io.out(clave) → valor de una salida del controlador (bool o 0..1); io.in(clave, valor) → la planta fija un sensor
  step(dt, io) {
    this.t += dt; const S = this.state; const ui = this.ui; const out = k => { const v = this.force[k] != null ? this.force[k] : this.map[k] != null ? io.out(k) : false; this.outs[k] = v; return v; };
    const ioIn = io.in; io = { ...io, in: (k, v) => { if (this.force[k] != null) v = this.force[k]; this.sens[k] = v; if (this.map[k] != null) ioIn(k, v); } };
    // actuadores
    for (const m of this.modules) { const s = S[m.id]; const key = k => ioKey(m, k); const mapped = k => this.map[key(k)] != null;
      if (m.type === 'cinta') { const on = m.p.siempre || !!out(key('motor')); const dirn = out(key('inversa')) ? -1 : 1; const sp = mapped('vel') ? Math.max(0, Math.min(1, +out(key('vel')) || 0)) : 1;
        const target = on ? m.p.vmax * sp * dirn : 0; s.v += (target - s.v) * Math.min(1, dt / 0.25); s.pos += s.v * dt; }
      else if (m.type === 'emisor') { const auto = m.p.modo === 'auto' && !mapped('emitir'); const e = !!out(key('emitir')); const edge = e && !s.prev; s.prev = e;
        const due = auto && this.t - s.tLast >= s.wait; if (s.wait == null) s.wait = m.p.cada;
        const free = !this.items.some(it => Math.hypot(it.x - m.x, it.z - m.z) < Math.max(0.5, m.p.tam * 3) && it.y > 0.3); // el alimentador espera hueco
        if (edge || (due && free)) { this.spawn(m); s.tLast = this.t; s.wait = m.p.cada * (1 + (Math.random() * 2 - 1) * (m.p.aleatorio || 0)); } }
      else if (m.type === 'empujador') { const ext = !!out(key('ext')), ret = !!out(key('ret')); const goOut = m.p.doble ? (ext && !ret ? 1 : ret && !ext ? -1 : 0) : (ext ? 1 : -1); const jam = m.p.fallo === 'atascado';
        const x0 = s.x; if (!jam) s.x = Math.max(0, Math.min(1, s.x + goOut * dt / m.p.tiempo)); s.vel = (s.x - x0) * m.p.carrera / dt; }
      else if (m.type === 'tope') { const up = !!out(key('sube')); s.up += ((up ? 1 : 0) - s.up) * Math.min(1, dt / 0.12); }
      else if (m.type === 'torre') { s.rojo = !!out(key('rojo')); s.ambar = !!out(key('ambar')); s.verde = !!out(key('verde')); s.sirena = !!out(key('sirena')); }
      else if (m.type === 'panel') { s.luz = !!out(key('luz')); }
    }
    if (this.fisica === 'sencilla') {
    // piezas
    const g = 9.81; const obst = [];
    for (const m of this.modules) { if (m.type === 'empujador') obst.push({ ...this.paddle(m), kin: true, vel: S[m.id].vel || 0 }); if (m.type === 'tope') { const b = this.stopBar(m); if (b) obst.push(b); } }
    for (const it of this.items) {
      const sup = this.support(it.x, it.z, it.y);
      if (sup && it.y <= sup.p.alto + 0.003) { it.y = sup.p.alto; it.vy = 0; const f = this.frame(sup); const v = S[sup.id].v; const [lx, lz] = this.local(sup, it.x, it.z);
        // velocidad de la banda en el eje; lateral, rozamiento
        const vu = it.vx * f.ux + it.vz * f.uz, vv = it.vx * f.vx + it.vz * f.vz; const k = Math.min(1, dt * 18);
        const nu = vu + (v - vu) * k, nv = vv * (1 - Math.min(1, dt * 10)); it.vx = nu * f.ux + nv * f.vx; it.vz = nu * f.uz + nv * f.vz; it.rot = sup.rot || 0;
        if (sup.p.barandillas && !(it.pushed > 0)) { const lim = sup.p.ancho / 2 - it.r * 0.7; if (Math.abs(lz) > lim) { const [x2, z2] = this.world(sup, lx, Math.sign(lz) * lim); it.x = x2; it.z = z2; } }
        it.on = sup.id; }
      else { it.vy -= g * dt; it.y += it.vy * dt; it.on = null; if (it.y <= 0) { it.y = 0; it.vy = 0; it.vx *= 0.3; it.vz *= 0.3; if (!it.floor) { it.floor = true; this.stats.suelo++; } } }
      it.x += it.vx * dt; it.z += it.vz * dt; if (it.pushed > 0) it.pushed -= dt;
    }
    // choques: con paletas y topes (empujan o paran) y entre piezas
    for (const it of this.items) for (const o of obst) {
      if (it.y > (o.m.p.altura || 0.8) + 0.25 || it.y + it.h < 0.6) continue; const [lu, lv] = [(it.x - o.cx) * o.f.ux + (it.z - o.cz) * o.f.uz, (it.x - o.cx) * o.f.vx + (it.z - o.cz) * o.f.vz];
      const pu = Math.max(-o.hu, Math.min(o.hu, lu)), pv = Math.max(-o.hv, Math.min(o.hv, lv)); const du = lu - pu, dv = lv - pv; const d = Math.hypot(du, dv);
      if (d < it.r) { let nu = du, nv = dv, depth = it.r - d; if (d < 1e-6) { nu = 0; nv = o.kin ? 1 : -Math.sign(lu) || -1; if (!o.kin) { nu = lu >= 0 ? 1 : -1; nv = 0; } depth = it.r; } const L = Math.hypot(nu, nv) || 1; nu /= L; nv /= L;
        it.x += (nu * o.f.ux + nv * o.f.vx) * depth; it.z += (nu * o.f.uz + nv * o.f.vz) * depth;
        const vn = (it.vx * (nu * o.f.ux + nv * o.f.vx) + it.vz * (nu * o.f.uz + nv * o.f.vz)); if (vn < 0) { it.vx -= vn * (nu * o.f.ux + nv * o.f.vx); it.vz -= vn * (nu * o.f.uz + nv * o.f.vz); }
        if (o.kin) { it.pushed = 0.4; if (o.vel > 0 && nv > 0.5) { const cur = it.vx * o.f.vx + it.vz * o.f.vz; const add = Math.max(0, o.vel - cur); it.vx += add * o.f.vx; it.vz += add * o.f.vz; } } } }
    for (let i = 0; i < this.items.length; i++) for (let j = i + 1; j < this.items.length; j++) { const a = this.items[i], b = this.items[j]; if (Math.abs(a.y - b.y) > Math.min(a.h, b.h)) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = (a.r + b.r) * 0.95; if (d >= min || d < 1e-6) continue; const nx = dx / d, nz = dz / d, push = (min - d) / 2;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push; const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz; if (rv < 0) { a.vx += rv * nx / 2; a.vz += rv * nz / 2; b.vx -= rv * nx / 2; b.vz -= rv * nz / 2; } }
    } else this.stepRigid(dt);
    // contenedores
    for (const m of this.modules) { if (m.type !== 'sumidero') continue; const s = S[m.id];
      this.items = this.items.filter(it => { const [lx, lz] = this.local(m, it.x, it.z); if (Math.abs(lx) <= m.p.largo / 2 + it.r * 0.5 && Math.abs(lz) <= m.p.ancho / 2 + it.r * 0.5 && it.y < 0.45) { s.n++; s.por[it.tipo] = (s.por[it.tipo] || 0) + 1; this.stats.por[m.id] = s.por; return false; } return true; }); }
    if (this.items.length > 400) this.items.splice(0, this.items.length - 400);
    // sensores
    for (const m of this.modules) { const key = k => ioKey(m, k); const fault = v => m.p.fallo === 'siempre' ? true : m.p.fallo === 'nunca' ? false : m.p.fallo === 'intermitente' ? (v && Math.random() > 0.15) : v;
      if (m.type === 'fotocelula') { const L = m.p.largo / 2; const [ax, az] = this.world(m, 0, -L), [bx, bz] = this.world(m, 0, L); const hit = this.items.some(it => it.y <= m.p.altura && it.y + it.h >= m.p.altura - 0.03 && segDist(it.x, it.z, ax, az, bx, bz) < it.r * 0.8);
        S[m.id].hit = hit; io.in(key('det'), fault(m.p.nc ? !hit : hit)); }
      else if (m.type === 'inductivo' || m.type === 'color') { const near = this.items.filter(it => { const [lx, lz] = this.local(m, it.x, it.z); return Math.abs(it.y + it.h / 2 - m.p.altura) < it.h && Math.abs(lx) < it.r * 0.8 && lz > 0 && lz - it.r <= m.p.alcance; });
        if (m.type === 'inductivo') { const v = near.some(it => it.metal); S[m.id].hit = v; io.in(key('det'), fault(v)); }
        else { const v = near.some(it => it.color === m.p.busca); S[m.id].hit = near.length > 0; io.in(key('det'), fault(v)); io.in(key('hay'), fault(near.length > 0)); } }
      else if (m.type === 'bascula') { const kg = this.items.filter(it => { const [lx, lz] = this.local(m, it.x, it.z); return Math.abs(lx) <= m.p.largo / 2 && Math.abs(lz) <= m.p.ancho / 2 && it.y >= m.p.altura - 0.02 && it.y < m.p.altura + 0.05; }).reduce((s, it) => s + it.peso, 0);
        S[m.id].kg = kg; io.in(key('peso'), Math.min(m.p.vmax, kg * m.p.vkg)); }
      else if (m.type === 'empujador') { const s = S[m.id]; io.in(key('in'), s.x < 0.03); io.in(key('out'), s.x > 0.97); }
      else if (m.type === 'tope') io.in(key('arriba'), S[m.id].up > 0.9);
      else if (m.type === 'sumidero') io.in(key('lleno'), S[m.id].n >= m.p.capacidad);
      else if (m.type === 'panel') { const u = ui[m.id] || {}; if (u.seta) S[m.id].seta = !S[m.id].seta, u.seta = false; io.in(key('marcha'), !!u.marcha); io.in(key('paro'), !u.paro); io.in(key('seta'), !S[m.id].seta); io.in(key('auto'), u.auto !== false); }
      else if (m.type === 'cinta') { io.enc && io.enc(key('enc'), S[m.id].v * m.p.ppm, S[m.id].pos * m.p.ppm); }
    }
  }
  spawn(m) { const mix = String(m.p.mezcla || 'rojo:1').split(',').map(x => x.split(':')).map(([c, w]) => [c.trim(), +w || 1]); const tot = mix.reduce((s, x) => s + x[1], 0); let r = Math.random() * tot, color = mix[0][0];
    for (const [c, w] of mix) { if ((r -= w) <= 0) { color = c; break; } }
    const metal = Math.random() < (m.p.metal || 0); const s = m.p.tam; const peso = +(m.p.peso * (0.8 + Math.random() * 0.4)).toFixed(2);
    let forma = m.p.forma || 'caja'; if (forma === 'mezcla') forma = ['caja', 'cilindro', 'bola'][Math.floor(Math.random() * 3)];
    const it = { id: this.nextId++, x: m.x, z: m.z, y: 1.3, vx: 0, vz: 0, vy: 0, w: s, d: s, h: s * 0.8, r: s * 0.62, color: metal ? 'metal' : color, metal, peso, tipo: metal ? 'metal' : color, rot: m.rot || 0, forma: 'caja', dims: [s, s * 0.8, s] };
    if (this.fisica !== 'sencilla') { const shape = forma === 'cilindro' ? { type: 'cilindro', r: s * 0.45, h: s * 0.9 } : forma === 'bola' ? { type: 'bola', r: s * 0.42 } : { type: 'caja', w: s, h: s * 0.8, d: s };
      it.forma = forma; it.dims = forma === 'cilindro' ? [shape.r, shape.h, shape.r] : forma === 'bola' ? [shape.r, shape.r, shape.r] : [s, s * 0.8, s]; it.r = forma === 'caja' ? s * 0.62 : shape.r; it.h = forma === 'bola' ? shape.r * 2 : shape.h;
      it.b = new Body(shape, peso, [m.x + (Math.random() - 0.5) * 0.01, 1.3, m.z + (Math.random() - 0.5) * 0.01], quatY(((m.rot || 0) + (Math.random() - 0.5) * 20) * Math.PI / 180)); }
    this.items.push(it); this.stats.emitidas++; }
  // Barandillas de una cinta: tramos [x0, x1] con hueco donde hay un cilindro empujador (para que la pieza pueda salir)
  railSegs(m) { const L = m.p.largo / 2; let segs = [[-L, L]];
    for (const q of this.modules) { if (q.type !== 'empujador') continue; const [lx, lz] = this.local(m, q.x, q.z); if (Math.abs(lx) > L + 0.25 || Math.abs(lz) > m.p.ancho / 2 + 0.9) continue;
      const a = lx - 0.24, b = lx + 0.24; segs = segs.flatMap(([x0, x1]) => b <= x0 || a >= x1 ? [[x0, x1]] : [[x0, a], [b, x1]].filter(([u, v]) => v - u > 0.02)); }
    return segs; }
  // El mundo fijo para la física rígida: suelo, cintas (con la velocidad de su banda), barandillas, contenedores, paletas y topes
  colliders() { const S = this.state; const out = [collider([0, -0.5, 0], 0, [200, 0.5, 200], 0.6)];
    for (const m of this.modules) { const p = m.p, f = this.frame(m), s = S[m.id] || {}, rot = m.rot || 0; const W = (lx, lz, y) => { const [x, z] = this.world(m, lx, lz); return [x, y, z]; };
      if (m.type === 'cinta') { const v = s.v || 0; out.push(collider([m.x, p.alto - 0.1, m.z], rot, [p.largo / 2, 0.1, p.ancho / 2], 0.8, [v * f.ux, 0, v * f.uz]));
        if (p.barandillas) for (const [x0, x1] of this.railSegs(m)) for (const k of [-1, 1]) out.push(collider(W((x0 + x1) / 2, k * (p.ancho / 2 + 0.03), p.alto + 0.05), rot, [(x1 - x0) / 2, 0.06, 0.01], 0.15)); }
      else if (m.type === 'sumidero') { out.push(collider([m.x, 0.01, m.z], rot, [p.largo / 2, 0.01, p.ancho / 2], 0.5));
        for (const k of [-1, 1]) { out.push(collider(W(0, k * p.ancho / 2, 0.225), rot, [p.largo / 2, 0.225, 0.01], 0.3)); out.push(collider(W(k * p.largo / 2, 0, 0.225), rot, [0.01, 0.225, p.ancho / 2], 0.3)); } }
      else if (m.type === 'empujador') { const ext = (s.x || 0) * p.carrera, vel = s.vel || 0; out.push(collider(W(0, 0.08 + ext, 0.87), rot, [0.18, 0.05, 0.025], 0.3, [vel * f.vx, 0, vel * f.vz], true)); }
      else if (m.type === 'tope' && (s.up || 0) > 0.3) out.push(collider([m.x, 0.74 + s.up * 0.12, m.z], rot, [0.015, 0.03, p.ancho / 2], 0.3, [0, 0, 0], true)); }
    return out; }
  stepRigid(dt) { const cols = this.colliders(); const bodies = this.items.map(it => it.b).filter(Boolean); const n = 2; for (let i = 0; i < n; i++) rigidStep(bodies, cols, dt / n);
    const binHit = it => this.modules.some(m => { if (m.type !== 'sumidero') return false; const [lx, lz] = this.local(m, it.x, it.z); return Math.abs(lx) <= m.p.largo / 2 && Math.abs(lz) <= m.p.ancho / 2; });
    for (const it of this.items) { const b = it.b; if (!b) continue; it.x = b.p[0]; it.z = b.p[2]; it.cy = b.p[1]; it.q = b.q; const [lo, hi] = b.extentY(); it.y = lo; it.h = hi - lo; it.vx = b.v[0]; it.vz = b.v[2];
      if (lo < 0.03 && !it.floor && !binHit(it)) { it.floor = true; this.stats.suelo++; } }
    this.items = this.items.filter(it => !it.b || it.b.p[1] > -2); }
}
function segDist(px, pz, ax, az, bx, bz) { const vx = bx - ax, vz = bz - az; const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1))); return Math.hypot(px - ax - t * vx, pz - az - t * vz); }

/* ---------- Plantas de ejemplo ---------- */
export const PLANTS = [
  { id: 'clasificadora', title: 'Clasificadora por color', about: 'Las piezas rojas se apartan con un cilindro; el resto sigue hasta el final. Con botonera, seta y baliza.',
    build: P => { P.add('emisor', -1.6, 0, 0, { cada: 2.5, mezcla: 'rojo:1,azul:1,verde:1' }); P.add('cinta', 0, 0, 0, { largo: 4 }); P.add('color', -0.4, -0.25, 0, { busca: 'rojo', alcance: 0.22 });
      P.add('fotocelula', 0.6, 0, 0); P.add('empujador', 0.6, -0.42, 0); P.add('sumidero', 0.6, 0.62, 0); P.add('sumidero', 2.25, 0, 0); P.add('panel', -1.2, 1.4, 0); P.add('torre', 1.6, -1.0, 0); } },
  { id: 'pesaje', title: 'Pesaje y rechazo', about: 'Un tope para cada caja sobre la báscula; si pesa de más, el cilindro la rechaza.',
    build: P => { P.add('emisor', -1.6, 0, 0, { cada: 3, mezcla: 'amarillo:1', peso: 1, aleatorio: 0.2 }); P.add('cinta', 0, 0, 0, { largo: 4 }); P.add('fotocelula', 0.3, 0, 0); P.add('tope', 0.42, 0, 0);
      P.add('bascula', 0.31, 0, 0, { largo: 0.24 }); P.add('empujador', 0.31, -0.42, 0); P.add('sumidero', 0.31, 0.62, 0); P.add('sumidero', 2.25, 0, 0); P.add('panel', -1.2, 1.4, 0); P.add('torre', 1.6, -1.0, 0); } },
  { id: 'dosplacas', title: 'Dos cintas, dos placas', about: 'Cada cinta la lleva una placa. PLC1 (botonera, baliza, cinta 1) avisa a PLC2 con mensajes por el puerto serie; PLC2 (cinta 2) le contesta si la salida está llena.',
    ctls: [{ id: 'PLC2', board: 'pico' }],
    build: P => { P.add('emisor', -2.1, 0, 0, { cada: 2 }); P.add('cinta', -1.1, 0, 0, { largo: 2.6 }); P.add('cinta', 1.5, 0, 0, { largo: 2.6, alto: 0.78 }); P.add('fotocelula', 0.05, 0, 0); P.add('fotocelula', 2.6, 0, 0); P.add('sumidero', 3.05, 0, 0); P.add('panel', -1.5, 1.4, 0); P.add('torre', 0.2, -1.0, 0); } },
  { id: 'dos', title: 'Dos cintas en serie', about: 'Transferencia entre cintas con acumulación: la segunda solo arranca si hay sitio.',
    build: P => { P.add('emisor', -2.1, 0, 0, { cada: 2 }); P.add('cinta', -1.1, 0, 0, { largo: 2.6 }); P.add('cinta', 1.5, 0, 0, { largo: 2.6, alto: 0.78 }); P.add('fotocelula', 0.05, 0, 0); P.add('fotocelula', 2.6, 0, 0); P.add('sumidero', 3.05, 0, 0); P.add('panel', -1.5, 1.4, 0); P.add('torre', 0.2, -1.0, 0); } },
];
