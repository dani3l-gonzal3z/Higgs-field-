// Construye las librerías del Taller a partir de su código fuente (sin npm):
//   node scripts/build-taller-vendor.mjs <carpeta-con-clones>
// La carpeta debe tener: avr8js, rp2040js, wokwi-elements (o "we"), lit y velxio clonados de GitHub.
// Necesita esbuild (npm i -g esbuild o una ruta en ESBUILD).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = path.resolve(process.argv[2] || '../ref');
const pick = (...n) => n.map(x => path.join(REF, x)).find(p => fs.existsSync(p));
const AVR = pick('avr8js'), RP = pick('rp2040js'), WE = pick('wokwi-elements', 'we'), LIT = pick('lit'), VX = pick('velxio');
if (!AVR || !RP || !WE || !LIT || !VX) { console.error('Faltan clones en', REF, { AVR, RP, WE, LIT, VX }); process.exit(1); }
const esbuild = await import(process.env.ESBUILD || 'esbuild');
const OUT = path.join(ROOT, 'js', 'vendor'), ART = path.join(ROOT, 'taller');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(path.join(ART, 'art'), { recursive: true });

const LP = path.join(LIT, 'packages');
const litMap = { 'lit': 'lit/src/index.ts', 'lit-html': 'lit-html/src/lit-html.ts', 'lit-element': 'lit-element/src/index.ts', '@lit/reactive-element': 'reactive-element/src/reactive-element.ts' };
const litSub = { 'lit/': 'lit/src/', 'lit-html/': 'lit-html/src/', 'lit-element/': 'lit-element/src/', '@lit/reactive-element/': 'reactive-element/src/' };
const litPlugin = { name: 'lit', setup(b) {
  b.onLoad({ filter: /[\\/]lit[\\/]packages[\\/].*\.ts$/ }, a => { const c = fs.readFileSync(a.path, 'utf8'); if (process.env.DBG && c.includes('const DEV_MODE = true')) console.log('dev', a.path); return { contents: c.replace(/const DEV_MODE = true/g, 'const DEV_MODE = false'), loader: 'ts' }; });
  b.onResolve({ filter: /^(lit|lit-html|lit-element|@lit\/reactive-element)(\/.*)?$/ }, a => {
  if (litMap[a.path]) return { path: path.join(LP, litMap[a.path]) };
  for (const [k, v] of Object.entries(litSub)) if (a.path.startsWith(k)) return { path: path.join(LP, v, a.path.slice(k.length).replace(/\.js$/, '.ts')) }; }); } };
const common = { bundle: true, format: 'esm', target: 'es2020', minify: true, legalComments: 'inline', logLevel: 'error', define: { DEV_MODE: 'false', 'process.env.NODE_ENV': '"production"' } };
const tmp = path.join(ROOT, '.taller-build'); fs.mkdirSync(tmp, { recursive: true });
const entry = (name, code) => { const f = path.join(tmp, name); fs.writeFileSync(f, code); return f; };

await esbuild.build({ ...common, entryPoints: [path.join(AVR, 'src/index.ts')], outfile: path.join(OUT, 'avr8js.js'), banner: { js: '/* avr8js — MIT — https://github.com/wokwi/avr8js */' } });
await esbuild.build({ ...common, entryPoints: [entry('rp.ts', `export * from ${JSON.stringify(path.join(RP, 'src/index.ts'))};\nexport { bootromB1 } from ${JSON.stringify(path.join(RP, 'demo/bootrom.ts'))};\n`)], outfile: path.join(OUT, 'rp2040js.js'), banner: { js: '/* rp2040js — MIT — https://github.com/wokwi/rp2040js (incluye el bootrom B1 de Raspberry Pi, BSD-3) */' } });
await esbuild.build({ ...common, entryPoints: [entry('we.ts', `export * from ${JSON.stringify(path.join(WE, 'src/index.ts'))};\n`)], outfile: path.join(OUT, 'wokwi-elements.js'), plugins: [litPlugin], tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } }, banner: { js: '/* @wokwi/elements — MIT — https://github.com/wokwi/wokwi-elements · lit — BSD-3-Clause — https://github.com/lit/lit */' } });
// Protoboards de Velxio (AGPL-3.0): solo dibujan y exponen los agujeros; las uniones las hace el Taller.
const vxe = path.join(VX, 'frontend/src/velxio-elements');
await esbuild.build({ ...common, entryPoints: [entry('vx.ts', `export * from ${JSON.stringify(path.join(vxe, 'breadboard-element.ts'))};\nexport * from ${JSON.stringify(path.join(vxe, 'breadboard-mini-element.ts'))};\n`)], outfile: path.join(OUT, 'velxio-breadboards.js'), banner: { js: '/* Protoboards de Velxio — AGPL-3.0 — https://github.com/davidmonterocrespo24/velxio · arte de Fritzing CC-BY-SA 3.0 */' } });
let vx = fs.readFileSync(path.join(OUT, 'velxio-breadboards.js'), 'utf8').replaceAll('/component-svgs/fritzing/', 'taller/art/');
fs.writeFileSync(path.join(OUT, 'velxio-breadboards.js'), vx);
// Recursos
const cp = (a, b) => fs.copyFileSync(path.join(VX, a), path.join(ART, b));
cp('frontend/public/component-svgs/fritzing/breadboard-full.svg', 'art/breadboard-full.svg');
cp('frontend/public/component-svgs/fritzing/breadboard-mini.svg', 'art/breadboard-mini.svg');
cp('frontend/public/component-svgs/fritzing/ATTRIBUTION.md', 'art/ATTRIBUTION.md');
cp('frontend/public/boards/pi-pico.svg', 'art/pi-pico.svg');
cp('frontend/public/firmware/micropython-rp2040.uf2', 'micropython-rp2040.bin'); // UF2 tal cual, con .bin para que lo sirva cualquier hosting
fs.rmSync(tmp, { recursive: true, force: true });
for (const f of ['avr8js.js', 'rp2040js.js', 'wokwi-elements.js', 'velxio-breadboards.js']) console.log(f, Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + ' KB');
