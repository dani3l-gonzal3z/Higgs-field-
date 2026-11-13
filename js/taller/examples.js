// Ejemplos del Taller: cada uno trae el circuito (formato diagram.json) y el código para Uno (C++) y Pico (MicroPython).
const P = (type, id, left, top, attrs = {}, rotate = 0) => ({ type, id, left, top, rotate, attrs });
const W = (a, b, color = 'green') => [a, b, color, []];
// Placa a la izquierda; piezas a la derecha. B = id de la placa, pin(n) = nombre del pin según la placa.
const pin = (b, uno, pico) => b === 'uno' ? `uno:${uno}` : `pico:${pico}`;
const GND = b => b === 'uno' ? 'uno:GND.2' : 'pico:GND.4';
const VCC = b => b === 'uno' ? 'uno:5V' : 'pico:3V3';
const board = b => b === 'uno' ? P('wokwi-arduino-uno', 'uno', 0, 40) : P('wokwi-pi-pico', 'pico', 40, 20);
const X = b => b === 'uno' ? 330 : 200;

export const EXAMPLES = [
  { id: 'blink', title: 'Parpadeo', level: 1, about: 'Un LED que se enciende y se apaga cada medio segundo. El «hola mundo» de la electrónica.',
    circuit: b => [[board(b), P('wokwi-resistor', 'r1', X(b), 120, { value: '220' }), P('wokwi-led', 'led1', X(b) + 80, 70, { color: 'red' })],
      [W(pin(b, '13', 'GP15'), 'r1:1'), W('r1:2', 'led1:A'), W('led1:C', GND(b), 'black')]],
    uno: `// Parpadeo: el LED del pin 13 se enciende y se apaga
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
    pico: `# Parpadeo: el LED del pin GP15 se enciende y se apaga
from machine import Pin
import time

led = Pin(15, Pin.OUT)
placa = Pin(25, Pin.OUT)   # el LED verde de la propia Pico

while True:
    led.toggle()
    placa.toggle()
    time.sleep(0.5)
` },
  { id: 'semaforo', title: 'Semáforo', level: 1, about: 'Tres LEDs que siguen el ciclo verde, ámbar y rojo.',
    circuit: b => [[board(b), ...['red', 'yellow', 'green'].flatMap((c, i) => [P('wokwi-resistor', 'r' + i, X(b), 100 + i * 70, { value: '220' }), P('wokwi-led', 'l' + i, X(b) + 80, 52 + i * 70, { color: c })])],
      [0, 1, 2].flatMap(i => [W(pin(b, ['12', '11', '10'][i], ['GP15', 'GP14', 'GP13'][i]), 'r' + i + ':1'), W('r' + i + ':2', 'l' + i + ':A'), W('l' + i + ':C', GND(b), 'black')])],
    uno: `// Semáforo: rojo (12), ámbar (11) y verde (10)
const int ROJO = 12, AMBAR = 11, VERDE = 10;

void setup() {
  pinMode(ROJO, OUTPUT); pinMode(AMBAR, OUTPUT); pinMode(VERDE, OUTPUT);
}

void luz(int pin, int ms) {
  digitalWrite(pin, HIGH); delay(ms); digitalWrite(pin, LOW);
}

void loop() {
  luz(VERDE, 3000);
  luz(AMBAR, 1000);
  luz(ROJO, 3000);
}
`,
    pico: `# Semáforo: rojo (GP15), ámbar (GP14) y verde (GP13)
from machine import Pin
import time

rojo, ambar, verde = Pin(15, Pin.OUT), Pin(14, Pin.OUT), Pin(13, Pin.OUT)

def luz(led, segundos):
    led.on()
    time.sleep(segundos)
    led.off()

while True:
    luz(verde, 3)
    luz(ambar, 1)
    luz(rojo, 3)
` },
  { id: 'boton', title: 'Botón y LED', level: 1, about: 'Mientras pulsas el botón, el LED se enciende. Usa la resistencia interna del pin (pull-up).',
    circuit: b => [[board(b), P('wokwi-pushbutton', 'btn', X(b), 190, { color: 'green' }), P('wokwi-resistor', 'r1', X(b), 100, { value: '220' }), P('wokwi-led', 'led1', X(b) + 80, 52, { color: 'yellow' })],
      [W(pin(b, '2', 'GP14'), 'btn:1.l', 'blue'), W('btn:2.l', GND(b), 'black'), W(pin(b, '13', 'GP15'), 'r1:1'), W('r1:2', 'led1:A'), W('led1:C', GND(b), 'black')]],
    uno: `// Botón en el pin 2 (a GND) y LED en el 13
void setup() {
  pinMode(2, INPUT_PULLUP);   // sin pulsar lee HIGH; pulsado, LOW
  pinMode(13, OUTPUT);
}

void loop() {
  bool pulsado = digitalRead(2) == LOW;
  digitalWrite(13, pulsado ? HIGH : LOW);
}
`,
    pico: `# Botón en GP14 (a GND) y LED en GP15
from machine import Pin

boton = Pin(14, Pin.IN, Pin.PULL_UP)   # sin pulsar lee 1; pulsado, 0
led = Pin(15, Pin.OUT)

while True:
    led.value(1 if boton.value() == 0 else 0)
` },
  { id: 'pot', title: 'Potenciómetro y brillo', level: 2, about: 'Giras el potenciómetro y el LED brilla más o menos (PWM). Pulsa ▶ y mueve la rueda.',
    circuit: b => [[board(b), P('wokwi-potentiometer', 'pot', X(b), 180), P('wokwi-resistor', 'r1', X(b), 100, { value: '220' }), P('wokwi-led', 'led1', X(b) + 80, 52, { color: 'blue' })],
      [W('pot:GND', GND(b), 'black'), W('pot:VCC', VCC(b), 'red'), W('pot:SIG', pin(b, 'A0', 'GP26'), 'orange'), W(pin(b, '9', 'GP15'), 'r1:1'), W('r1:2', 'led1:A'), W('led1:C', GND(b), 'black')]],
    uno: `// Potenciómetro en A0 regula el brillo del LED del pin 9 (PWM)
void setup() {
  Serial.begin(9600);
}

void loop() {
  int lectura = analogRead(A0);          // 0 … 1023
  int brillo = map(lectura, 0, 1023, 0, 255);
  analogWrite(9, brillo);
  Serial.println(lectura);
  delay(50);
}
`,
    pico: `# Potenciómetro en GP26 regula el brillo del LED de GP15 (PWM)
from machine import Pin, ADC, PWM
import time

pot = ADC(26)
led = PWM(Pin(15))
led.freq(1000)

while True:
    valor = pot.read_u16()      # 0 … 65535
    led.duty_u16(valor)
    print(valor)
    time.sleep(0.05)
` },
  { id: 'servo', title: 'Servo con potenciómetro', level: 2, about: 'El servo sigue al potenciómetro: la base de cualquier brazo robótico.',
    circuit: b => [[board(b), P('wokwi-potentiometer', 'pot', X(b), 190), P('wokwi-servo', 'servo', X(b) + 20, 40)],
      [W('pot:GND', GND(b), 'black'), W('pot:VCC', VCC(b), 'red'), W('pot:SIG', pin(b, 'A0', 'GP26'), 'orange'), W('servo:GND', GND(b), 'black'), W('servo:V+', b === 'uno' ? 'uno:5V' : 'pico:VBUS', 'red'), W('servo:PWM', pin(b, '9', 'GP15'), 'orange')]],
    uno: `// El servo del pin 9 sigue al potenciómetro de A0
#include <Servo.h>
Servo brazo;

void setup() {
  brazo.attach(9);
}

void loop() {
  int angulo = map(analogRead(A0), 0, 1023, 0, 180);
  brazo.write(angulo);
  delay(15);
}
`,
    pico: `# El servo de GP15 sigue al potenciómetro de GP26
from machine import Pin, ADC, PWM
import time

pot = ADC(26)
servo = PWM(Pin(15))
servo.freq(50)                 # 50 pulsos por segundo

def angulo(grados):
    us = 500 + grados * 2000 / 180          # de 0,5 ms a 2,5 ms
    servo.duty_u16(int(us * 65535 / 20000))

while True:
    angulo(pot.read_u16() * 180 / 65535)
    time.sleep(0.02)
` },
  { id: 'melodia', title: 'Melodía con zumbador', level: 2, about: 'Toca una melodía cambiando la frecuencia del pin. Sube el volumen.',
    circuit: b => [[board(b), P('wokwi-buzzer', 'bz', X(b) + 10, 60)], [W('bz:1', GND(b), 'black'), W('bz:2', pin(b, '8', 'GP15'), 'red')]],
    uno: `// Zumbador en el pin 8
int notas[] = {262, 294, 330, 349, 392, 440, 494, 523};

void setup() {
  for (int i = 0; i < 8; i++) {
    tone(8, notas[i], 250);
    delay(300);
  }
}

void loop() {}
`,
    pico: `# Zumbador en GP15
from machine import Pin, PWM
import time

zumbador = PWM(Pin(15))
for nota in [262, 294, 330, 349, 392, 440, 494, 523]:
    zumbador.freq(nota)
    zumbador.duty_u16(32768)
    time.sleep(0.25)
    zumbador.duty_u16(0)
    time.sleep(0.05)
print("¡Fin!")
` },
  { id: 'distancia', title: 'Sensor de distancia', level: 3, about: 'El HC-SR04 mide la distancia con ultrasonidos. Mueve el control de distancia y mira el monitor.',
    circuit: b => [[board(b), P('wokwi-hc-sr04', 'sonar', X(b), 40)], [W('sonar:VCC', b === 'uno' ? 'uno:5V' : 'pico:VBUS', 'red'), W('sonar:GND', GND(b), 'black'), W('sonar:TRIG', pin(b, '3', 'GP3'), 'blue'), W('sonar:ECHO', pin(b, '2', 'GP2'), 'green')]],
    uno: `// HC-SR04: TRIG en 3, ECHO en 2
void setup() {
  Serial.begin(9600);
  pinMode(3, OUTPUT);
  pinMode(2, INPUT);
}

void loop() {
  digitalWrite(3, LOW);  delayMicroseconds(2);
  digitalWrite(3, HIGH); delayMicroseconds(10);
  digitalWrite(3, LOW);
  long us = pulseIn(2, HIGH);
  Serial.print(us / 58);
  Serial.println(" cm");
  delay(300);
}
`,
    pico: `# HC-SR04: TRIG en GP3, ECHO en GP2
from machine import Pin, time_pulse_us
import time

trig = Pin(3, Pin.OUT)
eco = Pin(2, Pin.IN)

while True:
    trig.off(); time.sleep_us(2)
    trig.on(); time.sleep_us(10)
    trig.off()
    us = time_pulse_us(eco, 1, 30000)
    print(us // 58, "cm")
    time.sleep(0.3)
` },
  { id: 'lcd', title: 'Pantalla LCD', level: 3, about: 'Escribe en una pantalla 16×2 conectada en modo de 4 bits.',
    circuit: b => [[board(b), P('wokwi-lcd1602', 'lcd', X(b) - 10, 20, { pins: 'full' })],
      [W('lcd:VSS', GND(b), 'black'), W('lcd:VDD', b === 'uno' ? 'uno:5V' : 'pico:VBUS', 'red'), W('lcd:RW', GND(b), 'black'), W('lcd:A', b === 'uno' ? 'uno:5V' : 'pico:VBUS', 'red'), W('lcd:K', GND(b), 'black'),
        ...[['RS', '12', 'GP16'], ['E', '11', 'GP17'], ['D4', '5', 'GP18'], ['D5', '4', 'GP19'], ['D6', '3', 'GP20'], ['D7', '2', 'GP21']].map(([l, u, p]) => W('lcd:' + l, pin(b, u, p), 'blue'))]],
    uno: `// LCD 16x2: RS=12, E=11, D4=5, D5=4, D6=3, D7=2
#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

void setup() {
  lcd.begin(16, 2);
  lcd.print("Hola, Plato!");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print(millis() / 1000);
  lcd.print(" s");
  delay(200);
}
`,
    pico: `# LCD 16x2 en 4 bits: RS=GP16, E=GP17, D4..D7=GP18..GP21
from machine import Pin
import time

rs, e = Pin(16, Pin.OUT), Pin(17, Pin.OUT)
datos = [Pin(n, Pin.OUT) for n in (18, 19, 20, 21)]

def nibble(v):
    for i, p in enumerate(datos):
        p.value((v >> i) & 1)
    e.on(); time.sleep_us(1); e.off(); time.sleep_us(50)

def enviar(v, es_dato):
    rs.value(es_dato)
    nibble(v >> 4); nibble(v & 15)

def comando(v): enviar(v, 0)
def texto(s):
    for ch in s:
        enviar(ord(ch), 1)

time.sleep_ms(50); rs.off()
for v in (3, 3, 3, 2):
    nibble(v); time.sleep_ms(5)
for c in (0x28, 0x0C, 0x06, 0x01):
    comando(c); time.sleep_ms(2)
texto("Hola, Plato!")
n = 0
while True:
    comando(0xC0)
    texto(str(n) + " s ")
    n += 1
    time.sleep(1)
` },
  { id: 'luz', title: 'Luz de noche', level: 2, about: 'Con poca luz se enciende el LED. Mueve el control de luz del sensor.',
    circuit: b => [[board(b), P('wokwi-photoresistor-sensor', 'ldr', X(b) - 20, 200), P('wokwi-resistor', 'r1', X(b), 100, { value: '220' }), P('wokwi-led', 'led1', X(b) + 80, 52, { color: 'white' })],
      [W('ldr:VCC', VCC(b), 'red'), W('ldr:GND', GND(b), 'black'), W('ldr:AO', pin(b, 'A0', 'GP26'), 'orange'), W(pin(b, '13', 'GP15'), 'r1:1'), W('r1:2', 'led1:A'), W('led1:C', GND(b), 'black')]],
    uno: `// Sensor de luz en A0: más voltaje = más oscuro
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int oscuridad = analogRead(A0);
  digitalWrite(13, oscuridad > 600 ? HIGH : LOW);
  Serial.println(oscuridad);
  delay(200);
}
`,
    pico: `# Sensor de luz en GP26: más voltaje = más oscuro
from machine import Pin, ADC
import time

sensor = ADC(26)
led = Pin(15, Pin.OUT)

while True:
    oscuridad = sensor.read_u16()
    led.value(1 if oscuridad > 38000 else 0)
    print(oscuridad)
    time.sleep(0.2)
` },
];
export function exampleCircuit(ex, b) { const [parts, connections] = ex.circuit(b); return { version: 1, author: 'Plató', editor: 'plato-taller', parts, connections }; }

// Programas ya compilados para Uno (para probar sin servidor). Clave: el código sin comentarios ni espacios.
export const norm = s => String(s || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, '');
export const PREBUILT = {
  [norm(EXAMPLES[0].uno)]: 'taller/hex/blink.hex',
};
