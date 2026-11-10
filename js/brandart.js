// Dibujo de marca: logo, etiqueta del envase y muestras de paleta, siempre desde el mismo kit.
// Lo usan la sección Marcas (pantalla) y el escenario de anuncios (texturas 3D), para que todo salga igual.

export const FONTS = {
  rounded: { label: 'Redondeada', css: '"Arial Rounded MT Bold","SF Pro Rounded","Nunito","Varela Round",ui-rounded,"Segoe UI",system-ui,sans-serif', weight: 800 },
  geometric: { label: 'Geométrica', css: '"Futura","Century Gothic","Avenir Next","Montserrat","Segoe UI",system-ui,sans-serif', weight: 800 },
  grotesk: { label: 'Neutra', css: '"Helvetica Neue","Inter","Segoe UI",Arial,system-ui,sans-serif', weight: 800 },
  serif: { label: 'Con remate', css: '"Cooper Black","Recoleta","Georgia","Times New Roman",serif', weight: 800 },
  condensed: { label: 'Estrecha', css: '"Bebas Neue","Oswald","Impact","Arial Narrow",sans-serif', weight: 700 },
  script: { label: 'Manuscrita', css: '"Brush Script MT","Segoe Script","Lucida Handwriting",cursive', weight: 400 },
};
export const font = (kit, which = 'display') => FONTS[(kit.type || {})[which]] || FONTS[which === 'display' ? 'rounded' : 'grotesk'];
const hexOk = c => /^#[0-9a-f]{6}$/i.test(String(c || ''));
export const pal = (kit, role, fb = '#222222') => { const p = (kit.palette || []).find(x => x.role === role); return p && hexOk(p.hex) ? p.hex : fb; };
// Color legible encima de un fondo
export function ink(bg) { const h = String(bg).replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); const L = 0.2126 * r + 0.7152 * g + 0.0722 * b; return L > 0.6 ? '#1e1b2e' : '#ffffff'; }
export function shade(hex, k) { const h = String(hex).replace('#', ''); const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))); return '#' + c.map(v => f(v).toString(16).padStart(2, '0')).join(''); }
// Colores de las letras del logotipo (multicolor): los de los productos, o la paleta
function letterColors(kit) { const ps = (kit.products || []).map(p => p.color).filter(hexOk); const pl = (kit.palette || []).filter(p => p.role !== 'fondo' && p.role !== 'texto').map(p => p.hex).filter(hexOk); return ps.length ? ps : pl.length ? pl : ['#e11d48', '#f97316', '#16a34a', '#2563eb']; }

/* ---------- Logo ---------- */
// Encaja el logotipo en un rectángulo (cx, cy = centro). onDark: versión para fondo oscuro.
export function drawLogo(ctx, kit, cx, cy, w, h, { onDark = false } = {}) {
  const L = kit.logo || {}; const text = String(L.text || kit.name || 'Marca'); const f = font(kit, 'display'); const style = L.style || 'solid';
  const main = onDark ? '#ffffff' : pal(kit, 'texto', '#1e1b2e'); const accent = pal(kit, 'acento', letterColors(kit)[0]);
  ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  let size = h * 0.78; const setF = () => { ctx.font = `${f.weight} ${size}px ${f.css}`; }; setF();
  const padX = style === 'badge' ? h * 0.35 : 0; let tw = ctx.measureText(text).width; const maxW = w - padX * 2 - (L.mark && L.mark !== 'none' ? h * 0.25 : 0);
  if (tw > maxW) { size *= maxW / tw; setF(); tw = ctx.measureText(text).width; }
  const asc = size * 0.72, x0 = cx - tw / 2, base = cy + asc / 2;
  if (style === 'badge') { const bw = tw + padX * 2, bh = size * 1.25; ctx.fillStyle = accent; rr(ctx, cx - bw / 2, cy - bh / 2, bw, bh, bh / 2); ctx.fill(); }
  const cols = letterColors(kit); let x = x0; const ltrs = [...text];
  // contorno suave para que las letras de colores claros se lean sobre blanco
  ltrs.forEach((ch, i) => { const cw = ctx.measureText(ch).width; let col = style === 'multicolor' ? cols[i % cols.length] : style === 'badge' ? ink(accent) : main;
    if (style === 'multicolor') { ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.09; ctx.strokeStyle = onDark ? 'rgba(0,0,0,.35)' : 'rgba(30,27,46,.85)'; ctx.strokeText(ch, x, base); }
    ctx.fillStyle = col; ctx.fillText(ch, x, base);
    // brote sobre la i acentuada o la primera i (marca "sprout")
    if (L.mark === 'sprout' && /[íi]/.test(ch) && !ctx.__sprout) { ctx.__sprout = true; sprout(ctx, x + cw / 2, base - asc - size * 0.02, size * 0.42, pal(kit, 'hoja', '#2e9e4f')); }
    x += cw; });
  delete ctx.__sprout;
  if (L.mark && L.mark !== 'none' && L.mark !== 'sprout') { const m = h * 0.34, mx = x0 + tw + m * 0.75, my = base - asc * 0.85; markIcon(ctx, L.mark, mx, my, m, accent); }
  ctx.restore(); return { width: tw, size };
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function leaf(ctx, x, y, len, ang, col) { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0); ctx.fillStyle = col; ctx.fill(); ctx.restore(); }
function sprout(ctx, x, y, s, col) { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = s * 0.12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y + s * 0.15); ctx.lineTo(x, y - s * 0.25); ctx.stroke(); leaf(ctx, x, y - s * 0.22, s * 0.62, -Math.PI * 0.85, col); leaf(ctx, x, y - s * 0.28, s * 0.7, -Math.PI * 0.18, shade(col, 0.15)); ctx.restore(); }
export function markIcon(ctx, mark, x, y, s, col) { ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = col;
  if (mark === 'sun') { ctx.beginPath(); ctx.arc(x, y, s * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = s * 0.08; ctx.lineCap = 'round'; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 0.44, y + Math.sin(a) * s * 0.44); ctx.lineTo(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6); ctx.stroke(); } }
  else if (mark === 'drop') { ctx.beginPath(); ctx.moveTo(x, y - s * 0.55); ctx.bezierCurveTo(x + s * 0.5, y, x + s * 0.4, y + s * 0.5, x, y + s * 0.5); ctx.bezierCurveTo(x - s * 0.4, y + s * 0.5, x - s * 0.5, y, x, y - s * 0.55); ctx.fill(); }
  else if (mark === 'star') { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.22 : s * 0.55; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
  else if (mark === 'leaf') { leaf(ctx, x - s * 0.4, y + s * 0.3, s * 0.95, -Math.PI / 4, col); }
  else if (mark === 'spark') { ctx.beginPath(); ctx.moveTo(x, y - s * 0.6); ctx.quadraticCurveTo(x, y, x + s * 0.6, y); ctx.quadraticCurveTo(x, y, x, y + s * 0.6); ctx.quadraticCurveTo(x, y, x - s * 0.6, y); ctx.quadraticCurveTo(x, y, x, y - s * 0.6); ctx.fill(); }
  ctx.restore(); }
// SVG del logotipo para descargar (texto con la misma pila de fuentes)
export function logoSVG(kit, { onDark = false } = {}) { const L = kit.logo || {}; const text = String(L.text || kit.name || 'Marca'); const f = font(kit, 'display'); const cols = letterColors(kit); const main = onDark ? '#ffffff' : pal(kit, 'texto', '#1e1b2e');
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const spans = [...text].map((ch, i) => `<tspan fill="${L.style === 'multicolor' ? cols[i % cols.length] : main}">${esc(ch)}</tspan>`).join('');
  const stroke = L.style === 'multicolor' ? ` stroke="${onDark ? 'rgba(0,0,0,.35)' : 'rgba(30,27,46,.85)'}" stroke-width="8" paint-order="stroke" stroke-linejoin="round"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300"><text x="500" y="200" text-anchor="middle" font-family='${f.css.replace(/'/g, '')}' font-weight="${f.weight}" font-size="190"${stroke}>${spans}</text></svg>`; }

/* ---------- Crujiente e ingredientes (iconos planos para etiquetas y tarjetas) ---------- */
export function chipIcon(ctx, x, y, s, col, rot = 0) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.62, 0, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = shade(col, -0.25); ctx.lineWidth = s * 0.07; ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.78, s * 0.42, 0, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.ellipse(-s * 0.3, -s * 0.2, s * 0.28, s * 0.12, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
export function vegIcon(ctx, veg, x, y, s, col) { ctx.save(); const green = '#2e9e4f';
  const v = String(veg || '').toLowerCase();
  if (/zanahoria|carrot/.test(v)) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - s * 0.3, y - s * 0.45); ctx.lineTo(x + s * 0.3, y - s * 0.45); ctx.lineTo(x, y + s * 0.65); ctx.closePath(); ctx.fill(); leaf(ctx, x, y - s * 0.45, s * 0.5, -Math.PI / 2 - 0.4, green); leaf(ctx, x, y - s * 0.45, s * 0.55, -Math.PI / 2 + 0.4, green); }
  else if (/espinaca|kale|hoja|lechuga|spinach/.test(v)) { leaf(ctx, x - s * 0.1, y + s * 0.5, s * 1.1, -Math.PI / 2 + 0.25, col); ctx.strokeStyle = shade(col, -0.3); ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.moveTo(x - s * 0.1, y + s * 0.5); ctx.lineTo(x + s * 0.15, y - s * 0.5); ctx.stroke(); }
  else if (/calabaza|pumpkin/.test(v)) { ctx.fillStyle = col; for (const dx of [-0.28, 0.28, 0]) { ctx.beginPath(); ctx.ellipse(x + dx * s, y + s * 0.1, s * 0.34, s * 0.45, 0, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x - s * 0.05, y - s * 0.5, s * 0.1, s * 0.18); }
  else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y + s * 0.1, s * 0.45, 0, Math.PI * 2); ctx.fill(); leaf(ctx, x, y - s * 0.3, s * 0.5, -Math.PI / 2 - 0.5, green); leaf(ctx, x, y - s * 0.3, s * 0.5, -Math.PI / 2 + 0.5, green); }
  ctx.restore(); }

/* ---------- Etiqueta del envase (textura que envuelve el tubo) ---------- */
// La textura da la vuelta entera al tubo; el frontal es el centro de la imagen (el escenario la gira para que mire a cámara).
export function drawLabel(canvas, kit, product, { w = 2048, h = 1024 } = {}) {
  canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); const base = pal(kit, 'fondo', '#fff8ec'), txt = pal(kit, 'texto', '#1e1b2e'); const col = hexOk(product && product.color) ? product.color : pal(kit, 'acento', '#e11d48');
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  // ola de color abajo y franja arriba
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.66 + Math.sin(x / w * Math.PI * 6) * h * 0.045); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(col, -0.18); ctx.beginPath(); ctx.moveTo(0, h); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.8 + Math.sin(x / w * Math.PI * 6 + 1.4) * h * 0.035); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col; ctx.fillRect(0, 0, w, h * 0.055);
  // frontal: logo, sabor, crujientes
  const fx = w / 2, FW = w * 0.19; drawLogo(ctx, kit, fx, h * 0.22, FW * 1.05, h * 0.2);
  const fb = font(kit, 'display'), ft = font(kit, 'body');
  ctx.textAlign = 'center'; ctx.fillStyle = txt; fitText(ctx, String(kit.claim || kit.tagline || '').slice(0, 40), fx, h * 0.38, FW, h * 0.045, { css: ft.css, weight: 600 });
  for (let i = 0; i < 5; i++) chipIcon(ctx, fx - h * 0.16 + i * h * 0.08, h * 0.5 + (i % 2) * h * 0.02, h * 0.07, shade(col, (i % 3 - 1) * 0.12), (i - 2) * 0.25);
  ctx.fillStyle = ink(col); fitText(ctx, String((product && product.name) || '').toUpperCase().slice(0, 18), fx, h * 0.8, FW, h * 0.085, fb);
  if (product && product.veg) { vegIcon(ctx, product.veg, fx - FW * 0.62, h * 0.53, h * 0.08, col); vegIcon(ctx, product.veg, fx + FW * 0.62, h * 0.53, h * 0.08, col); }
  fitText(ctx, String((product && product.claim) || '').slice(0, 44), fx, h * 0.9, FW, h * 0.035, { css: ft.css, weight: 700 });
  // insignia
  if (kit.badge) { ctx.save(); ctx.translate(fx + FW * 0.72, h * 0.36); ctx.rotate(0.18); ctx.fillStyle = pal(kit, 'acento', col); ctx.beginPath(); ctx.arc(0, 0, h * 0.075, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ink(pal(kit, 'acento', col)); ctx.font = `800 ${h * 0.026}px ${ft.css}`; const ws = String(kit.badge).toUpperCase().split(' '); ws.slice(0, 3).forEach((wd, i) => ctx.fillText(wd, 0, (i - (Math.min(3, ws.length) - 1) / 2) * h * 0.03 + h * 0.01)); ctx.restore(); }
  // trasera: nombre pequeño, texto y código de barras
  const bx = w * 0.04, bw = w * 0.2; ctx.textAlign = 'left'; ctx.fillStyle = txt; ctx.font = `700 ${h * 0.032}px ${ft.css}`; ctx.fillText(String(kit.name || ''), bx, h * 0.18);
  ctx.font = `400 ${h * 0.024}px ${ft.css}`; wrap(ctx, String(kit.story || ''), bx, h * 0.24, bw, h * 0.032, 8);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(w - bx - bw * 0.6, h * 0.4, bw * 0.6, h * 0.14); ctx.fillStyle = '#111'; for (let i = 0; i < 38; i++) { const bwid = (i * 7) % 3 + 1; ctx.fillRect(w - bx - bw * 0.58 + i * bw * 0.015, h * 0.41, bwid * 1.5, h * 0.1); }
  if (product && product.weight) { ctx.fillStyle = ink(col); ctx.textAlign = 'right'; ctx.font = `700 ${h * 0.03}px ${ft.css}`; ctx.fillText(product.weight, w - bx, h * 0.95); }
  return canvas;
}
function fitText(ctx, t, x, y, maxW, size, f) { ctx.font = `${f.weight} ${size}px ${f.css}`; const tw = ctx.measureText(t).width; if (tw > maxW) ctx.font = `${f.weight} ${size * maxW / tw}px ${f.css}`; ctx.fillText(t, x, y); }
function wrap(ctx, text, x, y, maxW, lh, maxLines) { const ws = text.split(/\s+/); let line = '', n = 0; for (const wd of ws) { const t = line ? line + ' ' + wd : wd; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y + n * lh); line = wd; if (++n >= maxLines) return; } else line = t; } if (line) ctx.fillText(line, x, y + n * lh); }

/* ---------- Cierre del anuncio (logo + eslogan sobre fondo de marca) ---------- */
export function drawEndCard(canvas, kit, { w = 1280, h = 720, bg } = {}) { canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); const b = bg || pal(kit, 'fondo', '#fff8ec'); ctx.fillStyle = b; ctx.fillRect(0, 0, w, h);
  drawLogo(ctx, kit, w / 2, h * 0.42, w * 0.6, h * 0.3, { onDark: ink(b) === '#ffffff' }); const ft = font(kit, 'body'); ctx.textAlign = 'center'; ctx.fillStyle = ink(b) === '#ffffff' ? '#fff' : pal(kit, 'texto', '#1e1b2e'); ctx.font = `700 ${h * 0.055}px ${ft.css}`; ctx.fillText(String(kit.tagline || ''), w / 2, h * 0.72); return canvas; }
