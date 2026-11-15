// Protoboards de Plató: agujeros, uniones y dibujo generados por código. Sin arte ni código de terceros.
//   <plato-breadboard>       830 puntos (63 columnas + 4 raíles de 50)
//   <plato-breadboard-half>  400 puntos (30 columnas + 4 raíles de 25)
//   <plato-breadboard-mini>  170 puntos (17 columnas, sin raíles)
// Los nombres de los agujeros son los del diagram.json de Wokwi («12t.c», «tp.7»), para abrir y guardar sus proyectos.
// Todo va en la rejilla de 0,1" (9,6 px): cualquier pieza o placa con ese paso cae justo en los agujeros.
export const PITCH = 9.6;
const P = PITCH;
const TOP = ['a', 'b', 'c', 'd', 'e'], BOT = ['f', 'g', 'h', 'i', 'j'];

// Filas en pasos desde el borde de arriba. Las medidas son las de una protoboard de verdad:
// 0,3" entre la fila e y la f (para que un chip DIP quede a caballo) y los raíles separados del cuerpo.
const SIZES = {
  full: { cols: 63, rail: 50, railAt: 2, rows: { tn: 1, tp: 2, a: 5, f: 12, bn: 19, bp: 20 }, h: 21 },
  half: { cols: 30, rail: 25, railAt: 1, rows: { tn: 1, tp: 2, a: 5, f: 12, bn: 19, bp: 20 }, h: 21 },
  mini: { cols: 17, rail: 0, railAt: 0, rows: { a: 3, f: 10 }, h: 16 },
};
const X0 = 1.5; // primera columna, en pasos
const railX = (S, k) => (X0 + S.railAt + k + Math.floor(k / 5)) * P; // grupos de 5 con un hueco, como en las de verdad

export function layout(kind) {
  const S = SIZES[kind]; const pins = []; const w = (S.cols + 2) * P, h = S.h * P;
  if (S.rail) for (const r of ['tp', 'tn', 'bp', 'bn']) for (let k = 0; k < S.rail; k++) pins.push({ name: `${r}.${k + 1}`, x: railX(S, k), y: S.rows[r] * P });
  for (let c = 1; c <= S.cols; c++) {
    const x = (X0 + c - 1) * P;
    TOP.forEach((l, i) => pins.push({ name: `${c}t.${l}`, x, y: (S.rows.a + i) * P }));
    BOT.forEach((l, i) => pins.push({ name: `${c}b.${l}`, x, y: (S.rows.f + i) * P }));
  }
  return { ...S, kind, w, h, pins };
}

// Qué agujeros están unidos por dentro. Devuelve la clave de la tira, o null si el nombre no es un agujero.
//   columna: los 5 de arriba (a-e) van juntos y los 5 de abajo (f-j) también, separados por el canal central.
//   raíl:    toda la fila; con rails="split" la fila está partida por la mitad, como en muchas protoboards largas.
const HOLE = /^(\d+)([tb])\.([a-j])$/, RAIL = /^([tb][pn])\.(\d+)$/;
export function stripOf(name, kind = 'full', attrs = {}) {
  const h = HOLE.exec(name); if (h) return 'c' + h[1] + h[2];
  const r = RAIL.exec(name); if (!r) return null;
  const S = SIZES[kind] || SIZES.full; const split = !!attrs && attrs.rails === 'split' && S.rail >= 50;
  return 'r' + r[1] + (split && +r[2] > S.rail / 2 ? 'B' : '');
}
export const kindOfTag = tag => ({ 'plato-breadboard': 'full', 'plato-breadboard-half': 'half', 'plato-breadboard-mini': 'mini' }[String(tag).toLowerCase()] || null);

/* ---------- Dibujo ---------- */
const n = v => +v.toFixed(2);
function art(L, attrs) {
  const { w, h, rows, cols, rail } = L; const split = attrs.rails === 'split' && rail >= 50; let s = '';
  s += `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">`;
  s += `<defs><linearGradient id="pb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfaf6"/><stop offset="1" stop-color="#ece9e1"/></linearGradient></defs>`;
  s += `<rect x=".5" y=".5" width="${n(w - 1)}" height="${n(h - 1)}" rx="5" fill="url(#pb)" stroke="#cfcabd"/>`;
  // Canal central
  const cy = (rows.a + 4 + rows.f) / 2 * P;
  s += `<rect x="3" y="${n(cy - P * 0.55)}" width="${n(w - 6)}" height="${n(P * 1.1)}" rx="2.5" fill="#dedad0"/><rect x="3" y="${n(cy - P * 0.55)}" width="${n(w - 6)}" height="1.2" fill="#c9c4b7"/>`;
  // Raíles: línea roja junto al + y azul junto al −
  if (rail) {
    const x1 = railX(L, 0) - P * 0.5, x2 = railX(L, rail - 1) + P * 0.5, mid = (railX(L, rail / 2 - 1) + railX(L, Math.ceil(rail / 2))) / 2;
    const line = (y, color) => split ? `<path d="M${n(x1)} ${n(y)}H${n(mid - P * 0.45)}M${n(mid + P * 0.45)} ${n(y)}H${n(x2)}" stroke="${color}" stroke-width="1.3"/>` : `<path d="M${n(x1)} ${n(y)}H${n(x2)}" stroke="${color}" stroke-width="1.3"/>`;
    const sign = (y, t, color) => `<text x="${n(Math.max(5, x1 - 4.4))}" y="${n(y + 2.6)}" fill="${color}" class="s">${t}</text><text x="${n(Math.min(w - 5, x2 + 4.4))}" y="${n(y + 2.6)}" fill="${color}" class="s">${t}</text>`;
    for (const [neg, pos] of [['tn', 'tp'], ['bn', 'bp']]) {
      const yn = rows[neg] * P, yp = rows[pos] * P; const a = Math.min(yn, yp) - P * 0.55, b = Math.max(yn, yp) + P * 0.55;
      s += line(yn < yp ? a : b, '#2f6fd6') + line(yn < yp ? b : a, '#d8372f') + sign(yn, '−', '#2f6fd6') + sign(yp, '+', '#d8372f');
    }
  }
  // Números de columna y letras de fila
  const numY = [(rows.a - 0.75) * P + 2, (rows.f + 4.75) * P + 2];
  for (let c = 1; c <= cols; c++) if (c === 1 || c % 5 === 0) for (const y of numY) s += `<text x="${n((X0 + c - 1) * P)}" y="${n(y)}" class="n">${c}</text>`;
  [...TOP, ...BOT].forEach((l, i) => { const y = ((i < 5 ? rows.a : rows.f - 5) + i) * P + 2; s += `<text x="${n(P * 0.62)}" y="${n(y)}" class="n">${l}</text><text x="${n(w - P * 0.62)}" y="${n(y)}" class="n">${l}</text>`; });
  // Agujeros: un solo trazo para todos (830 nodos de menos en el DOM) y un brillo debajo para dar relieve
  const r = 1.75; let d = '';
  for (const p of L.pins) d += `M${n(p.x - r)} ${n(p.y - r)}h${2 * r}v${2 * r}h-${2 * r}z`;
  s += `<path d="${d}" fill="#fff" transform="translate(0 .7)" opacity=".9"/><path d="${d}" fill="#3b3a36"/>`;
  s += `<rect class="hl" x="0" y="0" width="0" height="0" rx="3" fill="#3a7bd5" opacity="0" pointer-events="none"/></svg>`;
  return s;
}
const CSS = `:host{display:inline-block;line-height:0}svg{display:block}text{font:5.4px ui-monospace,Menlo,Consolas,monospace;text-anchor:middle;fill:#8d887b}text.s{font-size:8px;font-weight:700}`;

function define(tag, kind) {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  const L = layout(kind);
  customElements.define(tag, class extends HTMLElement {
    static get observedAttributes() { return ['rails']; }
    constructor() { super(); this.attachShadow({ mode: 'open' }); }
    connectedCallback() { this._draw(); }
    attributeChangedCallback() { if (this.isConnected) this._draw(); }
    _draw() { this.style.width = L.w + 'px'; this.style.height = L.h + 'px'; this.shadowRoot.innerHTML = `<style>${CSS}</style>` + art(L, { rails: this.getAttribute('rails') }); }
    get pinInfo() { return L.pins; }
    get boardKind() { return kind; }
    // Resalta la tira a la que pertenece un agujero (o la apaga con null): enseña qué está unido por dentro.
    highlight(name) {
      const hl = this.shadowRoot && this.shadowRoot.querySelector('.hl'); if (!hl) return;
      const key = name && stripOf(name, kind, { rails: this.getAttribute('rails') }); if (!key) { hl.setAttribute('opacity', 0); return; }
      const same = L.pins.filter(p => stripOf(p.name, kind, { rails: this.getAttribute('rails') }) === key);
      const xs = same.map(p => p.x), ys = same.map(p => p.y); const x = Math.min(...xs) - P * 0.42, y = Math.min(...ys) - P * 0.42;
      hl.setAttribute('x', n(x)); hl.setAttribute('y', n(y)); hl.setAttribute('width', n(Math.max(...xs) + P * 0.42 - x)); hl.setAttribute('height', n(Math.max(...ys) + P * 0.42 - y)); hl.setAttribute('opacity', 0.28);
    }
  });
}
export function defineProtoboards() { define('plato-breadboard', 'full'); define('plato-breadboard-half', 'half'); define('plato-breadboard-mini', 'mini'); }
