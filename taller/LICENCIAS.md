# Taller de electrónica · procedencia y licencias

El Taller se apoya en proyectos abiertos. Gracias a todos ellos.

| Pieza | De dónde sale | Licencia |
|---|---|---|
| Emulador de Arduino (ATmega328P) | [avr8js](https://github.com/wokwi/avr8js), de Wokwi — `js/vendor/avr8js.js` | MIT |
| Emulador de Raspberry Pi Pico (RP2040) | [rp2040js](https://github.com/wokwi/rp2040js), de Wokwi — `js/vendor/rp2040js.js` (incluye el bootrom B1 de Raspberry Pi, BSD-3) | MIT |
| Dibujo y comportamiento visual de las piezas | [@wokwi/elements](https://github.com/wokwi/wokwi-elements) + [lit](https://github.com/lit/lit) — `js/vendor/wokwi-elements.js` | MIT · BSD-3-Clause |
| Protoboards (`<velxio-breadboard>`, `<velxio-breadboard-mini>`) | [Velxio](https://github.com/davidmonterocrespo24/velxio) — `js/vendor/velxio-breadboards.js` | AGPL-3.0 |
| Arte de las protoboards y de la Pico | Fritzing vía Velxio — `taller/art/` (ver `ATTRIBUTION.md`) | CC-BY-SA 3.0 |
| Firmware de MicroPython para la Pico | [MicroPython](https://micropython.org) (copia de Velxio) — `taller/micropython-rp2040.uf2` | MIT |
| Programa de ejemplo ya compilado (Parpadeo) | Fixture de pruebas de Velxio — `taller/hex/blink.hex` | AGPL-3.0 |

El código propio del Taller (`js/taller.js`, `js/taller/*`, `mcp/taller.mjs`) incorpora ideas y piezas de Velxio
(reglas de la protoboard, convención de nombres de agujeros, patillaje de la Pico, avisos de LED quemado),
así que esa parte se distribuye bajo **AGPL-3.0** como Velxio.

## Qué hemos mejorado respecto a Velxio

- Todo en el navegador y sin compilar con la Pico: MicroPython corre dentro del emulador y el programa se manda por el REPL «raw», con control de flujo (el FIFO USB de 512 bytes ya no pierde programas largos) y los errores de Python aparecen con su traza en el monitor.
- Reloj a tiempo real en la Pico: `time.sleep()` dura lo que tiene que durar (el simulador de rp2040js va tan rápido como puede).
- Avisos pensados para quien aprende: LED sin resistencia (y el LED «se quema» en pantalla), cortocircuitos, 5 V en un pin de la Pico.
- PWM real en los LEDs (brillo), servo por ancho de pulso, zumbador con sonido, LCD 16×2 en 4 bits y sensor ultrasónico con temporización al microsegundo.
- El profe de Plató diseña el circuito y el código a partir de una frase y explica el circuito que tengas.
- «A la mesa»: lista de la compra, montaje paso a paso cable a cable y grabación en la placa real por USB.
- Compatible con el `diagram.json` de Wokwi y Velxio en los dos sentidos.

## Reconstruir las librerías

```
git clone https://github.com/wokwi/avr8js ref/avr8js
git clone https://github.com/wokwi/rp2040js ref/rp2040js
git clone https://github.com/wokwi/wokwi-elements ref/wokwi-elements
git clone https://github.com/lit/lit ref/lit
git clone https://github.com/davidmonterocrespo24/velxio ref/velxio
node scripts/build-taller-vendor.mjs ref        # necesita esbuild
```
