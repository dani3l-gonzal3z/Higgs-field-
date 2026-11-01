// Generador de códigos QR sin dependencias (modo byte, corrección M). Basado en el algoritmo público de Nayuki (MIT).
const ECC = { L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28] };
const BLOCKS = { L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49] };
const FORMAT = { L: 1, M: 0 };
const bit = (x, i) => ((x >>> i) & 1) !== 0;
function rawModules(v) { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; }
const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC[e][v] * BLOCKS[e][v];
function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; }
function rsDivisor(deg) { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); } return r; }
function rsRemainder(data, div) { const r = div.map(() => 0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); } return r; }
function alignPos(v) { if (v === 1) return []; const n = Math.floor(v / 7) + 2, size = v * 4 + 17; const step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2; const out = [6]; for (let i = 0, p = size - 7; i < n - 1; i++, p -= step) out.splice(1, 0, p); return out; }

export function qrMatrix(text, ecl = 'M') {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let v = 1; for (; v <= 40; v++) { const cc = v <= 9 ? 8 : 16; if (4 + cc + bytes.length * 8 <= dataCodewords(v, ecl) * 8) break; } if (v > 40) throw new Error('Texto demasiado largo para un QR');
  const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v <= 9 ? 8 : 16); for (const b of bytes) put(b, 8);
  const cap = dataCodewords(v, ecl) * 8; put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
  for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  // Bloques y corrección de errores
  const nb = BLOCKS[ecl][v], el = ECC[ecl][v], raw = Math.floor(rawModules(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb); const div = rsDivisor(el); const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) { const d = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += d.length; const e = rsRemainder(d, div); if (i < nShort) d.push(0); blocks.push(d.concat(e)); }
  const cw = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) cw.push(b[i]); });
  // Matriz
  const size = v * 4 + 17; const M = Array.from({ length: size }, () => new Array(size).fill(false)); const F = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); }
  const ap = alignPos(v), na = ap.length; for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) { if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
  const drawFormat = mask => { const d = FORMAT[ecl] << 3 | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = ((d << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(b, i)); set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8)); for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i)); set(8, size - 8, true); };
  drawFormat(0);
  if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); const b = v << 12 | r; for (let i = 0; i < 18; i++) { const bb = bit(b, i), a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bb); set(c, a, bb); } }
  let i = 0; for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert; if (!F[y][x] && i < cw.length * 8) { M[y][x] = bit(cw[i >>> 3], 7 - (i & 7)); i++; } } }
  const maskFn = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
  const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && maskFn[m](x, y)) M[y][x] = !M[y][x]; };
  const penalty = () => { let p = 0, dark = 0;
    for (let y = 0; y < size; y++) { let run = 1; for (let x = 1; x <= size; x++) { if (x < size && M[y][x] === M[y][x - 1]) run++; else { if (run >= 5) p += run - 2; run = 1; } } }
    for (let x = 0; x < size; x++) { let run = 1; for (let y = 1; y <= size; y++) { if (y < size && M[y][x] === M[y - 1][x]) run++; else { if (run >= 5) p += run - 2; run = 1; } } }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
    for (const row of M) for (const c of row) if (c) dark++; p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10; return p; };
  let best = 0, bestP = Infinity; for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } applyMask(m); }
  applyMask(best); drawFormat(best); return M;
}
export function qrSVG(text, { border = 3, dark = '#000', light = '#fff' } = {}) {
  const M = qrMatrix(text); const n = M.length + border * 2; let d = '';
  M.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + border} ${y + border}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
