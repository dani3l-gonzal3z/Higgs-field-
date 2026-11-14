// Ejemplos del Taller. Cada uno trae el circuito (formato diagram.json) y su código para cada tipo de placa:
// C++ (Arduino), MicroPython (Pico, ESP32), MicroPython de STM32 (pyb) y Python de Linux (RPi.GPIO / Hobot.GPIO /
// Jetson.GPIO, gpiozero, wiringpi). Los circuitos usan «papeles» (LED, botón, analógico…) que cada placa asigna a sus patas.
import { BOARDS, keyOf, PHYS2BCM } from './boards.js';
const pinOfKey = (b, k) => { const e = (b.io || []).find(x => x[0] === k); return e ? e[1] : k; };
const P = (type, id, left, top, attrs = {}, rotate = 0) => ({ type, id, left, top, rotate, attrs });
const W = (a, b, color = 'green') => [a, b, color, []];
const UNO = {
 "blink": {
  "title": "Parpadeo",
  "level": 1,
  "about": "Un LED que se enciende y se apaga cada medio segundo. El «hola mundo» de la electrónica.",
  "uno": "// Parpadeo: el LED del pin 13 se enciende y se apaga\nvoid setup() {\n  pinMode(LED_BUILTIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH);\n  delay(500);\n  digitalWrite(LED_BUILTIN, LOW);\n  delay(500);\n}\n"
 },
 "semaforo": {
  "title": "Semáforo",
  "level": 1,
  "about": "Tres LEDs que siguen el ciclo verde, ámbar y rojo.",
  "uno": "// Semáforo: rojo (12), ámbar (11) y verde (10)\nconst int ROJO = 12, AMBAR = 11, VERDE = 10;\n\nvoid setup() {\n  pinMode(ROJO, OUTPUT); pinMode(AMBAR, OUTPUT); pinMode(VERDE, OUTPUT);\n}\n\nvoid luz(int pin, int ms) {\n  digitalWrite(pin, HIGH); delay(ms); digitalWrite(pin, LOW);\n}\n\nvoid loop() {\n  luz(VERDE, 3000);\n  luz(AMBAR, 1000);\n  luz(ROJO, 3000);\n}\n"
 },
 "boton": {
  "title": "Botón y LED",
  "level": 1,
  "about": "Mientras pulsas el botón, el LED se enciende. Usa la resistencia interna del pin (pull-up).",
  "uno": "// Botón en el pin 2 (a GND) y LED en el 13\nvoid setup() {\n  pinMode(2, INPUT_PULLUP);   // sin pulsar lee HIGH; pulsado, LOW\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  bool pulsado = digitalRead(2) == LOW;\n  digitalWrite(13, pulsado ? HIGH : LOW);\n}\n"
 },
 "pot": {
  "title": "Potenciómetro y brillo",
  "level": 2,
  "about": "Giras el potenciómetro y el LED brilla más o menos (PWM). Pulsa ▶ y mueve la rueda.",
  "uno": "// Potenciómetro en A0 regula el brillo del LED del pin 9 (PWM)\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int lectura = analogRead(A0);          // 0 … 1023\n  int brillo = map(lectura, 0, 1023, 0, 255);\n  analogWrite(9, brillo);\n  Serial.println(lectura);\n  delay(50);\n}\n"
 },
 "servo": {
  "title": "Servo con potenciómetro",
  "level": 2,
  "about": "El servo sigue al potenciómetro: la base de cualquier brazo robótico.",
  "uno": "// El servo del pin 9 sigue al potenciómetro de A0\n#include <Servo.h>\nServo brazo;\n\nvoid setup() {\n  brazo.attach(9);\n}\n\nvoid loop() {\n  int angulo = map(analogRead(A0), 0, 1023, 0, 180);\n  brazo.write(angulo);\n  delay(15);\n}\n"
 },
 "melodia": {
  "title": "Melodía con zumbador",
  "level": 2,
  "about": "Toca una melodía cambiando la frecuencia del pin. Sube el volumen.",
  "uno": "// Zumbador en el pin 8\nint notas[] = {262, 294, 330, 349, 392, 440, 494, 523};\n\nvoid setup() {\n  for (int i = 0; i < 8; i++) {\n    tone(8, notas[i], 250);\n    delay(300);\n  }\n}\n\nvoid loop() {}\n"
 },
 "distancia": {
  "title": "Sensor de distancia",
  "level": 3,
  "about": "El HC-SR04 mide la distancia con ultrasonidos. Mueve el control de distancia y mira el monitor.",
  "uno": "// HC-SR04: TRIG en 3, ECHO en 2\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(3, OUTPUT);\n  pinMode(2, INPUT);\n}\n\nvoid loop() {\n  digitalWrite(3, LOW);  delayMicroseconds(2);\n  digitalWrite(3, HIGH); delayMicroseconds(10);\n  digitalWrite(3, LOW);\n  long us = pulseIn(2, HIGH);\n  Serial.print(us / 58);\n  Serial.println(\" cm\");\n  delay(300);\n}\n"
 },
 "lcd": {
  "title": "Pantalla LCD",
  "level": 3,
  "about": "Escribe en una pantalla 16×2 conectada en modo de 4 bits.",
  "uno": "// LCD 16x2: RS=12, E=11, D4=5, D5=4, D6=3, D7=2\n#include <LiquidCrystal.h>\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);\n\nvoid setup() {\n  lcd.begin(16, 2);\n  lcd.print(\"Hola, Plato!\");\n}\n\nvoid loop() {\n  lcd.setCursor(0, 1);\n  lcd.print(millis() / 1000);\n  lcd.print(\" s\");\n  delay(200);\n}\n"
 },
 "luz": {
  "title": "Luz de noche",
  "level": 2,
  "about": "Con poca luz se enciende el LED. Mueve el control de luz del sensor.",
  "uno": "// Sensor de luz en A0: más voltaje = más oscuro\nvoid setup() {\n  pinMode(13, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int oscuridad = analogRead(A0);\n  digitalWrite(13, oscuridad > 600 ? HIGH : LOW);\n  Serial.println(oscuridad);\n  delay(200);\n}\n"
 }
};

// Contexto de una placa: dónde va cada cosa y cómo se escribe cada pin en su lenguaje
export function ctx(key) {
  const b = BOARDS[key]; const r = { ...b.roles }; r.sem = r.sem || [r.led, r.out2, r.out3]; r.pwm = r.pwm || r.led; r.buzz = r.buzz || r.led;
  // Patas del I2C: las de la placa (Uno A4/A5, Pico GP4/GP5…) o las que usa I2C(n) por defecto
  const i2 = b.engine === 'avr' ? ['A5', 'A4'] : b.key === 'nanorp' ? ['A5', 'A4'] : b.engine === 'pico' ? ['GP5', 'GP4'] : b.i2c ? Object.values(b.i2c)[0].map(k => pinOfKey(b, k)) : [r.out2, r.out3];
  r.scl = r.scl || i2[0]; r.sda = r.sda || i2[1]; r.i2cId = b.i2c ? Object.keys(b.i2c)[0] : '0';
  const id = b.id; const sbc = b.flavor === 'linux';
  const c = {
    b, r, id, X: sbc ? 60 : b.px, Y: sbc ? b.py : 0,
    pin: role => `${id}:${Array.isArray(role) ? role : (r[role] || role)}`, at: p => `${id}:${p}`,
    GND: `${id}:${r.gnd}`, VCC: `${id}:${r.vcc}`, V5: `${id}:${r.v5}`, board: P(b.tag, id, b.place[0], b.place[1]),
    // literal del pin en el código
    lit: pin => { if (b.flavor === 'linux') return b.lib === 'gpiozero' ? String(PHYS2BCM[pin]) : String(pin); if (b.flavor === 'stm32') return `'${b.codeName ? pin : keyOf(b, pin)}'`; let k = keyOf(b, pin); if (b.num) k = b.num(k); return /^\d+$/.test(k) ? k : `'${k}'`; },
    // cómo se llama el pin en los comentarios
    say: pin => { if (b.flavor === 'linux') return b.lib === 'gpiozero' ? `GPIO${PHYS2BCM[pin]} (pin físico ${pin})` : `el pin ${pin}`; if (b.flavor === 'esp32') { const k = keyOf(b, pin); return k === pin ? `GPIO${k}` : `${pin}/GPIO${k}`; } if (b.flavor === 'stm32') return b.codeName ? `${pin}/${keyOf(b, pin)}` : pin; if (b.key === 'nanorp') return `${pin}/GPIO${keyOf(b, pin)}`; return pin; },
  };
  return c;
}
const at = (c, l, t) => [c.X + l, c.Y + t];

/* ---------- Código por tipo de placa ---------- */
// Cada función recibe el contexto y devuelve el programa (o null si esa placa no puede: p. ej. sin entradas analógicas).
const MPY = {
  adc: (c, pin) => c.b.flavor === 'esp32' ? `ADC(Pin(${c.lit(pin)}), atten=ADC.ATTN_11DB)   # 0-3,3 V` : `ADC(${c.lit(pin)})`,
  boardLed: c => { const b = c.b;
    if (b.led && b.led.key) { const k = b.num ? b.num(b.led.key) : b.led.key; const lit = /^\d+$/.test(k) ? k : `"${k}"`; return { init: `placa = Pin(${lit}, Pin.OUT)   # el LED de la propia placa${b.led.low ? ' (se enciende con 0)' : ''}`, step: 'placa.toggle()' }; }
    if (b.rgb) return { init: `import neopixel\nrgb = neopixel.NeoPixel(Pin(${b.rgb}), 1)   # el LED RGB de la placa\ncolor = 0`, step: 'color = (color + 1) % 3\n    rgb[0] = [(40, 0, 0), (0, 40, 0), (0, 0, 40)][color]\n    rgb.write()' };
    return null; },
};
const CODE = {
  blink: {
    mpy: c => { const L = MPY.boardLed(c); return `# Parpadeo: el LED de ${c.say(c.r.led)} se enciende y se apaga
from machine import Pin
import time

led = Pin(${c.lit(c.r.led)}, Pin.OUT)
${L ? L.init + '\n' : ''}
while True:
    led.toggle()
${L ? '    ' + L.step + '\n' : ''}    time.sleep(0.5)
`; },
    stm32: c => `# Parpadeo: el LED de ${c.say(c.r.led)} y el de la placa
from machine import Pin
import pyb

led = Pin(${c.lit(c.r.led)}, Pin.OUT)
placa = pyb.LED(1)   # el LED de la propia placa

while True:
    led.value(not led.value())
    placa.toggle()
    pyb.delay(500)
`,
    rpigpio: c => `# Parpadeo: un LED en ${c.say(c.r.led)}
import ${c.b.lib} as GPIO
import time

LED = ${c.lit(c.r.led)}
GPIO.setmode(GPIO.BOARD)      # numeración física (la de la cabecera)
GPIO.setup(LED, GPIO.OUT)

try:
    while True:
        GPIO.output(LED, GPIO.HIGH)
        time.sleep(0.5)
        GPIO.output(LED, GPIO.LOW)
        time.sleep(0.5)
finally:
    GPIO.cleanup()
`,
    gpiozero: c => `# Parpadeo: un LED en ${c.say(c.r.led)}
from gpiozero import LED
from time import sleep

led = LED(${c.lit(c.r.led)})

while True:
    led.toggle()
    sleep(0.5)
`,
    wiringpi: c => `# Parpadeo: un LED en ${c.say(c.r.led)}
import wiringpi as wp

LED = ${c.lit(c.r.led)}
wp.wiringPiSetupPhys()        # numeración física
wp.pinMode(LED, wp.OUTPUT)

while True:
    wp.digitalWrite(LED, wp.HIGH)
    wp.delay(500)
    wp.digitalWrite(LED, wp.LOW)
    wp.delay(500)
`,
  },
  semaforo: {
    mpy: c => `# Semáforo: rojo (${c.say(c.r.sem[0])}), ámbar (${c.say(c.r.sem[1])}) y verde (${c.say(c.r.sem[2])})
from machine import Pin
import time

rojo, ambar, verde = Pin(${c.lit(c.r.sem[0])}, Pin.OUT), Pin(${c.lit(c.r.sem[1])}, Pin.OUT), Pin(${c.lit(c.r.sem[2])}, Pin.OUT)

def luz(led, segundos):
    led.on()
    time.sleep(segundos)
    led.off()

while True:
    luz(verde, 3)
    luz(ambar, 1)
    luz(rojo, 3)
`,
    stm32: c => `# Semáforo: rojo (${c.say(c.r.sem[0])}), ámbar (${c.say(c.r.sem[1])}) y verde (${c.say(c.r.sem[2])})
from machine import Pin
import pyb

rojo, ambar, verde = Pin(${c.lit(c.r.sem[0])}, Pin.OUT), Pin(${c.lit(c.r.sem[1])}, Pin.OUT), Pin(${c.lit(c.r.sem[2])}, Pin.OUT)

def luz(led, ms):
    led.high()
    pyb.delay(ms)
    led.low()

while True:
    luz(verde, 3000)
    luz(ambar, 1000)
    luz(rojo, 3000)
`,
    rpigpio: c => `# Semáforo: rojo (${c.say(c.r.sem[0])}), ámbar (${c.say(c.r.sem[1])}) y verde (${c.say(c.r.sem[2])})
import ${c.b.lib} as GPIO
import time

ROJO, AMBAR, VERDE = ${c.lit(c.r.sem[0])}, ${c.lit(c.r.sem[1])}, ${c.lit(c.r.sem[2])}
GPIO.setmode(GPIO.BOARD)
GPIO.setup([ROJO, AMBAR, VERDE], GPIO.OUT, initial=GPIO.LOW)

def luz(pin, segundos):
    GPIO.output(pin, GPIO.HIGH)
    time.sleep(segundos)
    GPIO.output(pin, GPIO.LOW)

try:
    while True:
        luz(VERDE, 3)
        luz(AMBAR, 1)
        luz(ROJO, 3)
finally:
    GPIO.cleanup()
`,
    gpiozero: c => `# Semáforo: rojo (${c.say(c.r.sem[0])}), ámbar (${c.say(c.r.sem[1])}) y verde (${c.say(c.r.sem[2])})
from gpiozero import LED
from time import sleep

rojo, ambar, verde = LED(${c.lit(c.r.sem[0])}), LED(${c.lit(c.r.sem[1])}), LED(${c.lit(c.r.sem[2])})

def luz(led, segundos):
    led.on()
    sleep(segundos)
    led.off()

while True:
    luz(verde, 3)
    luz(ambar, 1)
    luz(rojo, 3)
`,
    wiringpi: c => `# Semáforo: rojo (${c.say(c.r.sem[0])}), ámbar (${c.say(c.r.sem[1])}) y verde (${c.say(c.r.sem[2])})
import wiringpi as wp

ROJO, AMBAR, VERDE = ${c.lit(c.r.sem[0])}, ${c.lit(c.r.sem[1])}, ${c.lit(c.r.sem[2])}
wp.wiringPiSetupPhys()
for p in (ROJO, AMBAR, VERDE):
    wp.pinMode(p, wp.OUTPUT)

def luz(pin, ms):
    wp.digitalWrite(pin, wp.HIGH)
    wp.delay(ms)
    wp.digitalWrite(pin, wp.LOW)

while True:
    luz(VERDE, 3000)
    luz(AMBAR, 1000)
    luz(ROJO, 3000)
`,
  },
  boton: {
    mpy: c => `# Botón en ${c.say(c.r.btn)} (a GND) y LED en ${c.say(c.r.led)}
from machine import Pin

boton = Pin(${c.lit(c.r.btn)}, Pin.IN, Pin.PULL_UP)   # sin pulsar lee 1; pulsado, 0
led = Pin(${c.lit(c.r.led)}, Pin.OUT)

while True:
    led.value(1 if boton.value() == 0 else 0)
`,
    stm32: c => `# Botón en ${c.say(c.r.btn)} (a GND) y LED en ${c.say(c.r.led)}
from machine import Pin

boton = Pin(${c.lit(c.r.btn)}, Pin.IN, Pin.PULL_UP)   # sin pulsar lee 1; pulsado, 0
led = Pin(${c.lit(c.r.led)}, Pin.OUT)

while True:
    led.value(1 if boton.value() == 0 else 0)
`,
    rpigpio: c => `# Botón en ${c.say(c.r.btn)} (a GND) y LED en ${c.say(c.r.led)}
import ${c.b.lib} as GPIO
import time

BOTON, LED = ${c.lit(c.r.btn)}, ${c.lit(c.r.led)}
GPIO.setmode(GPIO.BOARD)
GPIO.setup(BOTON, GPIO.IN, pull_up_down=GPIO.PUD_UP)   # sin pulsar lee 1; pulsado, 0
GPIO.setup(LED, GPIO.OUT)

while True:
    GPIO.output(LED, GPIO.input(BOTON) == 0)
    time.sleep(0.01)
`,
    gpiozero: c => `# Botón en ${c.say(c.r.btn)} (a GND) y LED en ${c.say(c.r.led)}
from gpiozero import LED, Button
from signal import pause

boton = Button(${c.lit(c.r.btn)})      # con pull-up: pulsado = conectado a GND
led = LED(${c.lit(c.r.led)})

boton.when_pressed = led.on
boton.when_released = led.off
pause()
`,
    wiringpi: c => `# Botón en ${c.say(c.r.btn)} (a GND) y LED en ${c.say(c.r.led)}
import wiringpi as wp

BOTON, LED = ${c.lit(c.r.btn)}, ${c.lit(c.r.led)}
wp.wiringPiSetupPhys()
wp.pinMode(BOTON, wp.INPUT)
wp.pullUpDnControl(BOTON, wp.PUD_UP)
wp.pinMode(LED, wp.OUTPUT)

while True:
    wp.digitalWrite(LED, 1 if wp.digitalRead(BOTON) == 0 else 0)
    wp.delay(10)
`,
  },
  pot: {
    mpy: c => `# Potenciómetro en ${c.say(c.r.adc)} regula el brillo del LED de ${c.say(c.r.pwm)} (PWM)
from machine import Pin, ADC, PWM
import time

pot = ${MPY.adc(c, c.r.adc)}
led = PWM(Pin(${c.lit(c.r.pwm)}))
led.freq(1000)

while True:
    valor = pot.read_u16()      # 0 … 65535
    led.duty_u16(valor)
    print(valor)
    time.sleep(0.05)
`,
    stm32: c => { const t = c.b.tim[c.b.codeName ? keyOf(c.b, c.r.pwm) : c.r.pwm] || [1, 1]; return `# Potenciómetro en ${c.say(c.r.adc)} regula el brillo del LED de ${c.say(c.r.pwm)} (PWM)
from machine import Pin, ADC
import pyb

pot = ADC(Pin(${c.lit(c.r.adc)}))
tim = pyb.Timer(${t[0]}, freq=1000)    # en el STM32 el PWM sale de un temporizador
led = tim.channel(${t[1]}, pyb.Timer.PWM, pin=Pin(${c.lit(c.r.pwm)}))

while True:
    valor = pot.read_u16()      # 0 … 65535
    led.pulse_width_percent(valor * 100 / 65535)
    print(valor)
    pyb.delay(50)
`; },
  },
  servo: {
    mpy: c => `# El servo de ${c.say(c.r.pwm)} sigue al potenciómetro de ${c.say(c.r.adc)}
from machine import Pin, ADC, PWM
import time

pot = ${MPY.adc(c, c.r.adc)}
servo = PWM(Pin(${c.lit(c.r.pwm)}))
servo.freq(50)                 # 50 pulsos por segundo

def angulo(grados):
    us = 500 + grados * 2000 / 180          # de 0,5 ms a 2,5 ms
    servo.duty_u16(int(us * 65535 / 20000))

while True:
    angulo(pot.read_u16() * 180 / 65535)
    time.sleep(0.02)
`,
    stm32: c => { const t = c.b.tim[c.b.codeName ? keyOf(c.b, c.r.pwm) : c.r.pwm] || [1, 1]; return `# El servo de ${c.say(c.r.pwm)} sigue al potenciómetro de ${c.say(c.r.adc)}
from machine import Pin, ADC
import pyb

pot = ADC(Pin(${c.lit(c.r.adc)}))
tim = pyb.Timer(${t[0]}, freq=50)      # 50 pulsos por segundo
servo = tim.channel(${t[1]}, pyb.Timer.PWM, pin=Pin(${c.lit(c.r.pwm)}))

def angulo(grados):
    ms = 0.5 + grados * 2 / 180             # de 0,5 ms a 2,5 ms de cada 20 ms
    servo.pulse_width_percent(ms * 100 / 20)

while True:
    angulo(pot.read_u16() * 180 / 65535)
    pyb.delay(20)
`; },
    rpigpio: c => `# Un servo en ${c.say(c.r.pwm)} barre de 0 a 180 grados${c.b.pwmPins ? `\n# (en esta placa el PWM solo existe en los pines ${c.b.pwmPins.join(' y ')})` : ''}
import ${c.b.lib} as GPIO
import time

SERVO = ${c.lit(c.r.pwm)}
GPIO.setmode(GPIO.BOARD)
GPIO.setup(SERVO, GPIO.OUT)
pwm = GPIO.PWM(SERVO, 50)      # 50 Hz
pwm.start(0)

def angulo(grados):
    pwm.ChangeDutyCycle(2.5 + grados / 18)  # 2,5 % (0°) … 12,5 % (180°)

try:
    while True:
        for g in range(0, 181, 10):
            angulo(g); time.sleep(0.05)
        for g in range(180, -1, -10):
            angulo(g); time.sleep(0.05)
finally:
    pwm.stop(); GPIO.cleanup()
`,
    gpiozero: c => `# Un servo en ${c.say(c.r.pwm)} barre de un lado a otro
from gpiozero import AngularServo
from time import sleep

servo = AngularServo(${c.lit(c.r.pwm)}, min_angle=0, max_angle=180, min_pulse_width=0.0005, max_pulse_width=0.0025)

while True:
    for g in range(0, 181, 10):
        servo.angle = g; sleep(0.05)
    for g in range(180, -1, -10):
        servo.angle = g; sleep(0.05)
`,
    wiringpi: c => `# Un servo en ${c.say(c.r.pwm)} barre de 0 a 180 grados (PWM por software, 50 Hz)
import wiringpi as wp

SERVO = ${c.lit(c.r.pwm)}
wp.wiringPiSetupPhys()
wp.softPwmCreate(SERVO, 0, 200)   # rango 200 = 20 ms, cada paso 0,1 ms

def angulo(grados):
    wp.softPwmWrite(SERVO, int(5 + grados * 20 / 180))   # 0,5 ms … 2,5 ms

while True:
    for g in range(0, 181, 10):
        angulo(g); wp.delay(50)
    for g in range(180, -1, -10):
        angulo(g); wp.delay(50)
`,
  },
  melodia: {
    mpy: c => `# Zumbador en ${c.say(c.r.buzz)}
from machine import Pin, PWM
import time

zumbador = PWM(Pin(${c.lit(c.r.buzz)}))
for nota in [262, 294, 330, 349, 392, 440, 494, 523]:
    zumbador.freq(nota)
    zumbador.duty_u16(32768)
    time.sleep(0.25)
    zumbador.duty_u16(0)
    time.sleep(0.05)
print("¡Fin!")
`,
    stm32: c => { const t = c.b.tim[c.b.codeName ? keyOf(c.b, c.r.buzz) : c.r.buzz] || [1, 1]; return `# Zumbador en ${c.say(c.r.buzz)}
from machine import Pin
import pyb

tim = pyb.Timer(${t[0]}, freq=440)
zumbador = tim.channel(${t[1]}, pyb.Timer.PWM, pin=Pin(${c.lit(c.r.buzz)}))
for nota in [262, 294, 330, 349, 392, 440, 494, 523]:
    tim.freq(nota)
    zumbador.pulse_width_percent(50)
    pyb.delay(250)
    zumbador.pulse_width_percent(0)
    pyb.delay(50)
print("¡Fin!")
`; },
    rpigpio: c => `# Zumbador en ${c.say(c.r.buzz)}
import ${c.b.lib} as GPIO
import time

ZUMBADOR = ${c.lit(c.r.buzz)}
GPIO.setmode(GPIO.BOARD)
GPIO.setup(ZUMBADOR, GPIO.OUT)
pwm = GPIO.PWM(ZUMBADOR, 440)
for nota in [262, 294, 330, 349, 392, 440, 494, 523]:
    pwm.ChangeFrequency(nota)
    pwm.start(50)
    time.sleep(0.25)
    pwm.ChangeDutyCycle(0)
    time.sleep(0.05)
pwm.stop(); GPIO.cleanup()
print("¡Fin!")
`,
    gpiozero: c => `# Zumbador en ${c.say(c.r.buzz)}
from gpiozero import TonalBuzzer
from time import sleep

zumbador = TonalBuzzer(${c.lit(c.r.buzz)})
for nota in [262, 294, 330, 349, 392, 440, 494, 523]:
    zumbador.play(nota)
    sleep(0.25)
    zumbador.stop()
    sleep(0.05)
print("¡Fin!")
`,
    wiringpi: c => `# Zumbador en ${c.say(c.r.buzz)}
import wiringpi as wp

ZUMBADOR = ${c.lit(c.r.buzz)}
wp.wiringPiSetupPhys()
wp.softToneCreate(ZUMBADOR)
for nota in [262, 294, 330, 349, 392, 440, 494, 523]:
    wp.softToneWrite(ZUMBADOR, nota)
    wp.delay(250)
    wp.softToneWrite(ZUMBADOR, 0)
    wp.delay(50)
print("¡Fin!")
`,
  },
  distancia: {
    mpy: c => `# HC-SR04: TRIG en ${c.say(c.r.trig)}, ECHO en ${c.say(c.r.echo)}
from machine import Pin, time_pulse_us
import time

trig = Pin(${c.lit(c.r.trig)}, Pin.OUT)
eco = Pin(${c.lit(c.r.echo)}, Pin.IN)

while True:
    trig.off(); time.sleep_us(2)
    trig.on(); time.sleep_us(10)
    trig.off()
    us = time_pulse_us(eco, 1, 30000)
    print(us // 58, "cm")
    time.sleep(0.3)
`,
    stm32: c => `# HC-SR04: TRIG en ${c.say(c.r.trig)}, ECHO en ${c.say(c.r.echo)}
from machine import Pin, time_pulse_us
import pyb

trig = Pin(${c.lit(c.r.trig)}, Pin.OUT)
eco = Pin(${c.lit(c.r.echo)}, Pin.IN)

while True:
    trig.low(); pyb.udelay(2)
    trig.high(); pyb.udelay(10)
    trig.low()
    us = time_pulse_us(eco, 1, 30000)
    print(us // 58, "cm")
    pyb.delay(300)
`,
    rpigpio: c => `# HC-SR04: TRIG en ${c.say(c.r.trig)}, ECHO en ${c.say(c.r.echo)}
# Ojo en la placa real: el ECHO del sensor da 5 V; pon un divisor de tensión (1 kΩ + 2 kΩ) para bajarlo a 3,3 V.
import ${c.b.lib} as GPIO
import time

TRIG, ECHO = ${c.lit(c.r.trig)}, ${c.lit(c.r.echo)}
GPIO.setmode(GPIO.BOARD)
GPIO.setup(TRIG, GPIO.OUT, initial=GPIO.LOW)
GPIO.setup(ECHO, GPIO.IN)

def distancia():
    GPIO.output(TRIG, GPIO.HIGH); time.sleep(0.00001); GPIO.output(TRIG, GPIO.LOW)
    t0 = time.time()
    while GPIO.input(ECHO) == 0 and time.time() - t0 < 0.05: pass
    ini = time.time()
    while GPIO.input(ECHO) == 1 and time.time() - ini < 0.05: pass
    return (time.time() - ini) * 17150   # velocidad del sonido / 2, en cm

while True:
    print(round(distancia()), "cm")
    time.sleep(0.3)
`,
    gpiozero: c => `# HC-SR04: TRIG en ${c.say(c.r.trig)}, ECHO en ${c.say(c.r.echo)}
# Ojo en la placa real: el ECHO del sensor da 5 V; pon un divisor de tensión (1 kΩ + 2 kΩ).
from gpiozero import DistanceSensor
from time import sleep

sensor = DistanceSensor(echo=${c.lit(c.r.echo)}, trigger=${c.lit(c.r.trig)}, max_distance=4)

while True:
    print(round(sensor.distance * 100), "cm")
    sleep(0.3)
`,
    wiringpi: c => `# HC-SR04: TRIG en ${c.say(c.r.trig)}, ECHO en ${c.say(c.r.echo)}
# Ojo en la placa real: el ECHO del sensor da 5 V; pon un divisor de tensión (1 kΩ + 2 kΩ).
import wiringpi as wp

TRIG, ECHO = ${c.lit(c.r.trig)}, ${c.lit(c.r.echo)}
wp.wiringPiSetupPhys()
wp.pinMode(TRIG, wp.OUTPUT); wp.pinMode(ECHO, wp.INPUT)

def distancia():
    wp.digitalWrite(TRIG, 1); wp.delayMicroseconds(10); wp.digitalWrite(TRIG, 0)
    t0 = wp.micros()
    while wp.digitalRead(ECHO) == 0 and wp.micros() - t0 < 50000: pass
    ini = wp.micros()
    while wp.digitalRead(ECHO) == 1 and wp.micros() - ini < 50000: pass
    return (wp.micros() - ini) / 58

while True:
    print(round(distancia()), "cm")
    wp.delay(300)
`,
  },
  lcd: {
    mpy: c => lcdPy(c, 'from machine import Pin\nimport time', p => `Pin(${c.lit(p)}, Pin.OUT)`, 'p.value((v >> i) & 1)', 'e.on(); time.sleep_us(1); e.off(); time.sleep_us(50)', 'rs.value(es_dato)', 'time.sleep_ms', 'time.sleep(1)', 'rs.off()'),
    stm32: c => lcdPy(c, 'from machine import Pin\nimport pyb', p => `Pin(${c.lit(p)}, Pin.OUT)`, 'p.value((v >> i) & 1)', 'e.high(); pyb.udelay(1); e.low(); pyb.udelay(50)', 'rs.value(es_dato)', 'pyb.delay', 'pyb.delay(1000)', 'rs.low()'),
    rpigpio: c => lcdPy(c, `import ${c.b.lib} as GPIO\nimport time\n\nGPIO.setmode(GPIO.BOARD)\nGPIO.setup([${c.r.lcd.map(c.lit).join(', ')}], GPIO.OUT, initial=GPIO.LOW)`, p => c.lit(p), 'GPIO.output(p, (v >> i) & 1)', 'GPIO.output(e, 1); time.sleep(0.000001); GPIO.output(e, 0); time.sleep(0.00005)', 'GPIO.output(rs, es_dato)', 'esperar', 'time.sleep(1)', 'GPIO.output(rs, 0)', 'def esperar(ms): time.sleep(ms / 1000)'),
    gpiozero: c => lcdPy(c, 'from gpiozero import LED as Salida\nfrom time import sleep', p => `Salida(${c.lit(p)})`, 'p.value = (v >> i) & 1', 'e.on(); sleep(0.000001); e.off(); sleep(0.00005)', 'rs.value = es_dato', 'esperar', 'sleep(1)', 'rs.off()', 'def esperar(ms): sleep(ms / 1000)'),
    wiringpi: c => lcdPy(c, `import wiringpi as wp\n\nwp.wiringPiSetupPhys()\nfor p in (${c.r.lcd.map(c.lit).join(', ')}):\n    wp.pinMode(p, wp.OUTPUT)`, p => c.lit(p), 'wp.digitalWrite(p, (v >> i) & 1)', 'wp.digitalWrite(e, 1); wp.delayMicroseconds(1); wp.digitalWrite(e, 0); wp.delayMicroseconds(50)', 'wp.digitalWrite(rs, es_dato)', 'wp.delay', 'wp.delay(1000)', 'wp.digitalWrite(rs, 0)'),
  },
  oled: {
    mpy: c => `# Pantalla OLED SSD1306 por I2C: SDA en ${c.say(c.r.sda)}, SCL en ${c.say(c.r.scl)}
from machine import Pin, I2C
import ssd1306, time

i2c = I2C(${c.r.i2cId}, sda=Pin(${c.lit(c.r.sda)}), scl=Pin(${c.lit(c.r.scl)}))
print("Dispositivos I2C:", [hex(d) for d in i2c.scan()])
oled = ssd1306.SSD1306_I2C(128, 64, i2c)

n = 0
while True:
    oled.fill(0)
    oled.text("Hola, Plato!", 0, 0)
    oled.text("Cuenta: %d" % n, 0, 16)
    oled.rect(0, 34, 128, 18, 1)
    oled.fill_rect(2, 36, n % 125, 14, 1)
    oled.show()
    n += 1
    time.sleep(0.05)
`,
    stm32: c => `# Pantalla OLED SSD1306 por I2C(${c.r.i2cId}): SDA en ${c.say(c.r.sda)}, SCL en ${c.say(c.r.scl)}
from machine import I2C
import ssd1306, pyb

i2c = I2C(${c.r.i2cId})
print("Dispositivos I2C:", [hex(d) for d in i2c.scan()])
oled = ssd1306.SSD1306_I2C(128, 64, i2c)

n = 0
while True:
    oled.fill(0)
    oled.text("Hola, Plato!", 0, 0)
    oled.text("Cuenta: %d" % n, 0, 16)
    oled.rect(0, 34, 128, 18, 1)
    oled.fill_rect(2, 36, n % 125, 14, 1)
    oled.show()
    n += 1
    pyb.delay(50)
`,
    cpp: () => `// Pantalla OLED SSD1306 por I2C (SDA = A4, SCL = A5)
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 oled(128, 64, &Wire, -1);
int n = 0;

void setup() {
  oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  oled.setTextColor(SSD1306_WHITE);
}

void loop() {
  oled.clearDisplay();
  oled.setCursor(0, 0);  oled.print("Hola, Plato!");
  oled.setCursor(0, 16); oled.print("Cuenta: "); oled.print(n);
  oled.drawRect(0, 34, 128, 18, SSD1306_WHITE);
  oled.fillRect(2, 36, n % 125, 14, SSD1306_WHITE);
  oled.display();
  n++;
  delay(50);
}
`,
  },
  anillo: {
    mpy: c => `# Anillo de 16 NeoPixel (WS2812) en ${c.say(c.r.led)}: un arcoíris que gira
from machine import Pin
import neopixel, time

N = 16
anillo = neopixel.NeoPixel(Pin(${c.lit(c.r.led)}), N)

def rueda(p):   # 0..255 -> color del arcoíris
    if p < 85: return (255 - p * 3, p * 3, 0)
    if p < 170: p -= 85; return (0, 255 - p * 3, p * 3)
    p -= 170; return (p * 3, 0, 255 - p * 3)

paso = 0
while True:
    for i in range(N):
        r, g, b = rueda((i * 256 // N + paso) & 255)
        anillo[i] = (r // 6, g // 6, b // 6)   # flojito: 16 LEDs a tope chupan casi 1 A
    anillo.write()
    paso = (paso + 8) & 255
    time.sleep(0.03)
`,
    cpp: c => `// Anillo de 16 NeoPixel (WS2812) en el pin ${c.r.led}: un arcoíris que gira
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel anillo(16, ${c.r.led}, NEO_GRB + NEO_KHZ800);
uint16_t paso = 0;

void setup() {
  anillo.begin();
  anillo.setBrightness(40);   // flojito: 16 LEDs a tope chupan casi 1 A
}

void loop() {
  for (int i = 0; i < 16; i++) anillo.setPixelColor(i, anillo.gamma32(anillo.ColorHSV(paso + i * 4096)));
  anillo.show();
  paso += 1024;
  delay(30);
}
`,
  },
  luz: {
    mpy: c => `# Sensor de luz en ${c.say(c.r.adc)}: más voltaje = más oscuro
from machine import Pin, ADC
import time

sensor = ${MPY.adc(c, c.r.adc)}
led = Pin(${c.lit(c.r.led)}, Pin.OUT)

while True:
    oscuridad = sensor.read_u16()
    led.value(1 if oscuridad > 38000 else 0)
    print(oscuridad)
    time.sleep(0.2)
`,
    stm32: c => `# Sensor de luz en ${c.say(c.r.adc)}: más voltaje = más oscuro
from machine import Pin, ADC
import pyb

sensor = ADC(Pin(${c.lit(c.r.adc)}))
led = Pin(${c.lit(c.r.led)}, Pin.OUT)

while True:
    oscuridad = sensor.read_u16()
    led.value(1 if oscuridad > 38000 else 0)
    print(oscuridad)
    pyb.delay(200)
`,
  },
};
// LCD 16x2 en modo de 4 bits, escrito a mano (sin librerías) para que se vea cómo funciona
function lcdPy(c, head, mk, setBit, pulse, setRs, sleepMs, sleep1, rsOff, extra = '') {
  const [RS, E, ...D] = c.r.lcd;
  return `# LCD 16x2 en 4 bits: RS=${c.say(RS)}, E=${c.say(E)}, D4..D7=${D.map(c.say).join(', ')}
${head}
${extra ? extra + '\n' : ''}
rs, e = ${mk(RS)}, ${mk(E)}
datos = [${D.map(mk).join(', ')}]

def nibble(v):
    for i, p in enumerate(datos):
        ${setBit}
    ${pulse}

def enviar(v, es_dato):
    ${setRs}
    nibble(v >> 4); nibble(v & 15)

def comando(v): enviar(v, 0)
def texto(s):
    for ch in s:
        enviar(ord(ch), 1)

${sleepMs}(50); ${rsOff}
for v in (3, 3, 3, 2):
    nibble(v); ${sleepMs}(5)
for cmd in (0x28, 0x0C, 0x06, 0x01):
    comando(cmd); ${sleepMs}(2)
texto("Hola, Plato!")
n = 0
while True:
    comando(0xC0)
    texto(str(n) + " s ")
    n += 1
    ${sleep1}
`;
}
const NEW = { oled: { title: 'Pantalla OLED', level: 2, about: 'Texto y una barra que avanza en una pantalla OLED de 128×64 por I2C. Mira el bus en el analizador lógico (📈).' },
  anillo: { title: 'Anillo NeoPixel', level: 2, about: 'Un arcoíris girando en 16 LEDs WS2812 con un solo pin. El tren de pulsos de 800 kHz se simula entero.' } };
const flavorOf = b => b.flavor === 'cpp' ? 'cpp' : b.flavor === 'linux' ? ({ 'gpiozero': 'gpiozero', 'wiringpi': 'wiringpi' }[b.lib] || 'rpigpio') : b.flavor === 'stm32' ? 'stm32' : 'mpy';
export function exampleCode(ex, key) { const b = BOARDS[key]; const f = flavorOf(b); if (f === 'cpp') return UNO[ex.id] ? UNO[ex.id].uno : CODE[ex.id].cpp ? CODE[ex.id].cpp(ctx(key)) : null; const g = CODE[ex.id][f]; return g ? g(ctx(key)) : null; }
export const supports = (ex, key) => exampleCode(ex, key) != null;

/* ---------- Circuitos ---------- */
const led = (c, rid, lid, l, t, color, pinRole) => [[P('wokwi-resistor', rid, ...at(c, l, t + 50), { value: '220' }), P('wokwi-led', lid, ...at(c, l + 80, t), { color })], [W(c.pin(pinRole), rid + ':1'), W(rid + ':2', lid + ':A'), W(lid + ':C', c.GND, 'black')]];
const join = (...xs) => [xs.flatMap(x => x[0]), xs.flatMap(x => x[1])];
export const EXAMPLES = [
  { id: 'blink', circuit: c => join(led(c, 'r1', 'led1', 0, 70, 'red', 'led')) },
  { id: 'semaforo', circuit: c => join(...['red', 'yellow', 'green'].map((col, i) => led(c, 'r' + i, 'l' + i, 0, 52 + i * 70, col, c.r.sem[i]))) },
  { id: 'boton', circuit: c => join([[P('wokwi-pushbutton', 'btn', ...at(c, 0, 190), { color: 'green' })], [W(c.pin('btn'), 'btn:1.l', 'blue'), W('btn:2.l', c.GND, 'black')]], led(c, 'r1', 'led1', 0, 52, 'yellow', 'led')) },
  { id: 'pot', circuit: c => join([[P('wokwi-potentiometer', 'pot', ...at(c, 0, 180))], [W('pot:GND', c.GND, 'black'), W('pot:VCC', c.VCC, 'red'), W('pot:SIG', c.pin('adc'), 'orange')]], led(c, 'r1', 'led1', 0, 52, 'blue', 'pwm')) },
  { id: 'servo', circuit: c => c.b.flavor === 'linux' ? [[P('wokwi-servo', 'servo', ...at(c, 20, 40))], [W('servo:GND', c.GND, 'black'), W('servo:V+', c.V5, 'red'), W('servo:PWM', c.pin('pwm'), 'orange')]]
    : [[P('wokwi-potentiometer', 'pot', ...at(c, 0, 190)), P('wokwi-servo', 'servo', ...at(c, 20, 40))], [W('pot:GND', c.GND, 'black'), W('pot:VCC', c.VCC, 'red'), W('pot:SIG', c.pin('adc'), 'orange'), W('servo:GND', c.GND, 'black'), W('servo:V+', c.V5, 'red'), W('servo:PWM', c.pin('pwm'), 'orange')]] },
  { id: 'melodia', circuit: c => [[P('wokwi-buzzer', 'bz', ...at(c, 10, 60))], [W('bz:1', c.GND, 'black'), W('bz:2', c.pin('buzz'), 'red')]] },
  { id: 'distancia', circuit: c => [[P('wokwi-hc-sr04', 'sonar', ...at(c, 0, 40))], [W('sonar:VCC', c.V5, 'red'), W('sonar:GND', c.GND, 'black'), W('sonar:TRIG', c.pin('trig'), 'blue'), W('sonar:ECHO', c.pin('echo'), 'green')]] },
  { id: 'lcd', circuit: c => [[P('wokwi-lcd1602', 'lcd', ...at(c, -10, 20), { pins: 'full' })],
    [W('lcd:VSS', c.GND, 'black'), W('lcd:VDD', c.V5, 'red'), W('lcd:RW', c.GND, 'black'), W('lcd:A', c.V5, 'red'), W('lcd:K', c.GND, 'black'), ...['RS', 'E', 'D4', 'D5', 'D6', 'D7'].map((k, i) => W('lcd:' + k, c.at(c.r.lcd[i]), 'blue'))]] },
  { id: 'oled', circuit: c => [[P('wokwi-ssd1306', 'oled', ...at(c, 0, 40))], [W('oled:GND', c.GND, 'black'), W('oled:VIN', c.VCC, 'red'), W('oled:DATA', c.pin('sda'), 'blue'), W('oled:CLK', c.pin('scl'), 'yellow')]] },
  { id: 'anillo', circuit: c => [[P('wokwi-led-ring', 'anillo', ...at(c, 10, 30), { pixels: '16' })], [W('anillo:GND', c.GND, 'black'), W('anillo:VCC', c.V5, 'red'), W('anillo:DIN', c.pin('led'), 'green')]] },
  { id: 'luz', circuit: c => join([[P('wokwi-photoresistor-sensor', 'ldr', ...at(c, -20, 200))], [W('ldr:VCC', c.VCC, 'red'), W('ldr:GND', c.GND, 'black'), W('ldr:AO', c.pin('adc'), 'orange')]], led(c, 'r1', 'led1', 0, 52, 'white', 'led')) },
].map(e => ({ ...e, ...(UNO[e.id] || NEW[e.id]) }));
export function exampleCircuit(ex, key) { const c = ctx(key); const [parts, connections] = ex.circuit(c); return { version: 1, author: 'Plató', editor: 'plato-taller', parts: [c.board, ...parts], connections }; }
// El programa «de fábrica» de cada placa: lo que trae dentro al sacarla de la caja (un parpadeo)
export const insideCode = key => exampleCode(EXAMPLES[0], key);

// Programas ya compilados para Uno (para probar sin servidor). Clave: el código sin comentarios ni espacios.
export const norm = s => String(s || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, '');
export const PREBUILT = { [norm(UNO.blink.uno)]: 'taller/hex/blink.hex.txt' };
