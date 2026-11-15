// Construye las librerías del Taller a partir de su código fuente (sin npm):
//   node scripts/build-taller-vendor.mjs <carpeta-con-clones>
// La carpeta debe tener: avr8js, rp2040js, wokwi-elements (o "we") y lit clonados de GitHub.
// Opcional: el firmware oficial de MicroPython para la Pico (micropython.org/download/RPI_PICO) como micropython-rp2040.uf2.
// Las protoboards y los dibujos de las placas no salen de aquí: son de Plató (js/taller/protoboard.js y boardart.js).
// Necesita esbuild (npm i -g esbuild o una ruta en ESBUILD).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = path.resolve(process.argv[2] || '../ref');
const pick = (...n) => n.map(x => path.join(REF, x)).find(p => fs.existsSync(p));
const AVR = pick('avr8js'), RP = pick('rp2040js'), WE = pick('wokwi-elements', 'we'), LIT = pick('lit'), UF2 = pick('micropython-rp2040.uf2');
if (!AVR || !RP || !WE || !LIT) { console.error('Faltan clones en', REF, { AVR, RP, WE, LIT }); process.exit(1); }
const esbuild = await import(process.env.ESBUILD || 'esbuild');
const OUT = path.join(ROOT, 'js', 'vendor'), ART = path.join(ROOT, 'taller');
fs.mkdirSync(OUT, { recursive: true });

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
// Firmware: el UF2 oficial tal cual, con .bin para que lo sirva cualquier hosting
if (UF2) fs.copyFileSync(UF2, path.join(ART, 'micropython-rp2040.bin'));
fs.rmSync(tmp, { recursive: true, force: true });
for (const f of ['avr8js.js', 'rp2040js.js', 'wokwi-elements.js']) console.log(f, Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + ' KB');
