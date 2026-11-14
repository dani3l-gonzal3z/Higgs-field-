// Programas de control para las plantas de ejemplo, escritos para la placa elegida y las señales tal como estén conectadas.
// Python (MicroPython o Python de placa Linux) y Arduino C++. La lógica es la misma en todos: máquina de estados sin esperas.
import { BOARDS, keyOf } from './boards.js';
import { ctx } from './examples.js';
import { MODULES } from './plant.js';

const label = (P, k) => { const [id, s] = k.split('.'); const m = P.modules.find(x => x.id === id); const io = m && MODULES[m.type].io.find(x => x[0] === s); return io ? io[3] : k; };

// Nombres en el programa → señal de la planta
const USES = {
  clasificadora: { MOTOR: 'C1.motor', COLOR: 'CS1.det', FOTO: 'FC1.det', EMPUJA: 'P1.ext', RECOGIDO: 'P1.in', MARCHA: 'PB1.marcha', PARO: 'PB1.paro', SETA: 'PB1.seta', VERDE: 'L1.verde', ROJO: 'L1.rojo', AMBAR: 'L1.ambar' },
  pesaje: { MOTOR: 'C1.motor', FOTO: 'FC1.det', TOPE: 'T1.sube', PESO: 'B1.peso', EMPUJA: 'P1.ext', RECOGIDO: 'P1.in', MARCHA: 'PB1.marcha', PARO: 'PB1.paro', SETA: 'PB1.seta', VERDE: 'L1.verde', ROJO: 'L1.rojo' },
  dos: { MOTOR1: 'C1.motor', MOTOR2: 'C2.motor', FOTO1: 'FC1.det', FOTO2: 'FC2.det', MARCHA: 'PB1.marcha', PARO: 'PB1.paro', SETA: 'PB1.seta', VERDE: 'L1.verde', ROJO: 'L1.rojo' },
};
export const PLANT_SIGNALS = Object.fromEntries(Object.entries(USES).map(([k, v]) => [k, Object.values(v)]));

// Lógica en Python: usa .value() de sus entradas y salidas, ms() y peso() (kg)
const PY = {
  clasificadora: `
cola = []            # una entrada por pieza entre el sensor de color y la fotocélula: True = roja
hay_antes = False
foto_antes = False
t_empuje = None
estado = 'PARADA'

while True:
    if not SETA.value():                     # seta pulsada (NC: abierta = 0)
        estado = 'EMERGENCIA'
    if estado == 'EMERGENCIA':
        MOTOR.value(0); EMPUJA.value(0); VERDE.value(0)
        ROJO.value((ms() // 300) % 2)          # rojo parpadeando
        if SETA.value() and MARCHA.value():  # rearme: seta soltada + marcha
            estado = 'PARADA'; cola = []
    elif estado == 'PARADA':
        MOTOR.value(0); ROJO.value(0); VERDE.value(0); AMBAR.value(1)
        if MARCHA.value() and PARO.value():
            estado = 'MARCHA'
    elif estado == 'MARCHA':
        MOTOR.value(1); VERDE.value(1); AMBAR.value(0); ROJO.value(0)
        if not PARO.value():
            estado = 'PARADA'
    # seguimiento de piezas: el sensor de color «ve» cada pieza al pasar; la fotocélula marca cuándo llega al cilindro
    hay = COLOR_HAY.value() if COLOR_HAY else COLOR.value()
    if hay and not hay_antes:                # llega una pieza nueva al sensor
        cola.append(False)
    if hay and COLOR.value() and cola:       # mientras está delante, si se ve roja, se apunta
        cola[-1] = True
    hay_antes = hay
    foto = FOTO.value()
    if foto and not foto_antes and cola:
        if cola.pop(0) and estado == 'MARCHA':
            EMPUJA.value(1); t_empuje = ms()
    foto_antes = foto
    if t_empuje is not None and ms() - t_empuje > 400:
        EMPUJA.value(0); t_empuje = None
    pausa(0.005)
`,
  pesaje: `
LIMITE = 1.1           # kg: lo que pase de aquí se rechaza
estado = 'PARADA'
fase = 'LIBRE'         # LIBRE → PESANDO → (RECHAZO) → SALIDA
t = 0

while True:
    if not SETA.value():
        estado = 'EMERGENCIA'
    if estado == 'EMERGENCIA':
        MOTOR.value(0); EMPUJA.value(0); TOPE.value(0); VERDE.value(0)
        ROJO.value((ms() // 300) % 2)
        if SETA.value() and MARCHA.value():
            estado = 'PARADA'; fase = 'LIBRE'
        pausa(0.01); continue
    if estado == 'PARADA':
        MOTOR.value(0); VERDE.value(0); ROJO.value(0)
        if MARCHA.value() and PARO.value():
            estado = 'MARCHA'
        pausa(0.01); continue
    if not PARO.value():
        estado = 'PARADA'
    VERDE.value(1)
    if fase == 'LIBRE':
        TOPE.value(1); MOTOR.value(1)
        if FOTO.value():                      # la caja llega al tope
            fase = 'PESANDO'; t = ms()
    elif fase == 'PESANDO':
        MOTOR.value(0)
        if ms() - t > 700:                    # espera a que la báscula se asiente
            kg = peso()
            print('caja: %.2f kg' % kg)
            if kg > LIMITE:
                fase = 'RECHAZO'; EMPUJA.value(1); ROJO.value(1); t = ms()
            else:
                fase = 'SALIDA'; TOPE.value(0); MOTOR.value(1); t = ms()
    elif fase == 'RECHAZO':
        if ms() - t > 500:
            EMPUJA.value(0); ROJO.value(0)
            if RECOGIDO.value() if RECOGIDO else True:
                fase = 'LIBRE'
    elif fase == 'SALIDA':
        if not FOTO.value() and ms() - t > 800:
            fase = 'LIBRE'
    pausa(0.01)
`,
  dos: `
estado = 'PARADA'
t2 = ms() - 10000

while True:
    if not SETA.value() or not PARO.value():
        if estado == 'MARCHA': print('paro')
        estado = 'PARADA'
    if estado == 'PARADA':
        MOTOR1.value(0); MOTOR2.value(0); VERDE.value(0); ROJO.value(0 if SETA.value() else 1)
        if MARCHA.value() and PARO.value() and SETA.value():
            estado = 'MARCHA'
    else:
        VERDE.value(1)
        # la segunda cinta arranca cuando le llega una pieza y sigue 3 s más
        if FOTO1.value():
            t2 = ms()
        m2 = ms() - t2 < 3000
        MOTOR2.value(1 if m2 else 0)
        # acumulación: si la salida está ocupada y la segunda cinta parada, la primera espera
        lleno = FOTO2.value()
        MOTOR1.value(0 if (lleno or (FOTO1.value() and not m2)) else 1)
    pausa(0.01)
`,
};

// La misma lógica en Arduino C++
const CPP = {
  clasificadora: `
int estado = 0;               // 0 parada · 1 marcha · 2 emergencia
bool cola[16]; int n = 0;     // piezas entre el sensor de color y la fotocélula (true = roja)
bool hayAntes = false, fotoAntes = false; unsigned long tEmpuje = 0; bool empujando = false;

void loop() {
  if (!digitalRead(SETA)) estado = 2;
  if (estado == 2) { digitalWrite(MOTOR, LOW); digitalWrite(EMPUJA, LOW); digitalWrite(VERDE, LOW); digitalWrite(ROJO, (millis() / 300) % 2);
    if (digitalRead(SETA) && digitalRead(MARCHA)) { estado = 0; n = 0; } }
  else if (estado == 0) { digitalWrite(MOTOR, LOW); digitalWrite(ROJO, LOW); digitalWrite(VERDE, LOW); digitalWrite(AMBAR, HIGH); if (digitalRead(MARCHA) && digitalRead(PARO)) estado = 1; }
  else { digitalWrite(MOTOR, HIGH); digitalWrite(VERDE, HIGH); digitalWrite(AMBAR, LOW); digitalWrite(ROJO, LOW); if (!digitalRead(PARO)) estado = 0; }
  bool hay = HAY_PIN >= 0 ? digitalRead(HAY_PIN) : digitalRead(COLOR);
  if (hay && !hayAntes && n < 16) cola[n++] = false;   // llega una pieza nueva al sensor
  if (hay && digitalRead(COLOR) && n) cola[n - 1] = true;
  hayAntes = hay;
  bool foto = digitalRead(FOTO);
  if (foto && !fotoAntes && n) { bool roja = cola[0]; for (int i = 1; i < n; i++) cola[i - 1] = cola[i]; n--; if (roja && estado == 1) { digitalWrite(EMPUJA, HIGH); tEmpuje = millis(); empujando = true; } }
  fotoAntes = foto;
  if (empujando && millis() - tEmpuje > 400) { digitalWrite(EMPUJA, LOW); empujando = false; }
  delay(5);
}
`,
  pesaje: `
const float LIMITE = 1.1;     // kg
int estado = 0, fase = 0;     // fase: 0 libre · 1 pesando · 2 rechazo · 3 salida
unsigned long t = 0;

void loop() {
  if (!digitalRead(SETA)) estado = 2;
  if (estado == 2) { digitalWrite(MOTOR, LOW); digitalWrite(EMPUJA, LOW); digitalWrite(TOPE, LOW); digitalWrite(VERDE, LOW); digitalWrite(ROJO, (millis() / 300) % 2);
    if (digitalRead(SETA) && digitalRead(MARCHA)) { estado = 0; fase = 0; } delay(10); return; }
  if (estado == 0) { digitalWrite(MOTOR, LOW); digitalWrite(VERDE, LOW); digitalWrite(ROJO, LOW); if (digitalRead(MARCHA) && digitalRead(PARO)) estado = 1; delay(10); return; }
  if (!digitalRead(PARO)) estado = 0;
  digitalWrite(VERDE, HIGH);
  if (fase == 0) { digitalWrite(TOPE, HIGH); digitalWrite(MOTOR, HIGH); if (digitalRead(FOTO)) { fase = 1; t = millis(); } }
  else if (fase == 1) { digitalWrite(MOTOR, LOW);
    if (millis() - t > 700) { float kg = analogRead(PESO) * VREF / ADC_MAX / VKG; Serial.print("caja: "); Serial.print(kg); Serial.println(" kg");
      if (kg > LIMITE) { fase = 2; digitalWrite(EMPUJA, HIGH); digitalWrite(ROJO, HIGH); } else { fase = 3; digitalWrite(TOPE, LOW); digitalWrite(MOTOR, HIGH); } t = millis(); } }
  else if (fase == 2) { if (millis() - t > 500) { digitalWrite(EMPUJA, LOW); digitalWrite(ROJO, LOW); fase = 0; } }
  else if (fase == 3) { if (!digitalRead(FOTO) && millis() - t > 800) fase = 0; }
  delay(10);
}
`,
  dos: `
int estado = 0; unsigned long t2 = 0;

void loop() {
  if (!digitalRead(SETA) || !digitalRead(PARO)) estado = 0;
  if (estado == 0) { digitalWrite(MOTOR1, LOW); digitalWrite(MOTOR2, LOW); digitalWrite(VERDE, LOW); digitalWrite(ROJO, digitalRead(SETA) ? LOW : HIGH);
    if (digitalRead(MARCHA) && digitalRead(PARO) && digitalRead(SETA)) estado = 1; }
  else { digitalWrite(VERDE, HIGH);
    if (digitalRead(FOTO1)) t2 = millis();
    bool m2 = millis() - t2 < 3000; digitalWrite(MOTOR2, m2);
    bool lleno = digitalRead(FOTO2); digitalWrite(MOTOR1, (lleno || (digitalRead(FOTO1) && !m2)) ? LOW : HIGH); }
  delay(10);
}
`,
};

// Genera el programa. Devuelve { code, missing: [señales sin conectar] }
export function plantProgram(exId, P, boardKey) {
  const uses = USES[exId]; if (!uses) return null; const b = BOARDS[boardKey]; const map = P.maps.sim;
  const isIn = k => { const [id, s] = k.split('.'); const m = P.modules.find(x => x.id === id); const io = m && MODULES[m.type].io.find(x => x[0] === s); return io && io[1] === 'in'; };
  const optional = new Set(['P1.in']); const missing = Object.values(uses).filter(k => !map[k] && !optional.has(k));
  const vars = Object.entries(uses); if (exId === 'clasificadora') vars.push(['COLOR_HAY', 'CS1.hay']);
  const vk = b.vkg || (P.modules.find(m => m.type === 'bascula') || { p: { vkg: 1 } }).p.vkg;
  const head = `# ${{ clasificadora: 'Clasificadora por color', pesaje: 'Pesaje y rechazo', dos: 'Dos cintas en serie' }[exId]} — programa para la ${b.name}\n# Señales de la planta (pestaña 🏭 Planta). Si cambias una conexión, vuelve a generar el programa.\n`;
  if (b.lang === 'cpp') {
    const lines = vars.map(([n, k]) => map[k] ? `const int ${n === 'COLOR_HAY' ? 'HAY_PIN' : n} = ${keyOf(b, map[k]).replace(/^D(\d+)$/, '$1')};   // ${k} · ${label(P, k)}` : `const int ${n === 'COLOR_HAY' ? 'HAY_PIN' : n} = -1;   // ${k} sin conectar`);
    const setup = vars.filter(([, k]) => map[k] && P.modules.find(m => m.id === k.split('.')[0]) && !(isIn(k) && /peso$/.test(k))).map(([n, k]) => `  pinMode(${n === 'COLOR_HAY' ? 'HAY_PIN' : n}, ${isIn(k) ? 'INPUT' : 'OUTPUT'});`);
    return { missing, code: head.replace(/^#/gm, '//') + lines.join('\n') + `\nconst float VREF = 5.0, ADC_MAX = 1023.0, VKG = ${vk};   // báscula: voltios por kg\n\nvoid setup() {\n  Serial.begin(115200);\n${setup.join('\n')}\n}\n` + CPP[exId] };
  }
  const c = ctx(boardKey); const linux = b.flavor === 'linux'; const lib = /GPIO/.test(b.lib || '') ? b.lib : 'RPi.GPIO';
  const lit = pin => linux ? String(pin) : c.lit(pin);
  const pre = linux ? `import ${lib} as GPIO\nimport time\n\nGPIO.setmode(GPIO.BOARD)\nGPIO.setwarnings(False)\nclass ent:\n    def __init__(s, p): s.p = p; GPIO.setup(p, GPIO.IN)\n    def value(s): return GPIO.input(s.p)\nclass sal:\n    def __init__(s, p): s.p = p; s.v = 0; GPIO.setup(p, GPIO.OUT)\n    def value(s, v=None):\n        if v is None: return s.v\n        s.v = 1 if v else 0; GPIO.output(s.p, s.v)\nms = lambda: int(time.monotonic() * 1000)\npausa = time.sleep\n`
    : `from machine import Pin, ADC\nimport time\n\nent = lambda p: Pin(p, Pin.IN)\nsal = lambda p: Pin(p, Pin.OUT, value=0)\nms = time.ticks_ms\npausa = time.sleep\n`;
  const adc = pin => b.flavor === 'esp32' ? `ADC(Pin(${lit(pin)}), atten=ADC.ATTN_11DB)` : b.flavor === 'stm32' ? `ADC(Pin(${lit(pin)}))` : `ADC(${lit(pin)})`;
  const decl = vars.map(([n, k]) => { const pin = map[k]; const say = pin ? (linux ? `pin ${pin}` : c.say(pin)) : '';
    if (!pin) return `${n} = None   # ${k} sin conectar`;
    if (/\.peso$/.test(k)) return `_peso = ${adc(pin)}   # ${k} · ${say}\npeso = lambda: _peso.read_u16() * 3.3 / 65535 / ${vk}   # kg`;
    return `${n} = ${isIn(k) ? 'ent' : 'sal'}(${lit(pin)})   # ${k} · ${label(P, k)} · ${say}`; });
  return { missing, code: head + pre + '\n' + decl.join('\n') + '\n' + PY[exId] };
}
export const hasProgram = id => !!USES[id];
