// Saca de Velxio (AGPL-3.0) el dibujo y el patillaje de sus placas ESP32 y STM32 y lo deja listo para el Taller:
//   js/taller/boards-art.js   → medidas, patas y LEDs de cada placa (ya a la escala del Taller: paso de 0,1" = 9,6 px)
//   taller/art/boards/*.svg   → los dibujos
// Uso: ESBUILD=/ruta/a/esbuild/lib/main.js node scripts/build-taller-boards.mjs /carpeta/con/velxio
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REF = process.argv[2] || '/tmp/ref'; const VX = fs.existsSync(path.join(REF, 'velxio')) ? path.join(REF, 'velxio') : REF;
const esbuild = (await import(pathToFileURL(process.env.ESBUILD || 'esbuild').href)).default;
const SRC = path.join(VX, 'frontend/src/components/velxio-components'), PUB = path.join(VX, 'frontend/public/boards');
const S = 9.6 / 12.7; // Velxio dibuja a 5 px/mm (paso 12,7 px); el Taller usa el paso de Wokwi (9,6 px)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tlb-'));

// Cada módulo de Velxio se compila tal cual y se le añade una línea que exporta sus tablas internas.
async function grab(file, extra) {
  const src = fs.readFileSync(path.join(SRC, file), 'utf8') + '\n' + extra;
  const out = path.join(tmp, file.replace(/\.ts$/, '.mjs'));
  await esbuild.build({ stdin: { contents: src, loader: 'ts', resolveDir: SRC }, bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'error' });
  globalThis.HTMLElement = class {}; globalThis.customElements = { get: () => true, define() {} };
  return import(pathToFileURL(out).href);
}
const esp = await grab('Esp32Element.ts', 'export { BOARD_CONFIGS as __CFG, ONBOARD_LED_FOOTPRINTS as __LEDS };');
const stm = await grab('Stm32BluePillElement.ts', 'export { CONFIGS as __CFG };');

const r = v => Math.round(v * S * 100) / 100;
// Nombres repetidos (GND, 3V3…) se numeran como hace Wokwi (GND.1, GND.2…); dos nombres en el mismo punto (RX2 = 16) se juntan.
function pins(list) {
  const seen = new Map(), out = [], count = {};
  for (const p of list) count[p.name] = (count[p.name] || 0) + 1;
  const idx = {};
  for (const p of list) {
    const key = p.x + ',' + p.y; let name = p.name;
    if (count[name] > 1) { idx[name] = (idx[name] || 0) + 1; name = name + '.' + idx[name]; }
    if (seen.has(key)) { const prev = seen.get(key); const num = /^\d+$/; if (num.test(name) && !num.test(prev.name)) { prev.label = prev.name; prev.name = name; } else prev.label = prev.label || name; continue; }
    const q = { name, x: r(p.x), y: r(p.y) }; seen.set(key, q); out.push(q);
  }
  return out;
}
const ART = {}; const svgs = new Set();
for (const [kind, c] of Object.entries(esp.__CFG)) {
  const f = path.basename(c.svgUrl); svgs.add(f);
  const leds = Object.fromEntries(Object.entries(esp.__LEDS[kind] || {}).map(([id, l]) => [id, { x: r(l.x), y: r(l.y), size: r(l.size), color: l.color || null }]));
  ART[kind] = { svg: 'taller/art/boards/' + f, w: r(c.w), h: r(c.h), pins: pins(c.pins), leds };
}
for (const kind of ['stm32-bluepill', 'stm32-blackpill']) {
  const c = stm.__CFG[kind]; const f = path.basename(c.svgUrl); svgs.add(f);
  ART[kind] = { svg: 'taller/art/boards/' + f, w: r(c.w), h: r(c.h), pins: pins(c.pins), leds: { led: { x: r(c.led.x), y: r(c.led.y), size: r(8), color: kind === 'stm32-bluepill' ? '#3cf05a' : '#3aa0ff' } } };
}
// Pico W: mismo patillaje que la Pico (lo pone el Taller), solo el dibujo
svgs.add('pi-pico-w.svg');

const dst = path.join(ROOT, 'taller/art/boards'); fs.mkdirSync(dst, { recursive: true });
for (const f of svgs) {
  const s = fs.readFileSync(path.join(PUB, f), 'utf8');
  if (/<script|javascript:|\son[a-z]+\s*=|<foreignObject|href\s*=\s*["']https?:/i.test(s)) throw new Error('SVG con contenido activo o externo: ' + f);
  fs.writeFileSync(path.join(dst, f), s);
}
fs.writeFileSync(path.join(ROOT, 'js/taller/boards-art.js'), `// Generado por scripts/build-taller-boards.mjs a partir de Velxio (AGPL-3.0, https://github.com/davidmonterocrespo24/velxio).
// Medidas y patas ya a la escala del Taller (9,6 px por cada 0,1"). No editar a mano.
export const ART = ${JSON.stringify(ART)};\n`);
console.log('placas:', Object.keys(ART).join(', ')); console.log('dibujos:', [...svgs].join(', '));
