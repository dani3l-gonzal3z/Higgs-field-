# Taller de electrónica · procedencia y licencias

El Taller se apoya en tres proyectos abiertos, todos con licencia MIT o BSD. Gracias a ellos.

| Pieza | De dónde sale | Licencia |
|---|---|---|
| Emulador de Arduino (ATmega328P) | [avr8js](https://github.com/wokwi/avr8js), de Wokwi — `js/vendor/avr8js.js` | MIT |
| Emulador de Raspberry Pi Pico (RP2040) | [rp2040js](https://github.com/wokwi/rp2040js), de Wokwi — `js/vendor/rp2040js.js` (incluye el bootrom B1 de Raspberry Pi, BSD-3) | MIT |
| Dibujo de las piezas (LED, resistencia, botón, Uno, Nano…) | [@wokwi/elements](https://github.com/wokwi/wokwi-elements) + [lit](https://github.com/lit/lit) — `js/vendor/wokwi-elements.js` | MIT · BSD-3-Clause |
| Firmware de MicroPython para la Pico | [MicroPython](https://micropython.org/download/RPI_PICO/), el UF2 oficial — `taller/micropython-rp2040.bin` | MIT |

Las licencias MIT y BSD solo piden conservar el aviso de copyright (va en la cabecera de cada archivo de `js/vendor/`).
No obligan a publicar el código de Plató ni condicionan su licencia.

## Hecho aquí (sin código ni arte de terceros)

- **Protoboards** (`js/taller/protoboard.js`): los tres tamaños, sus agujeros, qué tiras están unidas por dentro y el dibujo, todo generado por código.
- **Placas ESP32, STM32 y Pico** (`js/taller/boardart.js` y las descripciones de `boards.js`): el dibujo sale de una descripción en datos; el patillaje es el de la hoja de datos de cada placa.
- **Parpadeo del Uno ya listo** (`taller/hex/blink.hex.txt`): 36 bytes ensamblados a mano; el fuente y la comprobación están en `scripts/build-blink-hex.mjs`.
- El motor eléctrico (`solver.js`), el bus I2C y su esclavo a nivel de pin (`i2c.js`), los modelos de OLED, MPU6050, BMP280, DS1307, LCD I2C, WS2812 y DHT22 (`devices.js`, `taller.js`), los dibujos de transistores, MOSFET, diodo, motor, relé y módulos (`parts.js`), el editor de código (`editor.js`), los instrumentos (`instruments.js`), Web Serial (`webserial.js`), la capa de soporte de cada placa y las librerías de MicroPython incluidas (`ssd1306`, `mpu6050`, `bmp280`, `lcd_i2c`, en `boards.js`). La calibración del BMP280 y sus fórmulas son las de la hoja de datos de Bosch.

Lo único que el Taller comparte con otros editores es un **formato**: el `diagram.json` de Wokwi (nombres de piezas, de patas y de agujeros como `12t.c` o `tp.7`), para poder abrir y guardar sus proyectos.

## Historia

Hasta noviembre de 2026 las protoboards, los dibujos de las placas ESP32/STM32/Pico y el parpadeo compilado venían de
[Velxio](https://github.com/davidmonterocrespo24/velxio) (AGPL-3.0), con arte de Fritzing (CC-BY-SA 3.0). Esos archivos se han quitado
y se han sustituido por los de arriba. Las versiones anteriores del repositorio que los contienen siguen bajo aquellas licencias.

## Reconstruir las librerías

```
git clone https://github.com/wokwi/avr8js ref/avr8js
git clone https://github.com/wokwi/rp2040js ref/rp2040js
git clone https://github.com/wokwi/wokwi-elements ref/wokwi-elements
git clone https://github.com/lit/lit ref/lit
node scripts/build-taller-vendor.mjs ref        # necesita esbuild
node scripts/build-blink-hex.mjs                # el parpadeo del Uno (se comprueba solo en el emulador)
```
