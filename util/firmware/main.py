# Útil HIL de Plató — firmware para Raspberry Pi Pico / Pico 2 con MicroPython (1.20 o más nuevo).
# Pone la placa bajo prueba en el bucle: lo que la planta simulada «ve» sale por los pines DO/AO/encoder,
# y lo que la placa manda (DI/AI/UART) vuelve a Plató por USB, con su hora en microsegundos.
#
# Protocolo por USB (líneas de texto, se puede probar con cualquier terminal serie):
#   Plató → útil                                    útil → Plató
#   ?                 identificación                ID platohil <versión> <chip>
#   O ch v            salida digital DOch = v       I ch v t      flanco en DIch (t en µs)
#   M máscara         las 8 DO de golpe (hex)       D máscara t   estado de las DI (cada R ms)
#   S t ch v          DOch = v en el instante t     V a0 a1 a2    entradas analógicas (0-65535)
#   A ch n            AOch = n (0-4095)             F ch hz duty  PWM medido en DIch
#   Y 0|1             DAC con referencia VDD/2,048 V  U hex       bytes que llegan por el UART
#   E hz [cpr]        encoder (negativo = al revés) T t           hora del útil (µs)
#   P ch 0|1          medir PWM en DIch             H t           latido cada 0,5 s
#   N ch 0|1          invertir DIch (optoacopladores) ! texto     aviso o error
#   B baudios / U hex UART hacia la placa
#   R ms              periodo de informes (20 por defecto)
#   W ms / K máscara  vigilancia: sin noticias en W ms, DO = K y encoder parado
#   T                 pedir la hora    X              todo a reposo
import sys, select, time, rp2
from machine import Pin, ADC, I2C, UART, Timer

VERSION = '1.0'
DO_PINS = [2, 3, 4, 5, 6, 7, 8, 9]
DI_PINS = [13, 14, 15, 16, 17, 18, 19, 22]
ENC_A, ENC_Z = 10, 12
ADC_PINS = [26, 27, 28]
ticks, tdiff = time.ticks_us, time.ticks_diff

do = [Pin(p, Pin.OUT, value=0) for p in DO_PINS]
di = [Pin(p, Pin.IN) for p in DI_PINS]
adc = [ADC(p) for p in ADC_PINS]
inv = [False] * 8
out = sys.stdout

def send(s):
    out.write(s + '\n')

# ── Entradas con su hora: la interrupción guarda el flanco y el bucle principal lo manda ──
events = []
def watch(k):
    def h(pin): events.append((k, pin.value() ^ inv[k], ticks()))
    return h
for i, p in enumerate(di): p.irq(watch(i), Pin.IRQ_RISING | Pin.IRQ_FALLING)

# ── DAC MCP4728 (I2C0 en GP20/GP21) ──
try:
    i2c = I2C(0, sda=Pin(20), scl=Pin(21), freq=400000)
    DAC = 0x60 if 0x60 in i2c.scan() else None
except Exception:
    i2c, DAC = None, None
ao = [0, 0, 0, 0]
def dac_write():
    if DAC is None: return
    b = bytearray(8)
    for k in range(4):
        b[2 * k] = (ao[k] >> 8) & 0x0F; b[2 * k + 1] = ao[k] & 0xFF
    i2c.writeto(DAC, b)   # «fast write»: los 4 canales a la vez

# ── Encoder: un PIO recorre los cuatro estados de la cuadratura; X = espera entre estados ──
@rp2.asm_pio(set_init=(rp2.PIO.OUT_LOW, rp2.PIO.OUT_LOW))
def quad_fwd():
    wrap_target()
    set(pins, 0)
    mov(y, x)
    label('d0')
    jmp(y_dec, 'd0')
    set(pins, 1)
    mov(y, x)
    label('d1')
    jmp(y_dec, 'd1')
    set(pins, 3)
    mov(y, x)
    label('d2')
    jmp(y_dec, 'd2')
    set(pins, 2)
    mov(y, x)
    label('d3')
    jmp(y_dec, 'd3')
    pull(noblock)
    mov(x, osr)
    wrap()
@rp2.asm_pio(set_init=(rp2.PIO.OUT_LOW, rp2.PIO.OUT_LOW))
def quad_rev():
    wrap_target()
    set(pins, 0)
    mov(y, x)
    label('d0')
    jmp(y_dec, 'd0')
    set(pins, 2)
    mov(y, x)
    label('d1')
    jmp(y_dec, 'd1')
    set(pins, 3)
    mov(y, x)
    label('d2')
    jmp(y_dec, 'd2')
    set(pins, 1)
    mov(y, x)
    label('d3')
    jmp(y_dec, 'd3')
    pull(noblock)
    mov(x, osr)
    wrap()
ENC_SM_FREQ = 10_000_000          # cada ciclo, 0,1 µs
enc = {'sm': None, 'dir': 0, 'hz': 0, 'cpr': 0}
zpin = Pin(ENC_Z, Pin.OUT, value=0)
ztimer = Timer()
def zpulse(t):
    zpin.value(1); time.sleep_us(20); zpin.value(0)
def encoder(hz, cpr=0):
    d = 0 if hz == 0 else (1 if hz > 0 else -1); hz = abs(hz)
    if enc['sm'] and d != enc['dir']:
        enc['sm'].active(0); enc['sm'] = None
        try: rp2.PIO(1).remove_program(quad_fwd if enc['dir'] > 0 else quad_rev)   # deja sitio en la memoria del PIO
        except Exception: pass
    ztimer.deinit()
    if d == 0:
        Pin(ENC_A, Pin.OUT, value=0); Pin(ENC_A + 1, Pin.OUT, value=0); enc.update(dir=0, hz=0); return
    n = max(0, int(ENC_SM_FREQ / (4 * hz)) - 3)   # 3 ciclos fijos por estado
    if not enc['sm']:
        sm = rp2.StateMachine(4, quad_fwd if d > 0 else quad_rev, freq=ENC_SM_FREQ, set_base=Pin(ENC_A))   # PIO1, máquina 0
        sm.put(n); sm.exec('pull()'); sm.exec('mov(x, osr)'); sm.active(1); enc['sm'] = sm
    else:
        enc['sm'].put(n)
    enc.update(dir=d, hz=hz, cpr=cpr)
    if cpr > 0 and hz / cpr >= 0.05:
        ztimer.init(freq=hz / cpr, callback=zpulse)

# ── Medida de PWM: un PIO cuenta los ciclos en alto y en bajo de cada periodo ──
@rp2.asm_pio()
def pwm_meas():
    wrap_target()
    mov(x, invert(null))
    wait(0, pin, 0)
    wait(1, pin, 0)
    label('hi')
    jmp(x_dec, 'h2')
    label('h2')
    jmp(pin, 'hi')
    mov(isr, x)
    push(noblock)
    mov(x, invert(null))
    label('lo')
    jmp(pin, 'done')
    jmp(x_dec, 'lo')
    label('done')
    mov(isr, x)
    push(noblock)
    wrap()
MEAS_FREQ = 50_000_000
meas = {}                      # canal → (máquina de estados, número de máquina)
def measure(ch, on):
    if ch in meas:
        meas[ch][0].active(0); del meas[ch]
        di[ch].irq(watch(ch), Pin.IRQ_RISING | Pin.IRQ_FALLING)
    if not on: return
    used = [m[1] for m in meas.values()]; free = [i for i in (0, 1, 2, 3, 5, 6, 7) if i not in used]
    if not free: send('! no quedan máquinas PIO para medir'); return
    di[ch].irq(None)
    sm = rp2.StateMachine(free[0], pwm_meas, freq=MEAS_FREQ, in_base=di[ch], jmp_pin=di[ch]); sm.active(1); meas[ch] = (sm, free[0])
def read_meas(ch, sm):
    hi = lo = None
    while sm.rx_fifo() >= 2:
        a = sm.get(); b = sm.get(); hi = (0xFFFFFFFF - a) * 2; lo = (0xFFFFFFFF - b) * 2 + 2
    if hi is None: return None
    per = hi + lo
    return (MEAS_FREQ / per if per else 0, hi / per if per else 0)

# ── UART hacia la placa (se abre con la primera orden B o U) ──
uart = None
def uart_open(baud=115200):
    global uart
    uart = UART(0, baud, tx=Pin(0), rx=Pin(1))

# ── Estado general ──
sched = []          # órdenes programadas: (t, canal, valor)
report_ms = 20
watch_ms, safe_mask = 0, 0
last_rx = time.ticks_ms()
last_rep = last_hb = time.ticks_ms()

def set_mask(m):
    for k in range(8): do[k].value((m >> k) & 1)
def safe():
    set_mask(safe_mask); encoder(0); sched.clear()

def command(line):
    global report_ms, watch_ms, safe_mask
    p = line.split()
    if not p: return
    c = p[0]
    try:
        if c == 'O': do[int(p[1])].value(int(p[2]))
        elif c == 'M': set_mask(int(p[1], 16))
        elif c == 'S': sched.append((int(p[1]), int(p[2]), int(p[3])))
        elif c == 'A': ao[int(p[1])] = max(0, min(4095, int(p[2]))); dac_write()
        elif c == 'Y':
            if DAC is not None: i2c.writeto(DAC, bytes([0x8F if p[1] == '1' else 0x80])); i2c.writeto(DAC, bytes([0xCF if p[1] == '1' else 0xC0]))
        elif c == 'E': encoder(float(p[1]), int(p[2]) if len(p) > 2 else 0)
        elif c == 'P': measure(int(p[1]), p[2] == '1')
        elif c == 'N': inv[int(p[1])] = p[2] == '1'
        elif c == 'B': uart_open(int(p[1]))
        elif c == 'U':
            if uart is None: uart_open()
            uart.write(bytes.fromhex(p[1]))
        elif c == 'R': report_ms = max(5, int(p[1]))
        elif c == 'W': watch_ms = int(p[1])
        elif c == 'K': safe_mask = int(p[1], 16)
        elif c == 'T': send('T %d' % ticks())
        elif c == 'X': safe()
        elif c == '?': send('ID platohil %s %s DAC:%s' % (VERSION, sys.implementation._machine if hasattr(sys.implementation, '_machine') else 'rp2', 'si' if DAC is not None else 'no'))
        else: send('! orden desconocida: ' + c)
    except Exception as e:
        send('! %s: %s' % (line, e))

def di_mask():
    m = 0
    for k in range(8): m |= (di[k].value() ^ inv[k]) << k
    return m

poll = select.poll(); poll.register(sys.stdin, select.POLLIN)
buf = ''
send('ID platohil %s listo' % VERSION)
while True:
    # 1) lo que manda Plató
    while poll.poll(0):
        ch = sys.stdin.read(1)
        if ch == '\n' or ch == '\r':
            if buf: command(buf); buf = ''
            last_rx = time.ticks_ms()
        else:
            buf += ch
    now = ticks()
    # 2) órdenes programadas que ya tocan
    if sched:
        keep = []
        for ev in sched:
            if tdiff(ev[0], now) <= 0: do[ev[1]].value(ev[2])
            else: keep.append(ev)
        sched[:] = keep
    # 3) flancos de las entradas
    if events:
        evs = events[:]; del events[:len(evs)]
        for chn, v, t in evs: send('I %d %d %d' % (chn, v, t))
    # 4) informes periódicos
    ms = time.ticks_ms()
    if time.ticks_diff(ms, last_rep) >= report_ms:
        last_rep = ms
        send('V %d %d %d' % (adc[0].read_u16(), adc[1].read_u16(), adc[2].read_u16()))
        for chn, m in meas.items():
            r = read_meas(chn, m[0])
            if r: send('F %d %.1f %.4f' % (chn, r[0], r[1]))
        if uart and uart.any(): send('U ' + uart.read().hex())
        send('D %02x %d' % (di_mask(), now))
    if time.ticks_diff(ms, last_hb) >= 500:
        last_hb = ms; send('H %d' % now)
    # 5) vigilancia: si Plató se calla, todo a reposo
    if watch_ms and time.ticks_diff(ms, last_rx) > watch_ms:
        safe(); last_rx = ms; send('! vigilancia: sin noticias de Plató, salidas a reposo')
