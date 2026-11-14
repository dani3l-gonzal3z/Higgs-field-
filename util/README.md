# Útil HIL de Plató

Una Raspberry Pi Pico (o Pico 2) con MicroPython que pone tu placa de verdad dentro de una planta simulada.
Lo que «ven» los sensores de la planta sale por sus pines; lo que tu placa manda a los motores y cilindros vuelve a Plató por USB.

## Patillaje

| Pico | Función | Hacia/desde tu placa |
|---|---|---|
| GP0 / GP1 | UART TX / RX | puerto serie de tu placa |
| GP2-GP9 | DO0-DO7 | salidas digitales (sensores de la planta) |
| GP10 / GP11 / GP12 | ENC A / B / Z | encoder en cuadratura (PIO, cientos de kHz) |
| GP13-GP19, GP22 | DI0-DI7 | entradas digitales (actuadores) con hora en µs; PWM medido por PIO |
| GP20 / GP21 | I2C0 SDA / SCL | DAC MCP4728 (0x60): AO0-AO3 |
| GP26-GP28 | AI0-AI2 | entradas analógicas |

La versión de laboratorio trabaja a 3,3 V. La industrial añade optoacopladores y etapas de 24 V (ver el documento del útil).

## Protocolo (líneas de texto por USB)

| Plató → útil | | útil → Plató | |
|---|---|---|---|
| `O ch v` | DOch = v | `I ch v t` | flanco en DIch (t en µs) |
| `M hex` | las 8 DO a la vez | `D hex t` | estado de las DI |
| `S t ch v` | DOch = v en el instante t | `V a0 a1 a2` | entradas analógicas (0-65535) |
| `A ch n` | AOch = n (0-4095) | `F ch hz duty` | PWM medido en DIch |
| `E hz [cpr]` | encoder (negativo = al revés) | `U hex` | bytes del UART |
| `P ch 0/1` | medir PWM en DIch | `H t` / `T t` | latido / hora |
| `N ch 0/1` | invertir DIch | `ID …` | identificación |
| `B baud` / `U hex` | UART hacia la placa | `! texto` | aviso o error |
| `R ms` · `W ms` · `K hex` · `T` · `X` · `?` | periodo de informes · vigilancia · máscara segura · hora · reposo · quién eres | | |

## Instalarlo

1. Graba MicroPython en la Pico (arrastra el `.uf2` oficial).
2. En Plató: Taller → 🏭 Planta → «🔌 Placa real (útil)» → «⬇ Instalar firmware». O copia `firmware/main.py` con Thonny o `mpremote cp firmware/main.py :main.py`.
3. «🔌 Conectar el útil», cablea tu placa a DO/DI según la lista de señales y pon tu programa a funcionar en ella.
