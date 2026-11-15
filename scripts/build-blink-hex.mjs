// Genera taller/hex/blink.hex.txt: el «Parpadeo» del Arduino Uno ya listo para simular sin compilador.
// Está ensamblado aquí mismo, instrucción a instrucción (no sale de ningún otro proyecto), y hace lo que el
// ejemplo en C++: el LED del pin 13 (PB5) medio segundo encendido y medio apagado, con el reloj de 16 MHz.
//
//        ldi  r16, 0x08      ; pila al final de la RAM (0x08FF)
//        out  SPH, r16
//        ldi  r16, 0xFF
//        out  SPL, r16
//        sbi  DDRB, 5        ; pin 13 como salida
// loop:  sbi  PORTB, 5       ; encender
//        rcall espera
//        cbi  PORTB, 5       ; apagar
//        rcall espera
//        rjmp loop
// espera: ldi r18..r20 = 1 600 000   ; 5 ciclos por vuelta → 8 000 000 ciclos = 0,5 s
// vuelta: subi r18, 1 / sbci r19, 0 / sbci r20, 0 / brne vuelta
//        ret
//
// Uso: node scripts/build-blink-hex.mjs   (comprueba el resultado en el emulador antes de escribirlo)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ldi = (r, k) => 0xE000 | ((k & 0xF0) << 4) | ((r - 16) << 4) | (k & 0x0F);
const out = (a, r) => 0xB800 | ((a & 0x30) << 5) | (r << 4) | (a & 0x0F);
const sbi = (a, b) => 0x9A00 | (a << 3) | b, cbi = (a, b) => 0x9800 | (a << 3) | b;
const rel = (op, from, to) => op | ((to - from - 1) & 0x0FFF);            // rjmp / rcall
const subi = (r, k) => 0x5000 | ((k & 0xF0) << 4) | ((r - 16) << 4) | (k & 0x0F);
const sbci = (r, k) => 0x4000 | ((k & 0xF0) << 4) | ((r - 16) << 4) | (k & 0x0F);
const brne = (from, to) => 0xF401 | (((to - from - 1) & 0x7F) << 3);
const SPH = 0x3E, SPL = 0x3D, DDRB = 0x04, PORTB = 0x05, RCALL = 0xD000, RJMP = 0xC000, RET = 0x9508;
const N = 1_600_000, LOOP = 5, WAIT = 10, TURN = 13;

const words = [
  ldi(16, 0x08), out(SPH, 16), ldi(16, 0xFF), out(SPL, 16), sbi(DDRB, 5),
  sbi(PORTB, 5), rel(RCALL, 6, WAIT), cbi(PORTB, 5), rel(RCALL, 8, WAIT), rel(RJMP, 9, LOOP),
  ldi(18, N & 255), ldi(19, (N >> 8) & 255), ldi(20, (N >> 16) & 255),
  subi(18, 1), sbci(19, 0), sbci(20, 0), brne(16, TURN), RET,
];

// Formato Intel HEX
const bytes = words.flatMap(w => [w & 255, w >> 8]); const lines = [];
for (let a = 0; a < bytes.length; a += 16) { const row = bytes.slice(a, a + 16); const rec = [row.length, a >> 8, a & 255, 0, ...row]; const sum = (-rec.reduce((x, y) => x + y, 0)) & 255;
  lines.push(':' + [...rec, sum].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('')); }
lines.push(':00000001FF'); const hex = lines.join('\n') + '\n';

// Comprobación en el mismo emulador que usa el Taller: el pin 13 tiene que cambiar cada 0,5 s
const A = await import(path.join(ROOT, 'js/vendor/avr8js.js'));
const prog = new Uint16Array(0x4000); words.forEach((w, i) => { prog[i] = w; });
const cpu = new A.CPU(prog); const portB = new A.AVRIOPort(cpu, A.portBConfig); const edges = [];
portB.addListener((v, old) => { if ((v ^ old) & 0x20) edges.push([cpu.cycles / 16e6, !!(v & 0x20)]); });
while (cpu.cycles < 16e6 * 2.2) { A.avrInstruction(cpu); cpu.tick(); }
const gaps = edges.slice(1).map((e, i) => e[0] - edges[i][0]);
if (edges.length < 4 || !edges[0][1] || gaps.some(g => Math.abs(g - 0.5) > 0.001)) throw new Error('El parpadeo no sale bien: ' + JSON.stringify(edges));
fs.mkdirSync(path.join(ROOT, 'taller/hex'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'taller/hex/blink.hex.txt'), hex);
console.log(`blink.hex.txt: ${bytes.length} bytes de programa · cambios del pin 13 en t = ${edges.map(e => e[0].toFixed(3)).join(', ')} s`);
