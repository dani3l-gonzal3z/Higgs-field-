// Física de cuerpo rígido para las piezas de la planta: cajas, cilindros y bolas que caen, vuelcan, giran y ruedan.
// Impulsos secuenciales (el método de Box2D/Bullet) con puntos de muestra: las esquinas de una caja, el canto de un cilindro;
// las bolas, exactas. El mundo son cajas giradas sobre el eje vertical (cintas, barandillas, paredes, cilindros, topes),
// cada una con su rozamiento y su «velocidad de superficie» (la banda de la cinta, la paleta del cilindro).
// Sin dependencias: corre igual en el navegador y en Node.

const G = -9.81;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = a => Math.hypot(a[0], a[1], a[2]);
// Matriz de giro (columnas = ejes del cuerpo en el mundo) a partir del cuaternio [x, y, z, w]
function mat(q) { const [x, y, z, w] = q; return [[1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)], [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)], [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]]; }
const toWorld = (R, l) => [R[0][0] * l[0] + R[1][0] * l[1] + R[2][0] * l[2], R[0][1] * l[0] + R[1][1] * l[1] + R[2][1] * l[2], R[0][2] * l[0] + R[1][2] * l[1] + R[2][2] * l[2]];
const toLocal = (R, v) => [dot(R[0], v), dot(R[1], v), dot(R[2], v)];
export const quatY = a => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
export function quatMul(a, b) { return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; }

/* ---------- Cuerpos ---------- */
// shape: { type: 'caja', w, h, d } · { type: 'cilindro', r, h } (eje vertical) · { type: 'bola', r }
export class Body {
  constructor(shape, mass, p, q = [0, 0, 0, 1]) {
    this.s = shape; this.m = mass; this.im = 1 / mass; this.p = [...p]; this.q = [...q]; this.v = [0, 0, 0]; this.w = [0, 0, 0];
    const m = mass; let I;
    if (shape.type === 'caja') { const { w, h, d } = shape; I = [m * (h * h + d * d) / 12, m * (w * w + d * d) / 12, m * (w * w + h * h) / 12];
      this.pts = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) this.pts.push([sx * w / 2, sy * h / 2, sz * d / 2]);
      this.rad = Math.hypot(w, h, d) / 2; }
    else if (shape.type === 'cilindro') { const { r, h } = shape; I = [m * (3 * r * r + h * h) / 12, m * r * r / 2, m * (3 * r * r + h * h) / 12]; this.pts = [];
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; for (const sy of [-1, 1]) this.pts.push([r * Math.cos(a), sy * h / 2, r * Math.sin(a)]); } this.rad = Math.hypot(r, h / 2); }
    else { const { r } = shape; I = [0.4 * m * r * r, 0.4 * m * r * r, 0.4 * m * r * r]; this.pts = null; this.rad = r; }
    this.iI = I.map(x => 1 / x); this.R = mat(this.q);
  }
  // I⁻¹ en el mundo aplicado a un vector
  iIw(v) { const l = toLocal(this.R, v); return toWorld(this.R, [l[0] * this.iI[0], l[1] * this.iI[1], l[2] * this.iI[2]]); }
  velAt(r) { return add(this.v, cross(this.w, r)); }
  impulse(J, r) { this.v = add(this.v, mul(J, this.im)); this.w = add(this.w, this.iIw(cross(r, J))); }
  // Altura del punto más bajo y más alto (para sensores y contenedores)
  extentY() { if (!this.pts) return [this.p[1] - this.s.r, this.p[1] + this.s.r]; let lo = Infinity, hi = -Infinity; for (const l of this.pts) { const y = this.p[1] + toWorld(this.R, l)[1]; if (y < lo) lo = y; if (y > hi) hi = y; } return [lo, hi]; }
  // ¿Está este punto dentro del cuerpo? → [profundidad, normal hacia fuera] o null
  inside(pt) { const l = toLocal(this.R, sub(pt, this.p)); const s = this.s;
    if (s.type === 'bola') { const d = len(l); if (d >= s.r) return null; const n = d > 1e-9 ? mul(l, 1 / d) : [0, 1, 0]; return [s.r - d, toWorld(this.R, n)]; }
    if (s.type === 'caja') { const h = [s.w / 2, s.h / 2, s.d / 2]; let best = Infinity, ax = 0; for (let i = 0; i < 3; i++) { const pen = h[i] - Math.abs(l[i]); if (pen <= 0) return null; if (pen < best) { best = pen; ax = i; } }
      const n = [0, 0, 0]; n[ax] = l[ax] >= 0 ? 1 : -1; return [best, toWorld(this.R, n)]; }
    const rr = Math.hypot(l[0], l[2]); const pa = s.h / 2 - Math.abs(l[1]), pr = s.r - rr; if (pa <= 0 || pr <= 0) return null;
    if (pa < pr) return [pa, toWorld(this.R, [0, l[1] >= 0 ? 1 : -1, 0])]; return [pr, toWorld(this.R, rr > 1e-9 ? [l[0] / rr, 0, l[2] / rr] : [1, 0, 0])]; }
  // Punto del cuerpo más cercano a otro punto (para contactos con bolas)
  closest(pt) { const l = toLocal(this.R, sub(pt, this.p)); const s = this.s; let c;
    if (s.type === 'caja') c = [Math.max(-s.w / 2, Math.min(s.w / 2, l[0])), Math.max(-s.h / 2, Math.min(s.h / 2, l[1])), Math.max(-s.d / 2, Math.min(s.d / 2, l[2]))];
    else if (s.type === 'cilindro') { const rr = Math.hypot(l[0], l[2]); const k = rr > s.r ? s.r / rr : 1; c = [l[0] * k, Math.max(-s.h / 2, Math.min(s.h / 2, l[1])), l[2] * k]; }
    else { const d = len(l) || 1; c = mul(l, Math.min(1, s.r / d)); }
    return add(this.p, toWorld(this.R, c)); }
}

/* ---------- Mundo fijo: cajas giradas sobre el eje vertical ---------- */
// { c: [x,y,z], rot: grados, h: [hx,hy,hz], mu, sv: [vx,vy,vz] velocidad de la superficie }
// samp: rellenar de puntos (paletas y topes, más pequeños que las piezas: así sus caras empujan aunque ninguna esquina entre)
export function collider(c, rot, h, mu = 0.5, sv = [0, 0, 0], samp = false) { const a = rot * Math.PI / 180; const k = { c, ux: [Math.cos(a), 0, -Math.sin(a)], uz: [Math.sin(a), 0, Math.cos(a)], h, mu, sv, rad: Math.hypot(...h) };
  if (samp) { k.pts = []; const n = h.map(x => Math.max(1, Math.ceil(2 * x / 0.03))); for (let i = 0; i <= n[0]; i++) for (let j = 0; j <= n[1]; j++) for (let l = 0; l <= n[2]; l++) { const lx = -h[0] + 2 * h[0] * i / n[0], ly = -h[1] + 2 * h[1] * j / n[1], lz = -h[2] + 2 * h[2] * l / n[2];
    k.pts.push(add(c, add(add(mul(k.ux, lx), [0, ly, 0]), mul(k.uz, lz)))); } }
  return k; }
function inBox(C, pt) { const d = sub(pt, C.c); const l = [dot(d, C.ux), d[1], dot(d, C.uz)]; let best = Infinity, ax = -1;
  for (let i = 0; i < 3; i++) { const pen = C.h[i] - Math.abs(l[i]); if (pen <= 0) return null; if (pen < best) { best = pen; ax = i; } }
  const s = l[ax] >= 0 ? 1 : -1; const n = ax === 0 ? mul(C.ux, s) : ax === 1 ? [0, s, 0] : mul(C.uz, s); return [best, n]; }
function closestBox(C, pt) { const d = sub(pt, C.c); const l = [dot(d, C.ux), d[1], dot(d, C.uz)]; const k = l.map((x, i) => Math.max(-C.h[i], Math.min(C.h[i], x)));
  return add(C.c, add(add(mul(C.ux, k[0]), [0, k[1], 0]), mul(C.uz, k[2]))); }

/* ---------- Un paso ---------- */
const SLOP = 0.002, BETA = 0.25, ITER = 10;
export function step(bodies, cols, dt) {
  for (const b of bodies) { b.R = mat(b.q); b.v[1] += G * dt; }
  // contactos
  const C = [];
  for (const b of bodies) {
    for (const k of cols) { if (len(sub(b.p, k.c)) > b.rad + k.rad + 0.05) continue;
      if (!b.pts) { const q = closestBox(k, b.p); const d = sub(b.p, q); const dl = len(d);
        if (dl < b.s.r) { let n, dep; if (dl > 1e-9) { n = mul(d, 1 / dl); dep = b.s.r - dl; } else { const r = inBox(k, b.p); if (!r) continue; [dep, n] = r; dep += b.s.r; } C.push({ a: b, b: null, k, p: sub(b.p, mul(n, b.s.r)), n, dep, mu: k.mu, sv: k.sv }); } continue; }
      for (const l of b.pts) { const pt = add(b.p, toWorld(b.R, l)); const r = inBox(k, pt); if (r) C.push({ a: b, b: null, k, p: pt, n: r[1], dep: r[0], mu: k.mu, sv: k.sv }); }
      if (k.pts) for (const pt of k.pts) { const r = b.inside(pt); if (r) C.push({ a: b, b: null, k, p: pt, n: mul(r[1], -1), dep: r[0], mu: k.mu, sv: k.sv }); } }
  }
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) { const A = bodies[i], B = bodies[j]; if (len(sub(A.p, B.p)) > A.rad + B.rad) continue;
    for (const [P, Q] of [[A, B], [B, A]]) {
      if (!P.pts) { const q = Q.closest(P.p); const d = sub(P.p, q); const dl = len(d); if (dl < P.s.r && dl > 1e-9) { const n = mul(d, 1 / dl); C.push({ a: P, b: Q, p: q, n, dep: P.s.r - dl, mu: 0.4 }); } continue; }
      for (const l of P.pts) { const pt = add(P.p, toWorld(P.R, l)); const r = Q.inside(pt); if (r) C.push({ a: P, b: Q, p: pt, n: mul(r[1], 1), dep: r[0], mu: 0.4 }); } } }
  // preparación
  for (const c of C) { c.ra = sub(c.p, c.a.p); c.rb = c.b ? sub(c.p, c.b.p) : null; c.Pn = 0; c.Pt = [0, 0, 0];
    const kn = (r, b, n) => b.im + dot(n, cross(b.iIw(cross(r, n)), r)); c.kn = kn(c.ra, c.a, c.n) + (c.b ? kn(c.rb, c.b, c.n) : 0); c.kfun = kn;
    c.bias = Math.min(1.5, BETA / dt * Math.max(0, c.dep - SLOP)); }
  // iteraciones: normal y rozamiento (cono de Coulomb)
  for (let it = 0; it < ITER; it++) for (const c of C) {
    const vb = c.b ? c.b.velAt(c.rb) : c.sv; const vr = sub(c.a.velAt(c.ra), vb); const vn = dot(vr, c.n);
    let jn = (-vn + c.bias) / c.kn; const P0 = c.Pn; c.Pn = Math.max(0, P0 + jn); jn = c.Pn - P0;
    if (jn) { const J = mul(c.n, jn); c.a.impulse(J, c.ra); if (c.b) c.b.impulse(mul(J, -1), c.rb); }
    const vr2 = sub(c.a.velAt(c.ra), c.b ? c.b.velAt(c.rb) : c.sv); const vt = sub(vr2, mul(c.n, dot(vr2, c.n))); const vtl = len(vt); if (vtl < 1e-7) continue;
    const t = mul(vt, 1 / vtl); const kt = c.kfun(c.ra, c.a, t) + (c.b ? c.kfun(c.rb, c.b, t) : 0);
    const old = c.Pt; let np = add(old, mul(t, -vtl / kt)); const max = c.mu * c.Pn; const npl = len(np); if (npl > max) np = mul(np, max / npl);
    const dJ = sub(np, old); c.Pt = np; c.a.impulse(dJ, c.ra); if (c.b) c.b.impulse(mul(dJ, -1), c.rb); }
  // integrar
  for (const b of bodies) {
    b.p = add(b.p, mul(b.v, dt)); const [wx, wy, wz] = b.w; const q = b.q; const dq = quatMul([wx, wy, wz, 0], q);
    b.q = [q[0] + 0.5 * dt * dq[0], q[1] + 0.5 * dt * dq[1], q[2] + 0.5 * dt * dq[2], q[3] + 0.5 * dt * dq[3]]; const n = Math.hypot(...b.q); b.q = b.q.map(x => x / n);
    b.v = mul(b.v, 0.9995); b.w = mul(b.w, 0.995); }
  return C.length;
}
