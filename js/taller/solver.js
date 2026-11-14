// Motor eléctrico del Taller: análisis nodal (MNA) en corriente continua, resuelto en cada fotograma.
// Modelos por tramos (rápidos y estables): resistencias, fuentes con resistencia interna (pines y raíles de la placa),
// diodos y LEDs (tensión umbral + resistencia serie), transistores NPN/PNP (corte · activa · saturación),
// MOSFET de canal N/P (umbral + Rds(on)) e interruptores. Lo no lineal se resuelve iterando los estados.
// El resultado: la tensión de cada punto y la corriente de cada pieza, para el polímetro y los avisos.
const GMIN = 1e-9;

export class Netlist {
  constructor(groundNet) { this.idx = new Map(); this.names = []; this.els = []; this.ground = groundNet; }
  node(net) { if (net == null || net === this.ground) return -1; let i = this.idx.get(net); if (i == null) { i = this.names.length; this.idx.set(net, i); this.names.push(net); } return i; }
  // R entre a y b
  R(id, a, b, r, tag) { this.els.push({ t: 'R', id, a: this.node(a), b: this.node(b), g: 1 / Math.max(1e-4, r), tag }); }
  // Fuente de tensión V (respecto a masa) con resistencia interna r en el nodo n
  V(id, n, v, r, tag) { this.els.push({ t: 'V', id, a: this.node(n), b: -1, v, g: 1 / Math.max(1e-4, r), tag }); }
  // Diodo/LED de a (ánodo) a b (cátodo)
  D(id, a, b, vf, rs, tag) { this.els.push({ t: 'D', id, a: this.node(a), b: this.node(b), vf, g: 1 / rs, on: false, tag }); }
  // Transistor bipolar (pnp = true para PNP)
  Q(id, c, b, e, beta = 150, pnp = false, tag) { this.els.push({ t: 'Q', id, c: this.node(c), b: this.node(b), e: this.node(e), beta, pnp, st: 'off', tag }); }
  // MOSFET (p = true para canal P)
  M(id, d, g, s, vth = 2, ron = 0.1, p = false, tag) { this.els.push({ t: 'M', id, d: this.node(d), g: this.node(g), s: this.node(s), vth, gon: 1 / ron, p, on: false, tag }); }

  solve() {
    const n = this.names.length; if (!n) { this.v = new Float64Array(0); return this; }
    const v = new Float64Array(n); let it = 0;
    for (; it < 40; it++) {
      const G = Array.from({ length: n }, () => new Float64Array(n)), I = new Float64Array(n);
      for (let i = 0; i < n; i++) G[i][i] = GMIN;
      const g2 = (a, b, g) => { if (a >= 0) G[a][a] += g; if (b >= 0) G[b][b] += g; if (a >= 0 && b >= 0) { G[a][b] -= g; G[b][a] -= g; } };
      const inj = (a, b, i) => { if (a >= 0) I[a] -= i; if (b >= 0) I[b] += i; }; // corriente i que sale de a y entra en b
      const vccs = (oa, ob, ca, cb, gm) => { // corriente gm·(V(ca)-V(cb)) de oa a ob
        for (const [o, s] of [[oa, 1], [ob, -1]]) { if (o < 0) continue; if (ca >= 0) G[o][ca] += s * gm; if (cb >= 0) G[o][cb] -= s * gm; } };
      for (const e of this.els) {
        if (e.t === 'R') g2(e.a, e.b, e.g);
        else if (e.t === 'V') { g2(e.a, -1, e.g); if (e.a >= 0) I[e.a] += e.v * e.g; }
        else if (e.t === 'D') { if (e.on) { g2(e.a, e.b, e.g); inj(e.a, e.b, -e.vf * e.g); } else g2(e.a, e.b, 1e-9); }
        else if (e.t === 'Q') { const s = e.pnp ? -1 : 1; const gbe = 1 / 200; // unión base-emisor: 0,65 V + 200 Ω
          const [bp, bn] = e.pnp ? [e.e, e.b] : [e.b, e.e];
          if (e.st === 'off') { g2(e.b, e.e, 1e-9); g2(e.c, e.e, 1e-9); continue; }
          g2(bp, bn, gbe); inj(bp, bn, -0.65 * gbe);
          if (e.st === 'act') { const [cp, cn] = e.pnp ? [e.e, e.c] : [e.c, e.e]; vccs(cp, cn, bp, bn, e.beta * gbe); inj(cp, cn, -e.beta * 0.65 * gbe); g2(e.c, e.e, 1e-7); }
          else { const gs = 1 / 2; const [cp, cn] = e.pnp ? [e.e, e.c] : [e.c, e.e]; g2(cp, cn, gs); inj(cp, cn, -0.1 * gs); } void s; }
        else if (e.t === 'M') { g2(e.d, e.s, e.on ? e.gon : 1e-9); g2(e.g, e.s, 1e-12); }
      }
      const x = gauss(G, I); if (!x) break; v.set(x);
      // ¿Cambia algún estado?
      let changed = false; const V = i => i < 0 ? 0 : v[i];
      for (const e of this.els) {
        if (e.t === 'D') { const vd = V(e.a) - V(e.b); if (!e.on && vd > e.vf + 1e-4) { e.on = true; changed = true; } else if (e.on && (vd - e.vf) * e.g < -1e-7) { e.on = false; changed = true; } }
        else if (e.t === 'Q') { const s = e.pnp ? -1 : 1; const vbe = s * (V(e.b) - V(e.e)), vce = s * (V(e.c) - V(e.e)); const ib = (vbe - 0.65) / 200;
          let st = e.st;
          if (st === 'off' && vbe > 0.651) st = vce > 0.2 ? 'act' : 'sat';
          else if (st !== 'off' && ib < -1e-7) st = 'off';
          else if (st === 'act' && vce < 0.1) st = 'sat';
          else if (st === 'sat') { const ic = s * (V(e.c) - V(e.e) - s * 0.1) * 0.5; if (ic > e.beta * ib * 1.02) st = 'act'; }
          if (st !== e.st) { e.st = st; changed = true; } }
        else if (e.t === 'M') { const vgs = e.p ? V(e.s) - V(e.g) : V(e.g) - V(e.s); const on = vgs > e.vth; if (on !== e.on) { e.on = on; changed = true; } }
      }
      if (!changed) break;
    }
    this.v = v; this.iters = it; return this;
  }
  volt(net) { if (net === this.ground) return 0; const i = this.idx.get(net); return i == null ? null : this.v[i]; }
  // ¿El punto está unido a algo que fije su tensión (no flota)?
  floating(net) { if (net === this.ground) return false; const i = this.idx.get(net); if (i == null) return true; return !this.els.some(e => (e.t === 'R' || e.t === 'V' || (e.t === 'D' && e.on) || (e.t === 'Q' && e.st !== 'off') || (e.t === 'M' && e.on)) && (e.a === i || e.b === i || e.c === i || e.e === i || e.d === i || e.s === i)); }
  // Corriente de cada elemento (A). Para fuentes: la que entregan. Para diodos: de ánodo a cátodo. Transistores: por el colector/drenador.
  current(e) { const V = i => i < 0 ? 0 : this.v[i];
    if (e.t === 'R') return (V(e.a) - V(e.b)) * e.g;
    if (e.t === 'V') return (e.v - V(e.a)) * e.g;
    if (e.t === 'D') return e.on ? (V(e.a) - V(e.b) - e.vf) * e.g : 0;
    if (e.t === 'Q') { const s = e.pnp ? -1 : 1; if (e.st === 'off') return 0; const ib = (s * (V(e.b) - V(e.e)) - 0.65) / 200; return e.st === 'act' ? e.beta * ib : Math.max(0, (s * (V(e.c) - V(e.e)) - 0.1) * 0.5); }
    if (e.t === 'M') return e.on ? Math.abs(V(e.d) - V(e.s)) * e.gon : 0;
    return 0; }
  byId(id) { return this.els.filter(e => e.id === id); }
}

// Eliminación gaussiana con pivote parcial
function gauss(A, b) {
  const n = b.length; const M = A.map((r, i) => { const x = new Float64Array(n + 1); x.set(r); x[n] = b[i]; return x; });
  for (let c = 0; c < n; c++) {
    let p = c, best = Math.abs(M[c][c]); for (let r = c + 1; r < n; r++) { const a = Math.abs(M[r][c]); if (a > best) { best = a; p = r; } }
    if (best < 1e-18) return null; if (p !== c) { const t = M[p]; M[p] = M[c]; M[c] = t; }
    const pr = M[c], d = pr[c];
    for (let r = c + 1; r < n; r++) { const row = M[r]; const f = row[c] / d; if (!f) continue; for (let k = c; k <= n; k++) row[k] -= f * pr[k]; }
  }
  const x = new Float64Array(n); for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

// Tensión umbral típica de cada color de LED
// (modelo por tramos de la curva real: umbral y resistencia serie que dan ~20 mA a la tensión de catálogo)
export const LED_VF = { red: 1.75, orange: 1.85, yellow: 1.9, green: 1.95, blue: 2.6, white: 2.6, purple: 2.6, pink: 2.6, cyan: 2.6, limegreen: 1.95, '': 1.9 };
export const LED_RS = c => (LED_VF[c] || 1.9) > 2.3 ? 30 : 15;
export const fmtV = v => v == null ? '—' : Math.abs(v) < 0.01 ? '0 V' : (Math.abs(v) < 1 ? (v * 1000).toFixed(0) + ' mV' : v.toFixed(2).replace('.', ',') + ' V');
export const fmtA = i => { const a = Math.abs(i); return a < 1e-6 ? '0 A' : a < 1e-3 ? (i * 1e6).toFixed(0) + ' µA' : a < 1 ? (i * 1e3).toFixed(a < 0.01 ? 2 : 1).replace('.', ',') + ' mA' : i.toFixed(2).replace('.', ',') + ' A'; };
